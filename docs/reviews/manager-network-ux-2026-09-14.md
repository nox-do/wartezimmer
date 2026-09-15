# UX-Bestandsaufnahme: Einrichtung und Manager-Netzwerk

Stand: 14.09.2026. Ursprüngliche Bestandsaufnahme mit anschließendem Umsetzungsstand;
die Abschnitte 1–4 beschreiben den Review vor der Überarbeitung.

## Prüfgrundlage und Grenzen

Geprüft wurden die aktuellen Svelte-Komponenten und ihre View-Models/Controller
im Arbeitsverzeichnis. Wizard-Schritte, Status, Netzwerk und Wartung wurden
zusätzlich mit Originalkomponenten und Original-CSS in einer isolierten
Browser-Vorschau angesehen: zwei beispielhafte lokale IPv4-Adressen, initialer
HTTP-Zugang, HTTP-Proxy und aktives Managed-HTTPS. Keine Verbindung zur Setup-API
oder zu Docker; keine Installation verändert.

Die Vorschau ist kein End-to-End-Test des installierten Electron-Managers.
Ihre zusätzliche Szenario-Navigation gehört nicht zum Produkt. Fehlerzustände,
Wizard-Übergänge, die App-Ops-Einstellung und die globale Statusableitung wurden
ergänzend am Code geprüft. Nicht jeder Fehler-/TLS-Unterzustand wurde visuell
nachgestellt. Fehlende Mock-Antworten sind keine Produkt-Findings.

## 1. Begriffe und Produktmodell

Der initiale Betriebsmodus ist ein vorgesehener interner Betriebszustand, kein
reiner Demo-/Testmodus und kein fehlgeschlagenes Setup. MFA, Terminal, TV und
Administration können intern arbeiten. Auch die interne Nutzung der
Portalfunktion durch Mitarbeitende soll möglich bleiben; sie ist von einem
für Patienten bereitgestellten Zugang zu unterscheiden.

Drei unabhängige Aussagen müssen in der UI getrennt werden:

| Dimension | Zustände / Aussage                                                                     |
| --------- | -------------------------------------------------------------------------------------- |
| Nutzung   | Interner Praxisbetrieb; Patienten-Zugang separat noch nicht eingerichtet               |
| Zugang    | Direkt über HTTP :8080; über Proxy an ausgewählter IPv4 mit HTTP; über Proxy mit HTTPS |
| Laufzeit  | Läuft, startet, gestoppt, Prüfung ausstehend, konkrete Störung                         |

HTTPS ist keine Patientenfreigabe. Das Vorhandensein von `/portal`, die
fachliche Ops-Einstellung `portalEnabled` und ein späterer Restricted-Listener
sind ebenfalls unterschiedliche Dinge.

Empfohlenes Naming:

- Nutzerseitiger Oberbegriff: **Interner Praxisbetrieb**.
- Bei der Ersteinrichtung: **Initialer Betriebsmodus** als Erklärung des
  direkten HTTP-Zugangs; kein dauerhaftes „Demo“-Badge.
- **Praxisadresse** oder **Adresse für Mitarbeitende und Praxisgeräte**;
  „Staff-IP“ bleibt in technischen Details.
- **Zugriff über ausgewählte Adresse** für den Proxy; „Reverse Proxy“ in Details.
- **Verschlüsselte Verbindung (HTTPS)** statt „Schloss im Browser“.
- **Portal – intern nutzen** für den internen Zugang.
- **Patientenzugang: noch nicht eingerichtet** als gesonderte Aussage.

Textvorschlag für den initialen Modus:

> Praxis Flow ist für den internen Betrieb eingerichtet. Mitarbeitende und
> Praxisgeräte verwenden die angezeigte Adresse. Die Verbindung nutzt HTTP und
> ist nicht verschlüsselt; der Browser kann „Nicht sicher“ anzeigen. Der direkte
> Zugang ist über alle Netzwerkanschlüsse dieses Rechners erreichbar. Ein
> separater Zugang für Patienten ist noch nicht eingerichtet.

