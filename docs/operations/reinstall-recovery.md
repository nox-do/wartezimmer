# Neuinstallation und Recovery

Stand: 2026-09-30. Diese Betriebsbeschreibung ist der aktuelle Vertrag für Erstinstallation, Neuinstallation und Recovery.

## Einstieg im Manager

Der Manager verwendet `HostStatus.installation` vom Setup-Backend:

- `fresh`: Installation beginnen.
- `healthy`: Wartung und Update; Neuinstallation bleibt ausdrücklich wählbar.
- `stopped`: vorhandene Installation sicher starten.
- `needs-reinstall`: belegtes Fehlen von App-Image, Datenvolume oder Datenbank; Gründe
  anzeigen und Neuinstallation anbieten.
- `needs-repair`: Betriebs- oder Authentifizierungsstörung; Gründe anzeigen und
  gezielte Prüfung verlangen, ohne Neuinstallationsaufforderung.
- `inconsistent`: Konfiguration, Release-State oder Installationsmarker nicht
  belastbar; Gründe anzeigen und gezielte Wiederherstellung verlangen.
- `starting`: Gesundheitsprüfungen laufen; auf deren Abschluss warten.
- `installing`: den gespeicherten Vorgang öffnen.
- `docker-unavailable`: Docker bereitstellen; keine Installation fortsetzen.

Vor einem Start aus `stopped` prüft Setup das lokale App-Image, das vorhandene
App-Volume und die Datenbank. Erfolgreiche Docker-Bestandsabfragen belegen fehlende
Images/Volumes; der Prüfcontainer meldet eine fehlende Datenbank mit eigenem
Exit-Code. Fehler bei Compose-Start, Health-Timeout oder Maintenance-Authentifizierung
führen zu `needs-repair`. Technische Prüffehler bleiben strukturierte API-Fehler;
Docker-Ausgaben werden nicht als öffentliche Gründe transportiert. Statusabfragen erzeugen keine Volumes und starten keine Container.
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
6. Mit gewähltem Backup erscheint erst auf einer gesunden HTTP-Baseline die
   Online-Vorschau. Nach Bestätigung
   übernimmt der gemeinsame Restore-Core Einstellungen und gegebenenfalls HTTPS.
7. Erst nach erfolgreicher Health-Prüfung wird der Vorgang entfernt.

Der Assistent richtet die HTTP-Baseline ein und hat keinen HTTPS-Schritt.
Ohne gewähltes Backup kann HTTPS nach dem Abschluss unter **Netzwerk** eingerichtet werden.
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

Automatisierte Tests, Typprüfung, Lint und Manager-Build sind geprüft.
Der verbleibende E2E-Nachweis wird unter [offene Abnahmen](../open-items.md) geführt.

## Windows-Vorbereitung

Manager-Installer-Upgrade/-Deinstallation und fachliche Neuinstallation sind
getrennte Vorgänge. NSIS entfernt keine Praxisdaten und führt keinen Setup-Reset
aus. Die vorhandenen Phasen `prepared`/`installing` sowie Update-/Restore-/TLS-
Journale bleiben maßgeblich. Beim Schließen oder Absturz des Managers endet
seine Setup-API über den IPC-Lebenszyklus; bereits an Docker übergebene Aufträge
sind damit nicht garantiert abgebrochen. Nach Wiederstart Zustand erneut lesen
und die vorhandene Recovery verwenden. Kein Löschen ungeklärter Journale.
Windows-Dateisperren und Recovery mit echten Containern sind noch abzunehmen:
[Protokoll](../open-items.md#windows-abnahmeprotokoll).
