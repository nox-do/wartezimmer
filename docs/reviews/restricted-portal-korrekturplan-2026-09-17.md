# Restricted Portal: korrigierter Arbeitsplan

Stand: 17.09.2026

Ausgangsstand: `cc734ec feat: manage restricted portal listener`

Dieser Plan verdichtet den Review zu den nachgewiesenen Produktfehlern. Er ist
kein Auftrag für eine allgemeine Workflow-Engine oder einen vollständigen Umbau
des Setup-Systems.

## Umsetzungsstand

- Arbeitspaket A: umgesetzt und durch Persistenz-/Update-Tests abgedeckt.
- Arbeitspaket B: Exception-Rollback, gestopptes Remove und Host-Mutex umgesetzt.
- Arbeitspaket C: eindeutige Interface-Zuordnung, exakter Runtime-Audit,
  strenger DNS-/TLS-Check und Caddy-Catch-all umgesetzt; reale Listenermatrix
  auf zwei NICs bleibt Produktabnahme.
- Arbeitspaket D: Manager-Reentry, sichere Fehlermeldungen, begrenztes
  Proxy-Vertrauen für Rate-Limits und Dokumentation umgesetzt. Eine allgemeine
  strukturierte Operations-API wird ohne nachgewiesenen Bedarf nicht gebaut.

## 1. Unveränderte Produktgrenze

- Es läuft genau ein Caddy-Container.
- Staff-IP:443 veröffentlicht proxy:443, Restricted-IP:443 veröffentlicht
  proxy:444.
- App und Maintenance bleiben im Proxybetrieb auf Loopback. Globale IPv4- und
  IPv6-Publishes sind unzulässig.
- Staff-Origin ist nur am Staff-Listener, Portal-Origin nur am
  Restricted-Listener erreichbar. Unbekannte oder gekreuzte Host-/SNI-Werte
  erreichen keinen App-Handler.
- Restricted erlaubt nur den Root-Redirect, die expliziten Portal-UI-/Assets
  und `PORTAL_SURFACE_ROUTES`. `PORTAL_INTERNAL_ROUTES` bleibt gesperrt.
- Staff nutzt das Portal intern weiterhin unter `https://staff.<raum>/portal`.
- Managed TLS verwendet dasselbe vorhandene Wildcard-Zertifikat für Staff und
  Portal. Es gibt keine zweite ACME-Order.
- Der Portal-A-Record ist eine extern herzustellende Voraussetzung. Der Manager
  prüft ihn, legt ihn aber nicht an.
- IP-Binding ist keine Zusage zur Netztrennung. Firewall, Routing und getrennte
  Netze bleiben Verantwortung der Praxis-IT.
- Die Kandidatenliste bleibt bewusst breit. Risiken werden markiert, nicht durch
  aggressive Interface-Heuristiken ausgeblendet.
- Windows bleibt nicht freigegeben.

## 2. Produktentscheidung zu Custom TLS

Der aktuelle Portalworkflow beruht auf der Managed-Wildcard-Identität. Custom
TLS besitzt derzeit keinen Portal-Hostnamen und keinen Vertrag für ein Zertifikat
mit Staff- und Portalidentität.

Für diesen Korrekturblock gilt daher:

- Restricted Portal wird nur mit Managed-Wildcard-TLS aktiviert.
- Custom TLS bleibt für den Staff-Origin erhalten, gilt aber nicht als
  vorbereiteter Portalmodus.
- Manager und Setup müssen diese Grenze verständlich anzeigen und fail-closed
  durchsetzen.
- Eine spätere Custom-Portal-Unterstützung ist ein eigener Produktblock.

Damit entfällt ein beiläufiger Mehrhost- und Zertifikatsworkflow für Custom TLS.
Die Staff-Host-/SNI-Prüfung soll dennoch auch im Custom-Modus konsistent sein.

## 3. Arbeitspaket A — Persistenz und Update-Kompatibilität

Zuerst zu beheben, weil vorhandene Installationen sonst widersprüchliche
Sollzustände erhalten können.

### Korrekturen