„Risikofrei“ wäre eine nicht belegbare Zusage. Bei HTTP gibt es kein Zertifikat
und deshalb keinen Zertifikatsfehler. HTTPS mit einem ungültigen oder nicht
vertrauenswürdigen Zertifikat ist dagegen ein Fehlerzustand; die UI soll keine
Routine zum Wegklicken solcher Warnungen etablieren.

## 2. Wizard: Bestandsaufnahme und Änderungen

| Bildschirm         | Ist / UX-Problem                                                                                                                                                            | Kleinste sinnvolle Anpassung                                                                                                                                                                 |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Voraussetzungen    | Docker installiert, Daemon und Compose sind verständlich prüfbar. „Netzwerkvoraussetzungen prüfen / ok“ vermischt Aktion und Ergebnis.                                      | „Lokale Voraussetzungen geprüft“; Ergebnisse konkret nennen, Details bei Fehlern. Keine Aussage über Isolation des Praxisnetzes.                                                             |
| Import & Export    | Zweck und Ordnerwahl sind klar, danach stehen Bind-Mounts, Containerpfade und `.env` im Haupttext.                                                                          | Zweck und Host-Ordner zuerst; Docker-Mounts und Sonderfälle unter „Technische Details“.                                                                                                      |
| Netzwerk           | Dieselbe IP heißt Host, LAN, Staff und Fallback. IP, Rechnername und Domain werden gewählt, bevor im nächsten Schritt der Zugriffsweg feststeht.                            | „Praxisadresse“ konsequent verwenden. Adresse plus Adapter zeigen; im initialen Modus klarstellen, dass die Auswahl keine anderen Anschlüsse sperrt. Eigene Namen als optionale Erweiterung. |
| Zugang             | „Proxy & Patientenportal“ verbindet den aktuellen Staff-Zugang mit einer nicht implementierten Patientenanbindung. Port 80 klingt wie eine reine Komfortoption.             | Titel „Zugriff im Praxisnetz“. Initialen Zugang und Zugriff über ausgewählte Adresse mit Auswirkungen vergleichen. Captive-/Vendor-Platzhalter aus dem Einrichtungsfluss entfernen.          |
| HTTPS-Angebot      | „Schloss im Browser“ beschreibt ein Browser-Symbol; „Später — vorerst nur die IP“ setzt HTTP fälschlich mit IP-Nutzung gleich.                                              | „Verbindung verschlüsseln“ und „Später einrichten – intern über HTTP weiterarbeiten“. Nutzen, Voraussetzungen und Weiterbetrieb knapp erklären.                                              |
| HTTPS-Vorbereitung | DNS, Zertifikat und tatsächliche Umstellung sind schon sauber getrennt. Eigene Domain/PEM und technische DNS-Begriffe dominieren teilweise.                                 | Empfohlenen Weg zuerst, eigene Domain unter „Erweiterte Einrichtung“. Betreiber-Mail und DNS-Wartezeit als konkrete nächste Aufgabe statt als Drohtext erklären.                             |
| Vorschau           | Technische URLs stehen im Zentrum; „Portal“ ist gleichrangig mit MFA. „Ohne Proxy steht HTTPS später nicht zur Verfügung“ klingt endgültig, obwohl Nachrüstung möglich ist. | Modus, Praxisadresse, HTTP/HTTPS, interne Nutzung und Patientenstatus zuerst zusammenfassen. „HTTPS kann später eingerichtet werden“. Portal ausdrücklich intern benennen.                   |
| Abschluss          | `.env geschrieben` und Docker Compose sind die ersten Erfolgssignale. Nächste fachliche Schritte und PIN-Hinweise stehen weit unten.                                        | „Interner Betrieb eingerichtet“ nur nach den vorhandenen Betriebsprüfungen; darunter „MFA öffnen“, „Geräteadressen anzeigen“ und „Administration öffnen“. Technisches Protokoll aufklappbar. |

