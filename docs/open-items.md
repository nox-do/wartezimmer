# Offene Abnahmen und Entscheidungen

Release 6.1.2: Beta-Kennzeichnung und zusätzliches JSONL-Logging entfernt.
Windows-Portal-Unterstützung und Sicherheitsprüfungen bleiben bestehen.
Die folgenden Beta-Protokolle sind historische Nachweise.

Windows-Praxistest (2026-10-05): Aktivierung, Portalzugriff, Neustarts laut Anwender
und Wiederherstellung nach WLAN-Ausfall erfolgreich erprobt. Zwei Aktivierungen
mit insgesamt 208 erfolgreichen Listenerproben protokolliert. Details und Grenzen:
[Windows-Portal-Beta](operations/windows-portal-beta.md#windows-praxistest-vom-2026-10-05).

Windows-Portal-Beta (2026-10-05): Auf dem Branch
`codex/windows-patient-portal-beta` hebt Manager `6.1.2-beta.1` die pauschale
Windows-Sperre auf. TLS-/DNS-/Binding-/Listenerprüfungen bleiben aktiv.
Die bisherige Erwartung „Windows bleibt gesperrt“ in der Abnahmematrix gilt
für diese Beta nicht mehr. Stattdessen reale Zwei-NIC-Abnahme mit
[Diagnoseprotokollen](operations/windows-portal-beta.md) durchführen.

Konsolidiert am 2026-09-30 aus den bisherigen Reviews und Betriebsdokumenten.
„Offen“ bedeutet hier: Ein abschließender Nachweis beziehungsweise eine Entscheidung
ist in den geprüften Unterlagen nicht dokumentiert. Automatisierte Tests ersetzen
keine Abnahme der konkreten Host-/Netzwerkkombination.

Abgleich am 2026-10-04: Die früher als P0/P1 bestätigten Windows-Codebefunde
sind überwiegend umgesetzt; ihre historischen Prioritäten sind keine Liste
heutiger offener Defekte. Aktuelle Einstufung und Fundstellen stehen in
[Delivery](operations/delivery.md#aktuelle-code-bestandsaufnahme-abgleich-2026-10-04).
Für Produktionsfreigabe stehen insbesondere reale Update-/Recovery-/Datenerhalt-/HTTPS-
und ACL-Nachweise aus; explizite Architekturwahl für Updatepakete ist umgesetzt.
Direkte UNC-CSV-Quellen und Restricted auf Windows bleiben Grenzen
des unterstützten Umfangs; gemappte Laufwerke sind jetzt für Import/Export zugelassen; nur bei entsprechender Anforderung sind sie Einsatzstopper.

## Release- und Plattformabnahmen

| Thema                              | Noch zu dokumentierender Nachweis                                                                                                                                                                                                             | Aktueller Vertrag                                              |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Windows                            | NSIS x64 und Windows-CI vorbereitet; tatsächlichen CI-/Installerlauf, Versionsmatrix, Docker-/GUI-/Recovery-Abnahme und separate Restricted-Netzfreigabe nachweisen (Protokoll unten)                                                         | [Netzwerkisolation](operations/praxis-it-network-isolation.md) |
| Restricted-Zugang in realen Netzen | Zwei-NIC-Matrix: erlaubte Zugriffe sowie gekreuzte Host-/SNI-Werte, globale Bindings und IPv6 negativ prüfen; DHCP-/Adressverlust, Docker-/Host-/Router-Neustart und Stromausfall einschließlich Fail-closed-Verhalten prüfen                 | [Restricted-Lifecycle](operations/restricted-lifecycle.md)     |
| Portal-Auslieferung                | Frische Installation und Upgrade einer älteren TLS-Installation aus dem DMG; vorbereitetes/aktives Binding über Update und Restore; Apply/Remove bei laufenden und gestoppten Diensten; genaue macOS-/Docker-Desktop-Versionen protokollieren | [TLS](operations/tls.md)                                       |
| Neuinstallation mit Recovery       | Abschließender Manager-E2E-Durchlauf mit echtem Docker-Stack, Backup-Übernahme, Fehlerfall und Wiedereinstieg                                                                                                                                 | [Recovery](operations/reinstall-recovery.md)                   |
| Proxy-Reparatur                    | Praktischer Repair-Smoke mit bestehender TLS-Identität; automatisierte Identitätserhaltung allein beweist keinen erfolgreichen Container-Neustart ohne neue ACME-Ausstellung                                                                  | [TLS](operations/tls.md)                                       |
| Manager-Zugänglichkeit             | Native Tastaturbedienung, Fokus nach aufklappender Diagnose und Fehlerankündigungen im Electron-Manager prüfen                                                                                                                                | [Manager](../manager/README.md)                                |

Erster positiver Windows-Praxistest am 2026-10-01: Rückmeldung des Anwenders
„unter Windows sieht es erstmal gut aus“ nach den Paket- und Architekturkorrekturen.
Die genaue Windows-/Docker-Version und der Umfang der geprüften Abläufe wurden
noch nicht protokolliert; dies ist keine vollständige Installations-, Update-,
Recovery- oder Netzwerkabnahme.

Windows-TLS-Teilnachweis am 2026-10-01: Anwender bestätigt erfolgreiche
Wildcard-Zertifikatsausstellung nach explizitem ACME-Resolver `1.1.1.1:53`.
Generator-Fix und Regressionstests übernommen; HTTPS-Cutover, Browserzugriff,
Erneuerung und Restricted-Abnahme bleiben separat offen. Details: [TLS](operations/tls.md#windows-dns-teilnachweis-vom-2026-10-01).

Nachweise jeweils mit Datum, Plattformversionen, Szenario und Ergebnis ergänzen.
Ein erledigter Teiltest schließt nicht automatisch die gesamte Zeile.

Bereits dokumentierter Teilnachweis: Eigene ACME-Domain mit Pebble/Caddy am
2026-09-28 erfolgreich geprüft (Wildcard, DNS, Bindings, HTTPS-Cutover,
HTTP-Redirect, HTTP/2 und SSE); siehe [TLS-Prüfstand](operations/tls.md#review-und-regressionstests-für-eigene-domains).
Das ersetzt weder Windows- noch reale Zwei-NIC-Abnahme.

Ein-Datei-Installation (`.pfinstall`, Format 2): Builder-/Reader-Regressionen prüfen
interne Prüfsummen und die Ablehnung des Altformats. Reale Windows-Abnahme offen:
aktuellen Manager installieren, neu gebautes Paket für die Hostarchitektur **allein** in
einen lokalen Ordner kopieren, im Wizard wählen; erwartet: Vorbereitung ohne Sidecar
und erfolgreicher Installationsstart. Eine Nutzdatei im Archiv verändern und neu packen;
erwartet: verständlicher Paketfehler vor Docker-Import. Danach unverändertes Paket erneut
wählen; erwartet: erneute Vorbereitung möglich. Zusätzlich beide Pakettypen auf macOS mit den
aktuellen Build-Scripts erzeugen und unter Windows importieren; erwartet: keine
AppleDouble-Einträge (`._.`/`._*`), kein `PFUPDATE_TAR_PATH_UNSAFE` aufgrund von
macOS-Metadaten. Der lokale macOS-Test mit echten Extended Attributes ist grün;
der reale Windows-Importnachweis steht noch aus.

Architekturpakete: `release:images` baut standardmäßig AMD64 und ARM64 mit
Architektur im Dateinamen; ein CLI-Test mit simulierter Docker-CLI prüft beide
Build-/Exportpfade, echte Dual-Architektur-Builds und Laufzeittests stehen noch aus.
Auf Intel-Windows zuerst das ARM64-Paket wählen: erwartet klare Architekturmeldung
vor Docker-Import. Danach AMD64 wählen: erwartet Vorbereitung erfolgreich.
Auf Apple Silicon analog ARM64 erfolgreich, AMD64 abgelehnt. Updatepakete besitzen dieselbe explizite Architekturauswahl und prüfen die Daemon-Plattform; Windows-ARM64 ist nicht freigegeben.

## UI- und technische Folgeentscheidungen (keine Release-Zusage)

- Mehrfach-Check-in zum selben Thema (2026-10-07): Terminal und MFA können derzeit weitere Visits mit neuen Wartenummern für denselben Patienten und dasselbe Thema anlegen. Bekanntes Verhalten, kein Showstopper und kein Release-Gate; Umsetzung später. Empfohlen sind eine stabile Kontaktidentität und ein gemeinsamer serverseitiger Guard mit Hinweis auf die bestehende Wartenummer. Details zu Einbaupunkt, Themenwechsel und Grenzen anonymer Anmeldungen: [Check-in-Guards](architecture/apis.md#bekanntes-verhalten-mehrfach-check-in-zum-selben-thema).
- Manager-Buttonfarben: Grün für Hauptaktionen und hellgraue Sekundärbuttons wurden vorgeschlagen, aber noch nicht bestätigt oder umgesetzt. Die lokale Anzeige der Übernehmen-Buttons je geändertem Netzwerkbereich ist bereits umgesetzt.
- Erweiterte Domain-/PEM-Einrichtung: weitere Vereinfachung bei Bedarf. HTTPS lebt bereits ausschließlich unter Netzwerk; kein zusätzlicher Wizard-HTTPS-Schritt.
- Multi-Tab-SSE: vor einer BroadcastChannel-/Leader-Lösung Browserlimit, Verbindungen und REST-Verzögerung messen. Keine rollenübergreifende Koordination oder Weitergabe von Auth-Tokens. Direkte SSE-Verbindungen müssen als Fallback möglich bleiben; siehe [Echtzeit](architecture/realtime.md).

## Fachliche Fragen und optionale Produktideen

Diese Punkte stammen aus den bisherigen Flow-Notizen; sie sind keine zugesagte Roadmap.

- Erstanamnese-Fragenkatalog mit der Praxis abschließen.
- Klinische Zuständigkeit für Dokumentzugriff (Arzt/MFA), Zielsystem der Übernahme und Aufbewahrung exportierter Dateien klären. Aktuell verarbeitet die MFA Dokumente; temporärer Intake und Tagesreset sind beschrieben unter [Dokumente](architecture/documents.md).
- Upload-/Ticketcode-Limits fachlich bewerten. Ticketcode-Auflösung besitzt bereits einen Rate-Limiter; dieser Punkt behauptet keine generell fehlende technische Begrenzung.
- PVS-Vendor-Anbindung und eGK bleiben Discovery; Captive-Adapter sind nicht Portal-v1. Grenzen: [Integrationen](operations/integrations.md).
- Terminal-Ideen: optionaler Idle-/Bannerzustand und explizite Anzeige bei geschlossener offener Sprechstunde. Aktuelle Flows verwenden die vorhandenen Themen-/Betriebsguards.
- Für einen realen SMS-Rollout Zuständigkeit für Anbietervereinbarung, Zweckbindung und Speicherdauer festhalten; keine Implementierungszusage aus alten Flow-Notizen ableiten.

## Windows-Abnahmeprotokoll

Implementierung/Audit: [Delivery §8](operations/delivery.md#8-windows-vorbereitung-2026-09-30-noch-keine-plattformfreigabe).
Noch **kein Windows-Host-Lauf**, kein NSIS-Installationsnachweis und keine
Windows-Docker-/GUI-Abnahme dokumentiert. Windows-CI ist ergänzt, hier nicht
ausgeführt. Nachweise nur in einer isolierten Testinstallation mit synthetischen
Daten erheben; keine bestehende Praxisinstallation destruktiv testen.

Pro Lauf: Windows-Build/Edition, Architektur, Betriebskonto, Docker Desktop,
Engine, Compose, WSL (`wsl --version`), Kontext/Endpoint, Netzadapter,
Manager-/Paketversion und Signierstatus protokollieren.

| Schritt                | Konkrete Prüfung                                                                                                                                                                                                                                                         | Erwartetes Ergebnis                                                                                                                                                                                                                              |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1. CI                  | Windows-Workflow auf diesem Stand ausführen; native Tests, Paketbau, EXE-Setup-Smoke und NSIS-Install/Reinstall/Uninstall prüfen                                                                                                                                         | Grün; kein externer Node/npm-Laufzeitbedarf. Ein grüner Server-Runner ist keine Docker-Desktop-Freigabe.                                                                                                                                         |
| 2. Installer           | Auf Windows 11 x64 mit Standardkonto NSIS installieren; aus Startmenü und Desktop starten, cwd/PATH vom Terminal abweichend; zweite Instanz öffnen                                                                                                                       | Keine Manager-Elevation; ein Manager; lokale API ausschließlich 127.0.0.1, falsches/fehlendes Token 401; Daten unter separatem Home.                                                                                                             |
| 3. Erhalt              | Test-Home, externe Import-/Exportdateien und DB mit Markern versehen; Manager schließen, Installer-Upgrade, Deinstallation und Neuinstallation                                                                                                                           | Marker, Backups, TLS-Identität und Docker-Volumes unverändert; App-Verknüpfungen entfernt/erneuert. Legacy-ProgramData-Home wird weiter erkannt.                                                                                                 |
| 4. Docker              | Desktop zunächst aus; anschließend starten, während Manager offen bleibt. Linux-Container/Compose prüfen; Remote-Kontext, DOCKER_HOST=TCP und Windows-Container separat einstellen                                                                                       | Verständliche Nichtbereit-/Kontext-/Linux-Meldung, keine Ersatzinstallation und keine Mutation am Remote-Daemon. Nach Rückkehr zu lokalem Linux-Docker erneut nutzbar.                                                                           |
| 5. Speicher            | Lokale Ordner `C:\Praxis Müller & Partner\Import $Test` / Export verwenden; CSV importieren, Datei exportieren, Host und Containerinhalt vergleichen. Mit UNC, nicht verbundenem Netzlaufwerk, WSL-Pfad, `C:relativ`, Junction, Gerätenamen und >220 Zeichen wiederholen | Exakte Inhalte am erwarteten Ort, keine Shell-Ausführung oder falsche Mountquelle. Nicht freigegebene Pfade früh und verständlich abgewiesen.                                                                                                    |
| 6. Lebenszyklus        | Synthetische `.pfinstall` installieren; Prepare abbrechen; Install nach Prozess-Kill erneut öffnen; `.pfbackup` erstellen/restaurieren, `.pfupdate` anwenden; Fehler nach Snapshot/Cutover injizieren                                                                    | Bestehender Install-/Journalvertrag; Wiederholung/Rollback mit identischer Ausgangskonfiguration, externe Ordner erhalten, ungeklärte Journale sperren weitere Mutationen.                                                                       |
| 7. Sperren/Secrets     | Datei mit Windows-Prozess exklusiv offenhalten, Update/Restore versuchen, Sperre lösen und wiederholen; ACLs von Home, `.env`, TLS-Schlüsseln, Temp und exportiertem Backup als zweites Standardkonto prüfen                                                             | Kein Löschen des alten Ziels bei Rename-Fehler; Recovery bleibt möglich. Unberechtigte Konten können Secrets nicht lesen; bei abweichenden ACLs IT korrigiert diese vor Betrieb.                                                                 |
| 8. Prozesse            | Manager normal schließen und im Task-Manager beenden, auch während eines CLI-Aufrufs; erneut starten; Docker Desktop und Windows neu starten                                                                                                                             | Keine verwaiste Setup-API/npm-/Compose-Prozesskette. Containerzustand wird neu erhoben; offene Vorgänge bleiben erkennbar. Docker-Daemon-Aufträge können nach Client-Abbruch weiterlaufen und müssen durch Recovery abgeglichen werden.          |
| 9. Staff-Netz/HTTPS    | Ports 80/443/8080 zunächst belegen; danach freigeben. Physische Staff-IP statt WSL/VPN wählen. HTTP, Staff-HTTPS, Redirect, Maintenance-Loopback, PEM/ACME und TLS-Backup-Restore prüfen; IP entfernen                                                                   | Belegte Ports verständlich gemeldet; Proxy nur gewünschte IP; 8080/8082 hinter Proxy nur Loopback; verlorene Staff-IP blockiert verwalteten Neustart. Fremde Hosts/SNI und unbeabsichtigtes IPv6 bleiben negativ.                                |
| 10. Restricted separat | Aktuell UI/API-Aktivierung, Start mit kopiertem aktivem Marker und Restore eines aktiven Restricted-Backups versuchen                                                                                                                                                    | Windows bleibt gesperrt. Eine spätere Freigabe benötigt zwei reale NICs, paralleles 443-Publishing, vollständige Host/SNI-Kreuzmatrix, externe IPv4/IPv6-Proben, Adressverlust, Docker-/Host-Neustart und Stromausfall mit Fail-closed-Nachweis. |

Windows-Firewallregeln, Netzprofil, VPN, VLAN/Routing und Docker-Backend-Prozess
sind durch die Praxis-IT zu prüfen. Keine automatische Portöffnung; kein
Administratorbetrieb des Managers als Ersatz für eine Netzfreigabe.
Signierung und konkrete Mindestversionen bleiben vor externer Auslieferung offen.

### CSV-Quelle bei Windows-Abnahme

Vor dem Praxistest klären, ob der Export lokal, in einem lokal freigegebenen
Ordner oder auf einem entfernten SMB-Server liegt. UNC bleibt gesperrt; ein im
Betriebskonto gemapptes Netzlaufwerk ist für Import/Export zugelassen. Die Praxis-IT
verantwortet Verbindung und Zugangsdaten. Docker-Mount, CSV-Wechsel, Export,
Verbindungsverlust und Wiederverbindung nach Host-Neustart real testen.
Hostordner → `/imports` → App-Vorschau/Suche einschließlich Dateiwechsel und
Neustart nach [Runtime-Vertrag](operations/runtime.md) tatsächlich prüfen.

Der P1 aus dem lokalen Windows-Review (anders geschriebene geerbte Bind-Variablen)
ist durch case-insensitive Bereinigung vor Docker-Normalisierung korrigiert.
Ein Regressionstest prüft beide Plattformvarianten; der native Windows-CI-Lauf
steht weiterhin aus.

### Erststart ohne erreichbaren Docker-Daemon

Korrigiert nach dem ersten Windows-VM-Test: Fehlende `.env` und eine wegen
Docker-Ausfall noch nicht mögliche Restprüfung werden als Docker-Voraussetzung
angezeigt, nicht als beschädigte Installation mit fehlendem Release-State.
Der paketierte Manager öffnet den Assistenten mit Docker-Status und erneuter
Prüfung. Das Laden/Installieren wird erst nach erfolgreicher Restprüfung angeboten;
bestätigte Reste und unlesbare Journale bleiben gesperrt. Regressionstests decken
Offline-Erststart und Übergang zur Paketauswahl ab. Den neu gebauten Windows-
Installer in der VM erneut prüfen; dort ohne lauffähiges Docker am
Voraussetzungsschritt bleiben. Auf x64 mit Docker anschließend die Paketauswahl
und vorhandene Installationsreste separat prüfen.

### Windows-Installer: CRC korrigiert, Laufzeittest offen

Der defekte Deinstaller des ersten macOS-Cross-Builds wurde lokal reproduziert.
Der Build übernimmt jetzt die fehlenden NSIS-Icon-Patches und prüft äußeren
Installer und eingebetteten Deinstaller; negative Regressionstests verhindern
stilles Akzeptieren falscher CRCs. Ein korrigierter Mac-Cross-Build bestand beide
Prüfungen. In der Windows-VM noch ausführen: frische Installation, Managerstart
und Schließen, Wiederholungsinstallation, Deinstallation. Erwartet: keine CRC-
Meldung, keine verbleibenden Manager-/Setup-Prozesse, Praxisdaten bleiben erhalten.
Die frühere Meldung „Manager kann nicht geschlossen werden“ ist separat offen;
ihre Ursache ist durch die CRC-Korrektur nicht nachgewiesen oder behoben.

### Windows ARM64 / Snapdragon: Recherche abgeschlossen, Umsetzung offen

Siehe [konkrete Befunde und Prüfpfad](operations/delivery.md#recherche-windows-arm64--snapdragon-2026-09-30).
Native ARM64-Images für App, Sandbox und Proxy sind lokal vorhanden. Noch nötig:
ARM64-Manager/NSIS/CI und reale Snapdragon-Abnahme. Updatepakete haben explizite
Architekturauswahl und verwenden bei der Prüfung die Docker-Daemon-Architektur.
Die Installationsprüfung nutzt bereits die Daemon-Architektur; `release:images`
erzeugt getrennte AMD64-/ARM64-Installationspakete. Docker Desktop Windows ARM ist weiterhin Early Access; derzeit nur
Pilot-Ziel, keine Produktionszusage. Bestehende Windows-x64-Freigabegrenzen und
Restricted-Sperre bleiben unverändert.
