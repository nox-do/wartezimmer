# Demo-Belegung im lokalen Docker-Stack

Vom Repository aus:

```sh
npm run dev:seed
npm run dev:seed -- --patients 60 --rooms 8
```

Standard: auf insgesamt 19 aktive Patienten und mindestens fünf nutzbare Räume
auffüllen. Bestehende Besuche zählen zur Zielzahl. Die Belegung verteilt sich auf
alle aktivierten regulären Praxis-Anliegen, etwa Blutabnahme, Termin, offene
Sprechstunde, Rezept / Überweisung und Infekt / Erkältung. „Persönliche Anmeldung“ wird nicht als
reguläres Anliegen verwendet.

Die Patienten haben überwiegend fiktive, natürlich wirkende Namen. Etwa ein
Drittel der weiteren Anmeldungen erfolgt ohne Namen (`authPath: none`, keine
`identityRef`); die Oberfläche zeigt dafür die Anmeldenummer. Die drei gezielten
Testkontakte Lena Sommer, Paul Winter und Nora Berg werden bevorzugt ergänzt,
solange bis zur Zielzahl noch Platz ist. Sie besitzen jeweils eine eigene
Mobilnummer und ein Geburtsdatum. Der Befehl ergänzt diese Kontakte auch in der
bestehenden `kontakte.csv`, sofern diese das Demo-Spaltenformat verwendet.
Bereits vorhandene Zeilen bleiben erhalten.

Vorhandene aktivierte Räume werden genutzt. Fehlende Räume werden als
„Empfang“, „Dr. Jonas Bergmann“, „Untersuchung 1“, „Labor“ und
„Infekt-Wartezimmer“; weitere Räume heißen „Untersuchung 2“ usw. ergänzt. Neu angelegte Besuche werden zunächst
ins Wartezimmer zurückgesetzt und dann auf die ausgewählten Räume verteilt
(ein Patient je Raum, bis zu zwei im Infekt-Wartezimmer, höchstens die konfigurierte Kapazität).
Die übrigen warten. Bereits vorhandene Besuche werden nicht umplatziert.

Der Befehl arbeitet ausschließlich mit `docker-compose.yml` und verlangt
`NODE_ENV=development` im laufenden App-Container. Er pausiert die App kurz,
befüllt deren bestehendes Datenvolume über die normalen Datenbank-Workflows und
startet die App anschließend wieder. Ein Image-Neubau ist nicht erforderlich.
Danach die Oberfläche neu laden.

Der aktuelle Praxistag muss gestartet und der Check-in freigegeben sein.
Der Befehl startet oder löscht keinen Praxistag und verschickt keine Nachrichten.
Bestehende reguläre Patienten, Anliegen und Räume bleiben erhalten.
Beim Wechsel vom alten Seed werden aktive Besuche des bisherigen Anliegens
`dev-demo` storniert und das Anliegen „Demo · Sprechstunde“ aus den Einstellungen
entfernt. Die Stornierungen bleiben in der Historie erhalten. Alte vom Script
erzeugte Raumbezeichnungen verlieren ihren „Demo · “-Zusatz. Anschließend wird
mit der neuen Mischung bis zur Zielzahl aufgefüllt.

Spätere Aufrufe füllen nur bis zur angegebenen Gesamtzahl aktiver Patienten auf.
Kleinere Zahlen löschen keine regulären Patienten oder Räume. Ist der Bestand
bereits voll, wird keine neue Mischung erzwungen. Für einen vollständig frischen
Screenshot-Bestand einen neuen Praxistag starten und danach erneut seeden.

Grenzen: 1–200 Patienten und 1–20 Räume. Die gewöhnliche Tagesbereinigung entfernt
auch die Demo-Besuche; danach kann der Befehl wieder verwendet werden.