Belege: [WizardSteps.svelte](../../manager/src/renderer/WizardSteps.svelte),
[WizardHttpsPanel.svelte](../../manager/src/renderer/WizardHttpsPanel.svelte),
[wizard-view-model.ts](../../manager/src/renderer/wizard-view-model.ts),
[ProxySettings.svelte](../../manager/src/renderer/ProxySettings.svelte),
[LanIpPanel.svelte](../../manager/src/renderer/LanIpPanel.svelte).

Mittelfristig sollten „Netzwerk“ und „Zugang“ zu einer zusammenhängenden
Entscheidung werden: Praxisadresse → Zugriffsweg → optionale Verschlüsselung.
Zunächst können die bestehenden Schritte erhalten bleiben; kein vollständiger
Wizard-Neubau nötig. HTTPS später einzurichten muss ein vollwertiger Abschluss
sein, nicht optisch eine unvollständige Installation.

## 3. Management-Oberfläche

### Status

Die Geräte-Links und Kopieraktionen sind nützlich. Die erste Faktenliste zeigt
jedoch Install-Home, Compose und `.env`, während der Betriebsmodus fehlt.
Darüber hinaus gibt es konkrete Inkonsistenzen:

- `currentWlanLabel()` nimmt den ersten LAN-Kandidaten. `statusGridRows()` zeigt
  diesen als „WLAN aktuell“, auch wenn es ein Ethernet-Adapter ist. Stattdessen
  die konfigurierte Praxisadresse ihrem tatsächlich passenden Adapter zuordnen;
  weitere Adressen unter Details anzeigen.
- „LAN in .env“ sollte „Konfigurierte Praxisadresse“ heißen.
- `proxyStatusLabel()` liefert bei gesetztem TLS-Cutover „Läuft · HTTPS“, bevor
  es den Containerzustand prüft. „HTTPS eingerichtet“ und „Proxy läuft“ müssen
  getrennt aus Konfiguration und aktuellem Runtime-Status abgeleitet werden.
- Die Gesamtanzeige „Betrieb“ folgt lokalen/LAN-Health-Probes. Sie ist kein
  Nachweis für korrekte Bindings oder die Sicherheit des Praxisnetzes. Störungen
  aus dem Runtime-Audit brauchen eine sichtbare eigene Zusammenfassung.
- Der kopierbare Link „Portal“ hat keinen internen Nutzungshinweis. Als
  „Portal – intern nutzen“ kennzeichnen; keine Patientenfreigabe daraus ableiten.

Vorschlag für die oberste Zusammenfassung:

> **Interner Praxisbetrieb · läuft**
>
> Verbindung: HTTP · nicht verschlüsselt
>
> Praxisadresse: http://192.168.0.83:8080
>
> Zugang: alle Netzwerkanschlüsse
>
> Patientenzugang: noch nicht eingerichtet

Im Proxy-Modus ersetzt die konkrete Bind-Adresse die Aussage „alle
Netzwerkanschlüsse“. HTTPS-Status, Runtime-Binding und Patientenzugang bleiben
auch dann getrennt. Kein pauschales „sicher eingerichtet“.

Belege: [status-view-model.ts](../../manager/src/renderer/status-view-model.ts),
[health-header.ts](../../manager/src/renderer/health-header.ts),
[DeviceUrls.svelte](../../manager/src/renderer/DeviceUrls.svelte).

### Netzwerk

Die vorhandenen aufklappbaren Bereiche sind eine gute Basis. Aktuell stehen
Praxisadresse, Geräteadresse, Port-80-Proxy und HTTPS relativ unverbunden
nebeneinander. Im initialen Zustand ist das HTTPS-Feld geöffnet und erklärt
warnend, zuerst Port 80 einzuschalten. Das lässt einen absichtlich gewählten
internen HTTP-Betrieb wie einen Mangel wirken.

Vorschlag ohne neuen Haupt-Tab:

1. **Aktueller Zugang**: Modus, wirksame Adresse, Verbindung und Laufzustand.
2. **Praxisadresse ändern**: IP und zugehöriger Adapter; Entwurf und aktive
   Konfiguration unterscheiden, Auswirkungen vor dem Anwenden zeigen.
