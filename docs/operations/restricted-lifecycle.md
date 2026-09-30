# Restricted-Lifecycle: Entwurf, Commit und Updatevertrag

Stand: 17.09.2026.

## NIC-Auswahl

Ein Refresh aktualisiert den beobachteten Zustand, erhält aber eine noch gültige
NIC-Auswahl. Nur beim ersten Laden oder Wegfall der gewählten NIC wird auf das
vorhandene Binding beziehungsweise eine leere Auswahl zurückgefallen. Geänderte
Warnungen erfordern eine neue Bestätigung.

## Apply und Remove nach Prozessabbruch

Vor der ersten Konfigurationsänderung schreibt Setup exklusiv ein Journal nach
`state/restricted-operation/journal.json`. Es enthält `pending-apply` oder
`pending-remove`, Prozesskennung, bisherigen Laufzustand, bisherigen Env-Inhalt
und Caddy-Konfiguration. Dateien mit Zugangsdaten werden mit Modus 0600 geschrieben.
Journal und Commit-Dateien werden synchronisiert; Abschluss erfolgt durch ein
atomares Umbenennen des Journalverzeichnisses.

Die vorläufige Runtime verwendet `candidate.env` sowie ein Compose-Overlay mit
`restart: "no"`. Die normale `.env` enthält weiterhin den zuvor bestätigten
Sollzustand. Erst nach Runtime-Audit und bei Apply bestandenem Listeneraudit wird
`.env` atomar bestätigt und die Proxy-Restartpolicy wieder auf `unless-stopped`
gesetzt. Ein Prozessabbruch vor diesem Punkt kann keinen ungeprüften Proxy über
Dockers automatische Restartpolicy neu starten.

Beim Setup-Start und vor einem verwalteten Stackstart/Restart werden offene
Operationen geprüft. Ein lebender Besitzer sperrt einen parallelen Start. Bei
verwaistem Journal wird der Proxy über seine Compose-Projekt-/Service-Labels
entfernt, unabhängig davon, ob `.env` oder Compose-Konfiguration beschädigt sind.
Danach werden die vorherigen Einstellungen mit deaktiviertem Restricted-Marker
und einer Konfiguration ohne Listener 444 wiederhergestellt. Ein zuvor laufender
Staff-Proxy wird beim Setup-Recovery wieder gestartet; ein zuvor gestoppter Stack
bleibt gestoppt. Der Patientenzugang muss bewusst erneut aktiviert werden.

`state/restricted-recovery.json` und Inspect dokumentieren diese Rücknahme. Ein
unlesbares Journal oder ein nicht erreichbarer Docker-Daemon verhindert den Start;
das ist keine erfolgreiche Wiederherstellung. Ein unlesbares Journal darf nicht
blind gelöscht werden. Bereits laufende vorläufige Container werden beim Recovery
entfernt: Ein Prozess-Kill allein stoppt sie nicht unmittelbar. Manuelle Docker-
Aufrufe außerhalb des Setup-Workflows umgehen die verwalteten Startprüfungen.

## Vertrag aus dem Update-Release

Neue `.pfupdate`-Pakete enthalten `templates/proxy/portal-contract.json`. Der
Paketbau liest diesen Datenvertrag direkt aus dem ausgelieferten App-Image, auch
bei `--no-build`. Dadurch werden keine Regeln eines abweichenden Arbeitsbaums mit
älteren Images kombiniert. Der Vertrag wird über Manifest und SHA256SUMS geprüft.
Er enthält Format- und Renderer-Version sowie öffentliche/interne Portalrouten,
UI-Einstiege und Assetpfade. Unbekannte Versionen werden abgewiesen; es wird kein
JavaScript und kein freier Caddy-Code aus dem Paket ausgeführt.

Bei bestehender TLS-Konfiguration sind Pakete ohne passenden Vertrag unzulässig.
Ältere Manager, deren Paketformat den neuen Dateipfad nicht kennt, können solche
Pakete nicht einspielen und müssen zuerst aktualisiert werden.

Nach Sicherung und Stop wird der Zielvertrag unter `state/tls/portal-contract.json`
installiert und `state/tls/Caddyfile` daraus neu erzeugt. Caddy validiert die Datei
in einem kurzlebigen Container ohne Portfreigaben, bevor die Zielruntime startet.
Nach dem Start laufen Publish-Audit und bei aktivem Restricted-Zugang die
Host-/SNI-/Pfad-/Methodenproben gegen den Zielvertrag. Fehler lösen den vorhandenen
Update-Rollback aus; dessen TLS-Sicherung umfasst Caddyfile und installierten
Datenvertrag. Künftige Apply-/Remove-/Regenerierungsaufrufe lesen den installierten
Vertrag und fallen nicht auf die Routen des Managers zurück.

Das Caddyfile trägt zusätzlich zum Generator-Marker eine Vertragsversion und einen
SHA-256-Hash. Der Hash identifiziert die erzeugte Policy; er ersetzt weder Caddy-
Validierung noch Listenerprüfung. Das neue Restricted-Journal betrifft Apply/Remove;
es ist kein allgemeines crashfestes Journal für den gesamten Software-/DB-Updatepfad.

## Nachweise und verbleibende Produktabnahme

Automatisierte Tests prüfen NIC-Drafts, SIGKILL mit anschließender Recovery,
Trennung von vorläufigem und bestätigtem Env, Autostart-Overlay, Commit erst nach
Audit, Zielrelease-Routenwechsel und Update-Rollback bei Validierungs-/Auditfehlern.
Die isolierte Caddy-Integration prüft echte Host-/SNI-/Methodenabweisungen.

Reale Netzwerk-/Neustartabnahmen werden zentral unter [offene Abnahmen](../open-items.md) geführt. Portal und Staff verwenden bewusst denselben Frontend- und
App-Stack. Die Restricted-Grenze wird durch die Proxy-Positivliste sowie die
serverseitige API-Autorisierung erzwungen; ein separates Portal-Bundle ist nicht
geplant.

Windows-Vorbereitung: Manager-Paketierung hebt das macOS-Plattformgate nicht
auf. Ein kopiertes aktives Binding autorisiert keinen Windows-Stackstart;
aktive Restricted-Backups werden vor Restore-Cutover abgewiesen. Die reale
Freigabematrix bleibt unter [Windows-Abnahme](../open-items.md#windows-abnahmeprotokoll).
