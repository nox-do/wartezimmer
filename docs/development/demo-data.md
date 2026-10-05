# Demo-Belegung im lokalen Docker-Stack

Vom Repository aus:

```sh
npm run dev:seed
npm run dev:seed -- --patients 60 --rooms 8
```

Standard: sechs zusätzliche Demo-Räume mit je zwei Plätzen und 30 fiktive Patienten.
Zwölf Patienten belegen Räume, die übrigen warten. Alle Namen und Räume tragen
„Demo“, das zusätzliche Anliegen heißt „Demo · Sprechstunde“.

Drei gezielte Testkontakte werden ebenfalls angelegt: Lena Sommer, Paul Winter
und Nora Berg, jeweils mit eigener Mobilnummer und eigenem Geburtsdatum.
Der Befehl ergänzt sie auch in der bestehenden `kontakte.csv`, sofern diese
das Demo-Spaltenformat verwendet. Bereits vorhandene Zeilen bleiben erhalten.
Auch bei schon voller Demo-Belegung werden fehlende Testkontakte hinzugefügt.

Der Befehl arbeitet ausschließlich mit `docker-compose.yml` und verlangt
`NODE_ENV=development` im laufenden App-Container. Er pausiert die App kurz,
befüllt deren bestehendes Datenvolume über die normalen Datenbank-Workflows und
startet die App anschließend wieder. Ein Image-Neubau ist nicht erforderlich.
Danach die Oberfläche neu laden.

Der aktuelle Praxistag muss gestartet und der Check-in freigegeben sein.
Der Befehl startet oder löscht keinen Praxistag und verschickt keine Nachrichten.
Bestehende Patienten und Einstellungen bleiben erhalten. Demo-Räume und -Anliegen
werden einmalig ergänzt; spätere Aufrufe füllen die aktuelle Demo-Belegung bis zur
angegebenen Patientenzahl auf. Bereits belegte Räume werden berücksichtigt.
Kleinere Zahlen löschen keine vorhandenen Patienten oder Räume.

Grenzen: 1–200 Patienten und 1–20 Räume. Die gewöhnliche Tagesbereinigung entfernt
auch die Demo-Besuche; danach kann der Befehl wieder verwendet werden.