3. **Verbindung verschlüsseln / HTTPS verwalten**: neutral optional, sofern
   nicht eingerichtet; bei vorbereitetem HTTPS mit konkretem Fortsetzen-Schritt.
4. **Prüfung und Wiederherstellung**: wichtigste Störung plus passende Aktion;
   Bindings, Ports, Protokolle und Prüfumfang unter Details.
5. **Netzwerkübersicht und Hinweise für die Praxis-IT**.

Der Zähler „N ok · M Fehler“ reicht als Hauptdiagnose nicht aus. Stattdessen:

| Zustand                                         | Angezeigte Aussage                                         | Nächster Schritt                                |
| ----------------------------------------------- | ---------------------------------------------------------- | ----------------------------------------------- |
| Initialer Betrieb, Dienste laufen               | „Interner Betrieb über HTTP“                               | MFA/Geräte öffnen; HTTPS optional               |
| Staff-IP fehlt                                  | „Praxisadresse auswählen“                                  | Adresswahl öffnen                               |
| Gespeicherte IP nicht lokal                     | „Die konfigurierte Adresse ist am Rechner nicht vorhanden“ | Anschluss prüfen oder aktuelle Adresse wählen   |
| Bewusst gestoppt                                | „Praxis Flow ist gestoppt“                                 | Starten                                         |
| Proxy fehlt / Start fehlgeschlagen              | „Zugriff eingerichtet, Dienst läuft nicht“                 | Kontrolliert wiederherstellen                   |
| Binding unbekannt                               | „Zugriffsbindung konnte nicht geprüft werden“              | Erneut prüfen, dann Diagnose anzeigen           |
| Unerwartetes/globales Binding bei aktivem Proxy | „Aktuelle Bindung entspricht nicht der Einrichtung“        | Geprüft neu anwenden / reparieren               |
| Container startet                               | „Praxis Flow startet – Prüfung läuft“                      | Warten; bei Timeout konkrete Aktion             |
| HTTPS vorbereitet                               | „HTTPS vorbereitet – aktuell weiterhin HTTP“               | Den tatsächlich nächsten TLS-Schritt fortsetzen |

Besonders wichtig: Nach aktivem TLS-Cutover blendet `NetworkView` den
HTTP-Proxy-Bereich samt `ProxyRecoveryAction` aus. Im aktiven TLS-Panel gibt
es keinen gleichwertigen allgemeinen Proxy-Recovery-Einstieg. Wiederherstellung
muss außerhalb der HTTP-spezifischen Konfiguration auffindbar sein und darf
keine unnötige Zertifikatsneuausstellung bedeuten. Backend-Eignung des jeweiligen
Repair-Pfads vor Umsetzung prüfen; nicht nur einen neuen Button verdrahten.

Belege: [NetworkView.svelte](../../manager/src/renderer/NetworkView.svelte),
[NetworkBindingChecks.svelte](../../manager/src/renderer/NetworkBindingChecks.svelte),
[TlsNetworkPanel.svelte](../../manager/src/renderer/TlsNetworkPanel.svelte).

### Netzwerkdiagramm

Das jetzige Diagramm muss inhaltlich überarbeitet werden. Es setzt Captive für
Patientenbetrieb voraus, zeichnet Internetfreigabe über Adapter ein und
klassifiziert interne Portalnutzung als Entwicklung/Test. Das entspricht nicht
mehr dem beschlossenen Modell. Zudem erhält es nur `lanIp`; es kann den
aktuellen Proxy-/TLS-/Runtime-Zustand nicht darstellen.

Vorschlag:

- Zuerst den **aktuellen internen Betrieb** zeigen: Mitarbeitende/Praxisgeräte →
  angezeigte Adresse → Docker-Publish → gegebenenfalls Caddy → App.
- Docker/Caddy/App als Produktbereich markieren. Betriebssystem-Firewall,
  Router, VLAN, WLAN und Netztrennung außerhalb bei Praxis-IT.
