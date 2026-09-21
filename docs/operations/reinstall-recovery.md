# Neuinstallation und Recovery

Stand: 2026-09-21. Diese Betriebsbeschreibung ist der aktuelle Vertrag; der
abgeschlossene [Implementierungsplan](../archive/plan-reinstall-recovery.md)
dokumentiert nur noch die Entwurfsentscheidungen.

## Einstieg im Manager

Der Manager verwendet `HostStatus.installation` vom Setup-Backend:

- `fresh`: Installation beginnen.
- `healthy`: Wartung und Update; Neuinstallation bleibt ausdrücklich wählbar.
- `stopped`: vorhandene Installation sicher starten oder neu installieren.
- `needs-reinstall`: Gründe anzeigen und Neuinstallation anbieten.
- `installing`: den gespeicherten Vorgang öffnen.
- `docker-unavailable`: Docker bereitstellen; keine Installation fortsetzen.

Vor einem Start aus `stopped` prüft Setup das vorhandene App-Volume und die
Datenbank. Statusabfragen erzeugen keine Volumes und starten keine Container.
Wartung und Update werden auch im Backend auf eine gesunde Installation begrenzt.
Fehler optionaler Dienste werden getrennt angezeigt.

## Ein Ablauf für Erst- und Neuinstallation

1. Optional eine automatische Sicherung auswählen, dann `.pfinstall` wählen.
2. Setup prüft und kopiert Paket und Backup in den Vorgangsordner. Die bestehende
   Installation bleibt unverändert; nur Docker-Images dürfen im Cache hinzukommen.
3. Der Manager zeigt das vorbereitete Paket. Eine Neuinstallation verlangt eine
   ausdrückliche Bestätigung: alte Runtime-Daten und Dokument-Intake werden gelöscht,
   Geräte müssen neu gekoppelt werden, automatische Backups bleiben erhalten.
4. Setup setzt den Marker vor der ersten Änderung auf `installing`, entfernt bei
   Replace die eigenen Compose-Ressourcen und verwalteten Hostdateien und aktiviert
   das vorbereitete Release. Externe Speicherordner bleiben erhalten.
5. Der vorhandene Einrichtungsassistent startet den frischen Stack.
6. Mit gewähltem Backup wird die initiale HTTPS-Einrichtung übersprungen. Erst auf
   einer gesunden HTTP-Baseline erscheint die Online-Vorschau. Nach Bestätigung
   übernimmt der gemeinsame Restore-Core Einstellungen und gegebenenfalls HTTPS.
7. Erst nach erfolgreicher Health-Prüfung wird der Vorgang entfernt.

Ohne gewähltes Backup bleibt die normale optionale HTTPS-Einrichtung verfügbar.
Externe Backups können nach dem Abschluss im manuellen Restore unter Wartung
gewählt werden. Es gibt keine Unterstützung für Backup v1 oder separate TLS-Dateien.

## Automatische Sicherungen

Discovery liest ausschließlich reguläre `praxis-flow-backup-*.pfbackup` unter
`installHome/backups/`; Symlinks und Verzeichnisse werden ignoriert. Nutzbare
Format-2-Dateien erscheinen nach Sicherungszeit, neueste zuerst. Defekte neuere
Dateien verdecken ältere gültige Sicherungen nicht.

`archiveUsable` prüft Container, JSON, Manifest, Prüfsummen und TLS-Identität ohne
laufende App. `restoreCompatible` wird erst gegen die frisch gestartete App geprüft.
Der Manager erhält Candidate-IDs und Metadaten, keine Dateiinhalte oder Recovery-Pfade.

Prepare kopiert das gewählte Backup in den Vorgangsordner und speichert dessen
äußeren SHA-256. Commit, Vorschau und Restore prüfen die gepinnten Bytes erneut.
Die ursprüngliche Datei kann danach fehlen, ohne den Vorgang zu beeinflussen.
Dateien verwenden normale Benutzerrechte; es gibt keine zusätzliche Rechteverwaltung.