1. Restricted-Zustand bei Restore als vollständige Einheit behandeln. Fehlt er
   im Backup, darf kein aktueller Aktivierungsmarker geerbt werden. Ein nur
   vorbereitetes Backup darf nicht durch den aktuellen Hostzustand aktiv werden.
2. Allgemeines Setup-Apply muss Restricted-Schlüssel erhalten. Entfernen bleibt
   ausschließlich eine explizite Restricted-Operation.
3. Manager-Bootstrap darf vorhandene Compose-Templates nicht überschreiben.
   Fehlende Dateien werden angelegt; Änderungen erfolgen nur im
   transaktionalen Updatepfad.
4. Restricted-Apply erzeugt die Caddy-Konfiguration aus dem aktuellen Vertrag,
   validiert sie vor der Runtime-Änderung und nimmt sie in Backup/Rollback auf.
   Das manuelle Regenerierungswerkzeug bleibt ein Recovery-Werkzeug, nicht der
   reguläre Aktivierungsweg.

### Abnahme

- Restore-Matrix: aktiv, vorbereitet und nicht vorhanden.
- Erneutes Setup-Apply erhält vorbereiteten und aktiven Restricted-Zustand.
- Ein älterer Manager überschreibt keine von einem Update installierten
  Templates.
- Eine Installation mit älterem generiertem Caddyfile kann Restricted über den
  Manager aktivieren.
- Caddy-Regeneration verändert weder Zertifikate noch ACME-State.

## 4. Arbeitspaket B — Sicherer Apply-/Remove-Lifecycle

Der bestehende Ablauf wird gehärtet, ohne eine allgemeine Workflow-Engine zu
bauen.

### Korrekturen

1. Alle Exceptions nach der ersten Mutation laufen durch denselben Rollback.
2. Rollback stellt Env und generiertes Caddyfile wieder her und prüft den danach
   erwarteten Publish-/Healthzustand.
3. Remove funktioniert bei gestopptem Stack und bei nicht mehr vorhandener
   Restricted-IP. Es entfernt den Sollzustand, ohne laufende Dienste zu fordern.
4. Mutierende Hostoperationen werden backendseitig mit einem einfachen
   Prozess-Mutex serialisiert. Ein paralleler zweiter Apply/Remove/Setup-/TLS-
   Cutover wird verständlich abgewiesen.
5. Ein widersprüchlicher Zustand wird als `degraded` gemeldet. Der nachgewiesene
   Prozessabbruchfall wird jetzt durch ein begrenztes persistentes Apply-/Remove-
   Journal mit geschlossenem Recovery behandelt. Eine allgemeine Polling-API bleibt
   außerhalb des Umfangs. Details: `docs/operations/restricted-lifecycle.md`.

### Abnahme

- Exceptions an jeder Mutationsgrenze hinterlassen keinen fälschlich aktiven
  Zustand.
- Remove funktioniert bei laufendem und gestopptem Stack.
- Parallele Mutationen laufen nicht gleichzeitig.
- „Wiederhergestellt“ wird nur nach erfolgreicher Ergebnisprüfung gemeldet.

## 5. Arbeitspaket C — Runtime- und Proxyvertrag härten

### Korrekturen

1. Prepare, Start, Apply und Inspect prüfen Restricted-IP und gespeicherte
   Interface-Zuordnung konsistent. Mehrdeutige Adressen werden sichtbar
   behandelt; die Kandidatenliste bleibt breit.
2. Inspect verwendet denselben exakten Publish-Audit wie Apply. Zusätzliche
   explizite oder globale Publishes führen zu `degraded`.
3. Portal-DNS gilt nur dann als passend, wenn die Antworten ausschließlich auf
   die Restricted-IP zeigen. Lokale und öffentliche Resolver werden getrennt
   bewertet; Rebind-Hinweise bleiben erhalten.
4. Die positive HTTPS-Probe prüft die tatsächlich ausgelieferte
   Zertifikatsidentität und Gültigkeit. Test-CA-Ausnahmen bleiben auf
   Testumgebungen begrenzt.