- Initialer Modus: alle Host-Anschlüsse sichtbar, ohne Alarmoptik und ohne
  Behauptung einer Adapterisolation.
- Proxy-Modus: ausgewählte Ziel-IP und tatsächlichen Prüfbefund zeigen;
  daraus keine Filterung nach eingehendem Interface ableiten.
- Interne Portalnutzung durch Mitarbeitende innerhalb des internen Bereichs
  einordnen. Einen zukünftigen Patientenzugang separat als „geplant / noch
  nicht eingerichtet“ zeigen, ohne aktive Freigabe oder funktionierende Route.
- Kein Captive-Zwang, keine Internetfreigabe als heutige Produktfähigkeit.
- Kurze Hinweise: Praxisgeräte müssen die angezeigte Adresse erreichen können;
  Gastnetz-Isolation kann dies verhindern; Host-Firewall/Router durch Praxis-IT
  prüfen lassen; keine Router-Portweiterleitung fürs Internet einrichten.

Das Diagramm benötigt dazu nur einen abgeleiteten Ansichtsvertrag aus bestehenden
Konfigurations-/Runtime-Daten. Keine zweite persistierte Netzwerkkonfiguration.
IPv6 erscheint höchstens unter Diagnose als Negativprüfung.

Beleg: [network-topology-diagram.ts](../../manager/src/renderer/network-topology-diagram.ts).

### Wartung

Die vier Bereiche können bleiben. Kleinere Anpassungen genügen:

- „Praxis-Einstellungen“ enthält nur Import-/Exportpfade: „Import & Export“
  vermeidet Verwechslung mit fachlichen Einstellungen in der App.
- „Stack“ in der Hauptbedienung als „Praxis-Flow-Dienste“ bezeichnen.
- Bewusst gestoppt und nur teilweise gestartet nicht auf denselben binären
  Schalterzustand reduzieren; Kontext zur Störung und Netzwerkdiagnose anbieten.
- Backup-Erstellung, Wiederherstellung und PIN-Notfallaktion klar gliedern.
  Der PIN-Reset sollte nicht wie eine alltägliche Alternative zum Backup wirken.
- Ansprache vereinheitlichen: derzeit „Klicke“ neben „Sie“ in anderen Bereichen.

Belege: [MaintenanceView.svelte](../../manager/src/renderer/MaintenanceView.svelte),
[StackControls.svelte](../../manager/src/renderer/StackControls.svelte).

## 4. Interne Portalfunktion und Patientenfreigabe

Das ist nicht allein eine Umbenennung. Der heutige Ops-Schalter heißt
„Patientenportal aktivieren“ und verwaltet ein fachliches `portalEnabled`.
Der Manager listet die Portal-URL ohne getrennten Patienten-Freigabestatus.

Für die jetzige UX: internen Portalzugang beibehalten und eindeutig beschriften;
Patientenzugang als noch nicht eingerichtet ausweisen. Kein zweiter fachlicher
Portal-Schalter im Manager. Die Ops-Beschriftung sollte bei der Umsetzung
mitgezogen werden, damit „Portal intern nutzen“ und „Patientenportal aktivieren“
nicht erneut gegeneinanderstehen.

Ein Hinweis ist keine technische Zugangssperre. Der aktuelle HTTP-Zugang kann
MFA und Patienten nicht anhand ihrer beruflichen Rolle unterscheiden. Falls
„nicht für Patienten freigegeben“ eine technisch erzwungene Grenze meint,
benötigt sie den späteren getrennten Listener/Zugriffsvertrag und die von der
Praxis-IT verantwortete Netzkonfiguration. Die UI darf heute weder diese Sperre
noch eine separate bereits funktionierende MFA-Portalvorschau behaupten.

Belege: [OpsPortalSettings.svelte](../../ui/src/lib/components/ops/OpsPortalSettings.svelte),
[de-DE.ts](../../ui/src/lib/i18n/locales/de-DE.ts).

## 5. Umsetzungsvorschlag und Abnahme

Priorität 1 – Bedeutung und Wahrheitsgehalt:

