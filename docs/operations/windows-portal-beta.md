# Windows-Patientenzugang: Beta 6.1.2-beta.5

Stand: 2026-10-05 · Branch `codex/windows-patient-portal-beta`

Diese Manager-Beta ermöglicht den separaten Patientenzugang unter Windows.
Sie verwendet die vorhandenen Linux-Container und Caddy-Listener. Die
Container-/App-Version wird durch dieses Manager-Release nicht geändert.
Ein erfolgreicher lokaler Audit ist kein Nachweis der externen Netztrennung.

## Korrekturen gegenüber Beta 1

Regulärer Start, Restart und Start einer vorhandenen Installation prüfen einen
aktiven Patientenzugang nach vollständiger Stack-Gesundheit mit dem gemeinsamen
Binding-/Host-/SNI-/Routenaudit. Bei Fehlern wird der Proxy entfernt, damit seine
Restart-Policy den ungeprüften Zugang nicht erneut öffnet. Scheitert das Entfernen,
wird zusätzlich Stop versucht und die unvollständige Schließung ausdrücklich gemeldet.

Diagnosekontexte umfassen vollständige Hostmutationen einschließlich Update,
Restore, Rebuild und Recovery mit ihren Rollbacks. Windows-Docker-Preflightfehler
werden mit Prüfschritt und sicherer Fehlerkategorie erfasst. `operation.end`
trennt `completion` (`returned` oder `threw`) von `ok`: Ein zurückgegebenes
boolesches `ok` wird übernommen; ohne solchen Ergebnisstatus ist `ok` gleich
`null`, bei geworfenen Fehlern `false`. Ein normales Funktionsende ist damit
keine pauschale Erfolgsaussage.

## Anzeigeaktualisierung in Beta 3

Der geöffnete Portalbereich lädt seinen Prüfstand nach Änderungen an der
Hostkonfiguration neu, sobald laufende Hostmutationen abgeschlossen sind.
Damit bleiben Voraussetzungen nach HTTPS- oder Adapteränderungen nicht auf
einem älteren Stand stehen. Externe DNS-Änderungen können weiterhin über
„Erneut prüfen“ aktualisiert werden.

## Installation und Test

1. Windows-x64-Installer `PraxisFlowManager-6.1.2-beta.5-windows-x64-setup.exe`
   installieren; Docker Desktop mit lokalem Linux-Daemon starten.
2. Bestehenden Stack starten und verwaltetes Wildcard-HTTPS prüfen.
3. Im Manager unter Patientenzugang die zweite lokale IPv4-Adresse auswählen,
   vorbereiten, DNS prüfen und aktivieren. Die Windows-Beta ist sichtbar markiert.
4. Von einem Gerät im Patientennetz das Portal öffnen. Staff-Adresse,
   Staff-Routen am Portal, direkte App-Ports 8080/8082 und unbeabsichtigte
   IPv6-Erreichbarkeit negativ prüfen. Host-/SNI-Kreuztests ergänzen.
5. Patientenzugang entfernen und erneut aktivieren. Danach Docker und Windows
   neu starten und die Erreichbarkeit erneut prüfen. Adressverlust separat testen.
6. Nach jedem Test im Manager den Patientenzugang aktualisieren, damit ein
   neuer DNS-/Binding-Snapshot im Protokoll steht.