5. Caddy weist unbekannte Hosts/SNI auch außerhalb des Wildcard-Matchers
   eindeutig ab. Custom- und Managed-Staff verwenden dieselbe Host-/SNI-Grenze.
6. Der Generator wird zusätzlich über `caddy adapt`/`caddy validate` und eine
   Listener-Matrix getestet. Reine Stringtests genügen nicht.

### Abnahme

- Listener × Host × SNI ist für Staff, Portal und unbekannte Werte geprüft.
- Alle erlaubten Portal-Routen funktionieren; nicht erlaubte UI-/API-Pfade und
  `PORTAL_INTERNAL_ROUTES` sind nicht erreichbar.
- Zusätzliche Publishes und DNS-Antworten werden nicht als gesund gemeldet.
- Ein abgelaufenes, unpassendes oder nicht vertrauenswürdiges Laufzeitzertifikat
  besteht die positive Probe nicht.

## 6. Arbeitspaket D — Manager, Rate-Limit und Dokumentation

### Korrekturen

1. Tabwechsel während Inspect/Prepare/Apply/Remove darf den Restricted-Bereich
   nicht dauerhaft im Ladezustand lassen. Beim erneuten Öffnen wird der aktuelle
   Backendzustand geladen.
2. Restricted-Operationen liefern fachlich kategorisierte, sichere Meldungen.
   Die UI unterscheidet Voraussetzung, zurückgenommene Aktivierung,
   unvollständigen Rollback und ungeklärten Zustand, ohne Compose- oder
   Socketlogs anzuzeigen. Eine allgemeine Operations-API ist dafür nicht nötig.
3. Fastify vertraut ausschließlich dem bekannten Caddy-Hop für die Client-IP.
   Vom Client gelieferte Forwarding-Header dürfen das Portal-Rate-Limit nicht
   umgehen. Verschiedene Patienten erhalten getrennte Buckets.
4. Betriebs- und Plan-Dokumentation werden auf den implementierten Ablauf
   aktualisiert. Historische Ansätze und aktueller Produktstand werden getrennt.
5. Nach den funktionalen Korrekturen werden eindeutig tote Gateway-Branches und
   ungenutzte Restricted-Felder entfernt. Der interne Verify-Endpunkt wird nur
   nach Prüfung seiner fachlichen Aufrufer entfernt.

### Abnahme

- Tabwechsel, langsame Antwort, Fehler und Retry sind getestet.
- Ein unvollständiger Rollback bleibt als solcher sichtbar.
- Zwei Client-IP-Adressen besitzen getrennte Rate-Limit-Buckets;
  gefälschte Forwarding-Header erzeugen keine frei wählbare Identität.
- Dokumentation verspricht weder Host-Firewall noch Netztrennung.

## 7. Produktabnahme nach den Codekorrekturen

Vor einer Produktfreigabe, aber nicht als Voraussetzung für jeden einzelnen
Implementierungsschritt:

- frische Installation und Upgrade einer älteren TLS-Installation,
- aktives und vorbereitetes Binding über Update und Restore,
- Apply/Remove bei laufendem und gestopptem Stack,
- reale Zwei-NIC-Prüfung mit gekreuzten Host-/SNI-Kombinationen,
- DHCP-/Adressverlust, Router-, Docker-Desktop- und Host-Neustart,
- externe IPv4-/IPv6-Negativtests für App-, Maintenance- und Proxyports,
- Installation und Upgrade aus dem DMG,
- dokumentierte macOS-/Docker-Desktop-Matrix.

Windows bleibt bis zu einem eigenen Nachweis ausgeschlossen.

## 8. Bewusst nicht Teil dieses Korrekturblocks

- produktverwaltete Host-Firewall oder Routing,
- automatisches Anlegen des Portal-A-Records,
- vollständige Custom-TLS-Unterstützung für das Portal,
- persistente allgemeine Workflow-Engine,
- Operations-ID-/Polling-Infrastruktur ohne nachgewiesenen Bedarf,
- separate Portal-Datenbank, zweite Installation oder zweiter Proxy-Container,
- Captive-Adapter.