## Fehler und Neustart

Es gibt nur zwei persistente Phasen, kein Wiederanlaufjournal:

- `prepared`: bestätigen oder gefahrlos abbrechen.
- `installing`: gesunden Stack abschließen; nach Release-Aktivierung den Wizard
  öffnen; bei unklarem oder unvollständigem Zustand erneut bestätigt neu installieren.

Der Status-Poll führt keinen Reset aus. Ein erneuter Commit mit denselben Paketbytes
verlangt auch bei ursprünglich `fresh` eine neue Bestätigung und setzt den Teilstand
zurück. Der Vorgangsordner und `backups/` bleiben dabei erhalten.

Entscheidung vom 2026-09-21: Ist eine interne oder vom Benutzer ausgewählte
Sicherung unbrauchbar, bricht der betroffene Recovery-/Restore-Versuch mit einer
verständlichen Ursache ab. Dafür gibt es keinen zusätzlichen Reparatur- oder
Umgehungsablauf. Eine fehlende oder veränderte vorbereitete Sicherung wird nicht
still ersetzt oder übersprungen.

Ein normaler Restore-Fehler nutzt den bestehenden Rollback auf die frische
Installation. Angeboten werden Wiederholung, Abschluss ohne Backup oder erneute
Neuinstallation. Die verworfene Altinstallation ist kein Rollback-Ziel.
Nach einem Crash im Restore wird keine Fortsetzung an der letzten Einzelaktion
versprochen. Ist bereits HTTPS gesund aktiv, kann der Abschluss wiederholt werden;
eine erneute automatische HTTPS-Übernahme verlangt einen sauberen Neustart.

Die Ziel-Images und internen Installations-Secrets gewinnen immer gegen das Backup.
Provider-Zugangsdaten und die TLS-Identität sind dagegen wiederherstellbare Praxisdaten.

## API

| Route                                      | Aufgabe                                                       |
| ------------------------------------------ | ------------------------------------------------------------- |
| `GET /api/setup/host/install/backups`      | Offline geprüfte Backup-Candidates                            |
| `POST /api/setup/host/install/prepare`     | Paketpfad, Modus und optionale Candidate-ID vorbereiten       |
| `POST /api/setup/host/install/commit`      | Operation-ID und explizite Replace-Bestätigung                |
| `DELETE /api/setup/host/install/operation` | Nur `prepared` abbrechen                                      |
| `POST /api/setup/host/install/preview`     | Gepinntes Backup prüfen und gegebenenfalls online inspizieren |
| `POST /api/setup/host/install/finish`      | Operation-ID, `restore` oder `without-backup`                 |
| `POST /api/setup/host/installation/start`  | Bestehende Installation sicher starten                        |

Mutierende Aufrufe sowie die Recovery-Vorschau verwenden denselben Backend-Mutex.
Das Backend prüft den Zustand erneut; ein Renderer-Flag ersetzt kein Gate.

## Review-Nacharbeit (2026-09-21)

Backup-Prüfung und Restore verwenden dieselbe HTTPS-Prüfung. Bleibt bestehendes
HTTPS erhalten, bleibt auch dessen LAN-Adresse erhalten. Recovery-Restore hat
im Manager dasselbe Zeitlimit wie manueller Restore (zehn Minuten).

Dateiauswahl- und Prüffehler beenden den Vorgang mit einer Meldung. Wiederholen
wird nur nach erfolgreichem Rollback angeboten. Das eingebettete TLS-Manifest
akzeptiert ausschließlich Version 2; eigene chmod-/ACL-Sonderbehandlung entfällt.

Automatisierte Tests, Typprüfung, Lint und Manager-Build sind geprüft. Der
abschließende E2E-Durchlauf im Manager mit echtem Docker-Stack steht noch aus.
