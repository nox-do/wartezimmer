# Windows-Patientenzugang: Manager 6.1.2

Stand: 2026-10-05

Manager 6.1.2 unterstützt den separaten Patientenzugang unter Windows ohne
Beta-Kennzeichnung. Die zusätzliche JSONL-Diagnoseprotokollierung aus dem
Betatest wurde entfernt. Vorhandene Protokolldateien werden nicht gelöscht.
Die reguläre Fehlerbehandlung und alle Sicherheitsprüfungen bleiben erhalten.
Die Container-/App-Version wird durch dieses Manager-Release nicht geändert.

## Betrieb und Prüfungen

Einrichtung erfordert verwaltetes Wildcard-HTTPS, eine zusätzliche lokale
IPv4-Adresse und passende öffentliche sowie lokale DNS-Auflösung. Apply,
regulärer Start und Restart prüfen die Runtime-Bindings und Listener-Policy.
Scheitert der Startaudit, wird der Proxy entfernt; bei fehlgeschlagener Entfernung
wird zusätzlich Stop versucht und eine unvollständige Schließung gemeldet.
Host-Firewall, Routing und Trennung der Praxisnetze bleiben Aufgabe der Praxis-IT.

Im Statusbereich „Zugänge“ erscheint nach Aktivierung „Portal - extern“ mit
Öffnen- und Kopierfunktion. Der Portalbereich fasst die Voraussetzungen in
HTTPS, Adresse und DNS sowie Netzwerkfreigabe zusammen. Fehler bleiben sichtbar,
alle Einzelmeldungen sind unter „Technische Prüfergebnisse“ verfügbar. Nach
Hostkonfigurationsänderungen wird die Prüfliste aktualisiert. Für externe
DNS-Änderungen steht „Erneut prüfen“ bereit.

Vor Rückkehr zu einem Manager ohne Windows-Portal-Unterstützung den separaten
Patientenzugang entfernen, da ältere Versionen den aktiven Restricted-Marker ablehnen.

## Historische Betatest-Nachweise

Die folgenden Ergebnisse stammen aus den während der Beta gesammelten Logs.
Manager 6.1.2 erzeugt diese zusätzlichen Dateien nicht mehr.

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