- [x] „Demo“ durch das interne Betriebsmodell ersetzen, Wizard und Manager gemeinsam.
- [x] Portal intern und Patientenfreigabe in Beschriftungen/Summaries trennen.
- [x] Captive-Platzhalter entfernen und Diagramm auf heutigen Ist-Zustand umstellen.
- [x] Falsches „WLAN aktuell“ und aus TLS-Konfiguration abgeleitetes „Läuft“ korrigieren.

Priorität 2 – Handlungsfähigkeit:

- [x] Einheitliche Zugangszusammenfassung auf Status und Netzwerk.
- [x] Diagnosezustände und passende Aktionen einschließlich TLS-Proxy-Recovery.
- [x] Bestehende Schutzmechanismen bei TLS-Vorbereitung/Cutover erhalten.

Priorität 3 – Vereinfachung:

- [ ] Wizard-Reihenfolge/optionale Details verbessern, HTTPS-Aufschub neutral darstellen.
- [ ] Wartungsbegriffe und Aktionsgruppen vereinheitlichen.
- [ ] Tastaturfokus, Fehlerankündigungen und Fokus nach aufklappender Diagnose prüfen.

Gezielte Tests: initialer Betrieb ohne Warnstatus allein wegen fehlendem HTTPS;
Portal-Link intern beschriftet; Ethernet korrekt zugeordnet; konfigurierte
HTTPS-Verbindung bei fehlendem Container nicht als laufend ausgewiesen;
unbekannte/falsche Bindings sichtbar; gestoppt/starting/Fehler getrennt;
Repair bei HTTP und aktivem TLS auffindbar; Entwürfe und TLS-Identität bleiben
bei Statusupdates erhalten. Diagrammvarianten müssen zu den echten Daten passen.

Die UI-Änderung braucht zunächst Komponenten-/Controller-Tests und visuelle
Abnahme. Eine erneute ACME-Ausstellung ist für reine Text-/Layoutänderungen
nicht nötig. Änderungen am Repair-Verhalten verlangen eigene Regressionen
und einen gezielten praktischen Durchlauf.

## 6. Umsetzungsstand nach der Bestandsaufnahme

Der erste UI-Arbeitsblock ist implementiert: internes Naming, gemeinsame
Zugangszusammenfassung, wahrheitsgemäßer Proxy-Laufstatus, interne Portal-Links,
aktuelles Diagramm, neutrale optionale HTTPS-Einrichtung sowie sichtbarer Repair
auch nach TLS-Cutover. Deutsche Ops-Portaltexte, Wartungsbegriffe und der
MFA-Einstieg am Wizard-Abschluss sind angepasst. Binding-Details sind aufklappbar.

Geprüft: Manager-Tests, gezielte Setup-Netzwerk-/Host-State-Tests und isolierte
Komponentenvorschau. Backend-Regressionen erhalten bei Repair die bestehende
Managed-/Custom-/Legacy-TLS-Identität. Das ist kein Nachweis eines echten
ACME-freien Container-Neustarts; der praktische Repair-Smoke bleibt offen.
Die Installation und der bestehende Stack wurden für die UI-Arbeit nicht verändert.

Die Struktur der Tabs und Wizard-Schritte bleibt erhalten. Eine Zusammenlegung
von Netzwerk/Zugang, ein erweiterter Domain-/PEM-Bereich und die vollständige
native Tastatur-/Fehlerzustandsabnahme sind weiterhin mögliche Folgearbeiten.

Verifikation des Umsetzungsstands: 326 Manager-Tests sowie die gezielten
Setup-Netzwerk-/Host-State-Suites erfolgreich; Manager-/Setup-Typecheck,
Manager-ESLint und Manager-Produktionsbuild erfolgreich. Stylelint und der
Unused-CSS-Check für den Manager sind sauber. Der globale CSS-Check meldet
weiterhin zwei bereits in HEAD ungenutzte App-Selektoren
(`.mfa-emergency-banner` und `.terminal-page .terminal-lead--assist`);
diese liegen außerhalb des Manager-Umbaus.
