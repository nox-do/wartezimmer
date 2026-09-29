# Netzwerk-UI: Layout und Zustände

## Raster und Typografie

Electron startet mit 1000 statt 720 px Breite; Mindestbreite bleibt 480 px.
Inhaltsfläche und Navigation teilen dieselbe Maximalbreite.
Alle zweispaltigen Netzwerkbereiche verwenden dieselbe 50/50-Teilung und 20 px Innenabstand an der Trennlinie.
Unter 800 px stehen die Spalten in Lesereihenfolge untereinander.
Keine festen Panelhöhen, keine abgeschnittenen Statusmeldungen oder URLs.
Systemschrift bleibt erhalten; Netzwerk-Inhalt 15 px, Hinweise und technische Werte 14 px, Expander-Titel 16 px.
Gewichte: normal 400, Zwischenüberschriften 600, Expander-Titel 700.
Netzwerkspezifische Regeln liegen in network.css; gemeinsame Grundelemente bleiben in styles.css.

## Zuordnung dynamischer Inhalte

| Bereich | Links | Rechts / gemeinsame Rückmeldung |
| --- | --- | --- |
| Übersicht | Praxisadresse, Betriebsmodus, Verbindung; Bindung und Adapter in Details | Patientenzugang mit Zustand, Adresse und Freigabe |
| Praxisadresse | Gespeicherte IP, Auswahl oder manuelle Eingabe; Abweichungen sichtbar | Gespeicherte Geräteadresse, Vorschau nach Änderung, Öffnen/Kopieren/Prüfen; fehlgeschlagene Checks sichtbar, erfolgreiche aufklappbar |
| Proxy | Aktiv / Port 80 | Direkt / Port 8080; Übernehmen/Verwerfen darunter |
| HTTPS, noch nicht eingerichtet | Voraussetzung, Angebot bzw. aktueller Einrichtungsschritt über volle Breite | Kein künstlicher leerer Diagnosebereich |
| HTTPS, vorbereitet/aktiv | Adresse und Zertifikat | DNS-Prüfung, Ausstellung, Umstellung, Erneuerung, Fehler/Wiederherstellung je vorhandenem Zustand |
| Patientenzugang | Aktuelle Freigabe, DNS, Adressauswahl und Bestätigung bei riskanten Kandidaten | Voraussetzungen, Fehler, Vorbereitung/Aktivierung/Entfernung und erneute Prüfung |

Vorhandene Controller, Host-Sperren und Bestätigungen bleiben maßgeblich.
Gespeicherte und entworfene Geräteadressen bleiben getrennt; Öffnen/Kopieren verwenden die gespeicherte Adresse.
Kein Netzwerkfehler wird durch die neue Erfolgs-Disclosure verborgen.
Die Hinweise auf Zuständigkeit der IT für Netztrennung bleiben sichtbar.

## Button-Konzept – zur Abstimmung, noch nicht umgesetzt

- Grün: wichtigste Aktion, die den nächsten Konfigurationsschritt ausführt (Übernehmen, Vorbereiten, Aktivieren).
- Hellgrau mit Kontur: sekundäre Werkzeuge wie Öffnen, Kopieren und Erneut prüfen.
- Textbutton: Zurück, Details, optionale Auswahlwege.
- Rot: destruktive Aktion wie Entfernen; vorhandene Bestätigungsdialoge bleiben bestehen.
- Disabled: eindeutig deaktiviert, gleicher Platz und gleiche Größe.

Die Button-Stile bleiben bis zur Rückmeldung unverändert.

## Prüfung

Manager-Typecheck, bestehende Manager-Tests, ESLint, CSS-Lint und Build.
Visuelle Vorschau mit echten Svelte-Komponenten und simulierten Daten: 1000 px, 480 px,
Adressabweichung, nicht eingerichteter Patientenzugang und HTTPS mit langen Hostnamen.
Keine Host-Konfiguration durch die Vorschau verändert. Nicht jeder Live-Zustand wurde manuell durchlaufen.