Die Beta umgeht keine TLS-, DNS-, Adress- oder Listenerprüfung. Ein gescheiterter
Apply verwendet weiterhin den vorhandenen Rollback. Host-Firewall und Routing
werden nicht verändert. Versionsmatrix und externe Tests siehe auch
[Windows-Abnahme](../open-items.md#windows-abnahmeprotokoll).

## Protokolle zur Auswertung

Im tatsächlichen Installationsverzeichnis liegen:

- `logs/restricted-beta.jsonl`
- `logs/restricted-beta.jsonl.1` (vorheriges Protokoll, falls rotiert)

Bei der Standardinstallation ist das Verzeichnis `%ProgramData%\PraxisFlow`.
Abweichende Installationsverzeichnisse gelten entsprechend. Beide Dateien nach
dem Test kopieren und zusammen mit Zeitpunkt, beobachtetem Verhalten sowie
Quellgerät/Quellnetz zur Auswertung bereitstellen. Keine `.env`, Zertifikatschlüssel
oder Datenbank mitsenden. WSL-Version (`wsl --version`), Docker-Desktop-Version,
WSL-Netzwerkmodus und Windows-Netzprofil zusätzlich angeben; diese werden nicht
automatisch aus den Windows-Einstellungen ausgelesen.

Die JSONL-Einträge enthalten Zeit und Vorgangs-ID, Manager-Build-ID,
Betriebssystem-/Node-/Electron-Version, Docker-CLI-/Engine-/Compose-Version bei
Inspect, ausgewählte IPs/Interfacekennungen, DNS-Ergebnisse, Prüfstatus und
Runtime-Bindings. Listenerproben protokollieren Ziel-IP, Port, Host/SNI,
synthetischen Prüfpfad, Erwartung und Ergebnis. Apply/Remove und Rollback werden
korreliert. Docker-Aufrufe protokollieren Exitcode, Dauer und grobe Fehlerkategorie.
Prepare, Inspect, Start/Restart sowie Wartung und Recovery werden ebenfalls protokolliert.

Keine vollständigen Docker-Argumentlisten, Konfigurationen, HTTP-Inhalte,
Patientendaten oder Secrets werden aufgezeichnet. Die technischen Netzwerkdaten
enthalten interne IPs, Hostnamen und MAC-basierte Interfacekennungen. Logs bleiben
lokal; es gibt keinen automatischen Upload. Maximal zwei Dateien zu je 2 MiB;
ältere Einträge werden überschrieben. Schreibfehler beeinflussen den
Betriebsablauf nicht und werden auf stderr gemeldet. Windows-Dateirechte folgen
den ACLs des Installationsverzeichnisses.

Die Logs erklären die lokalen Prüfungen. Firewallregeln, externe Erreichbarkeit
und automatisches Containerverhalten während eines ausgeschalteten Managers
müssen im Testprotokoll separat festgehalten werden.

## Rückkehr zur bisherigen Version

Vor Installation eines Managers ohne Windows-Portal-Unterstützung den separaten
Patientenzugang mit der Beta entfernen. Sonst blockiert die bisherige Version
den verwalteten Stackstart wegen des aktiven Restricted-Markers.

## Windows-Praxistest vom 2026-10-05

Auf einem Windows-x64-Rechner (gemeldeter OS-Build 10.0.26300) mit Docker
Engine/CLI 29.8.1 und Compose 5.5.1 wurden Aktivierung und Portalzugriff erprobt.
Der Anwender bestätigt erfolgreiche Stack-, Docker-Desktop- und Windows-Neustarts.
Ethernet und WLAN liegen dabei im selben IPv4-/24-Subnetz; dies ist keine
Abnahme aus getrennten Praxis- und Patientennetzen.

Das bereitgestellte Protokoll `restricted-beta (2).jsonl` dokumentiert zwei
Aktivierungen mit jeweils 104 erfolgreichen lokalen Listenerprüfungen: erlaubte
Zugriffe, Host-/SNI-Abweisungen und gesperrte Routen/Methoden. Beide IP-Adressen
veröffentlichen gleichzeitig TCP 443 auf den vorgesehenen getrennten Listenern.

Zusätzlich bestätigt der Anwender einen Neustart ohne WLAN. Im zeitlich passenden
Logabschnitt meldet Inspect fehlende Proxy-Publishes und `degraded`. Die
IP-/Interfacezuordnung bleibt dort vorhanden; der physische WLAN-Zustand wird
nicht direkt protokolliert. Nach Entfernen des Portalzugangs bestehen nur die
Staff-Publishes. Nach Wiederherstellung des WLANs und erneuter Aktivierung sind
alle Prüfungen erfolgreich, Endzustand `applied / healthy`.

Die Neustarts sind Anwendernachweise. In diesem Log fehlen eigenständige
`start.health`-Ereignisse; die zwei vollständigen Listeneraudits gehören zu den
Aktivierungen. Die protokollierte Build-ID 6.1.1 bezeichnet das Setup-Paket,
nicht eindeutig die installierte Manager-Beta. Funktionaler Betatest dieser
Konfiguration erfolgreich; getrennte Netze und allgemeine Produktionsfreigabe
bleiben offen.

## Komfortänderung in Beta 4

Der Statusbereich heißt „Zugänge“. Bei aktiviertem separatem Patientenzugang
mit vorhandenem Portalhostnamen erscheint zusätzlich „Portal - extern“ mit
HTTPS-Link auf `/portal` und derselben Kopierfunktion wie bei internen Zugängen.
Vorbereitung allein zeigt den Link noch nicht; Entfernen des Zugangs blendet ihn aus.

## Kompakte Voraussetzungen in Beta 5

Der Portalbereich bündelt erfolgreiche Prüfungen in HTTPS, Adresse und DNS sowie
Netzwerkfreigabe. Fehlerdetails und zusätzliche Recovery-Hinweise bleiben direkt
sichtbar. Alle Einzelmeldungen stehen unverändert unter „Technische Prüfergebnisse“.
Fehlende Prüfungen gelten als offen; die Aktivierungsbedingungen bleiben unverändert.
