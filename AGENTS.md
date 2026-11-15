# Commit-Autorschaft

Keine KI-Werkzeuge als Autor, Committer oder Co-Autor eintragen. Insbesondere keine
`Co-authored-by: Cursor <cursoragent@cursor.com>`-Zeilen hinzufügen. Die vorhandene
Git-Identität des Nutzers beibehalten. Andere menschliche Mitwirkende nur nach
ausdrücklicher Anweisung des Nutzers zuordnen.

Der lokale Commit-Hook unter `.githooks/commit-msg` sperrt Cursor-Co-Autor-Zusätze.
Mit `git config core.hooksPath .githooks` aktivieren; den Hook nicht umgehen.
