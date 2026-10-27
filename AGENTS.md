# Bekannte Sicherheitslücken

Vor Änderungen [KNOWN_VULNERABILITIES.md](KNOWN_VULNERABILITIES.md) lesen.
**OFFEN: CVE-2026-111497 im Electron-Manager und dessen eingebettetem Setup.**
Lokaler Betrieb reduziert die Exposition, beseitigt die verwundbare Runtime aber
nicht. Bei Änderungen an Electron, Setup-Netzwerkzugriffen oder Releases den
Eintrag erneut bewerten und aktualisieren. Erst nach bestätigtem Fix und Prüfung
der ausgelieferten Manager-Runtime schließen; ein separates Node-Update reicht
nicht aus.

# Commit-Autorschaft

Keine KI-Werkzeuge als Autor, Committer oder Co-Autor eintragen. Insbesondere keine
`Co-authored-by: Cursor <cursoragent@cursor.com>`-Zeilen hinzufügen. Die vorhandene
Git-Identität des Nutzers beibehalten. Andere menschliche Mitwirkende nur nach
ausdrücklicher Anweisung des Nutzers zuordnen.

Der lokale Commit-Hook unter `.githooks/commit-msg` sperrt Cursor-Co-Autor-Zusätze.
Mit `git config core.hooksPath .githooks` aktivieren; den Hook nicht umgehen.
