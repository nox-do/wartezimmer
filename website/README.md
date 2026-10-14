# Wartezimmer · GitHub Pages

Die aktive Website liegt ausschließlich in `website/`. Frühere Entwürfe und
sämtliche Originalbilder sind vollständig unter `docs/archive/website/2026-10-10/`
archiviert. Das Archiv wird nicht veröffentlicht.

## Redaktioneller Aufbau

1. Mehr Ruhe für Team und Patienten. Zwei direkte Wege: Alltag ansehen / herunterladen.
2. Sechs Alltagssituationen mit jeweils einer konkreten Hilfe.
3. Ein Besuch mit Anmeldung, Unterlagen, optionaler Abwesenheit und Aufruf, jeweils aus Patienten- und Teamperspektive.
4. Klein anfangen, Download oder Unterstützung, kurze FAQ und Kontakt.

„Kostenlos im Praxisbetrieb · Lokal in Ihrer Praxis · In 5 Minuten startklar.“ bleibt
bereits im Hero sichtbar. Downloads und Technik haben eigene Seiten.
Die Header- und Footer-Navigation auf allen Seiten gemeinsam pflegen.

## Vorschau

```sh
node scripts/build-pages.mjs --preview
python3 -m http.server 8000 --directory dist/pages
```

`npm run lint:website` prüft JavaScript, CSS und ungenutzte Selektoren.
`node --test scripts/build-pages.test.mjs` prüft den Build und die Interaktionen.
Jeder Build prüft das fertige Artefakt auf HTML-Fehler, doppelte IDs, defekte
interne Links und Anker, fehlende ARIA-Ziele, nicht aufgelöste Vorlagen sowie
fehlende oder ungenutzte Bild- und Schriftdateien. Interne Links müssen auch
unter einem GitHub-Pages-Projektpfad funktionieren. Diese Prüfungen laufen
ebenfalls im Pages-Workflow.

Keine Framework-Laufzeit, externen Schriften, Analysewerkzeuge, Cookies oder
Browserspeicherung. Relative Pfade funktionieren unter GitHub-Pages-Projektpfaden.
`site.js` ergänzt zugängliche Tabs mit Pfeiltasten/Home/End. Ohne JavaScript
bleiben alle Besuchsstationen lesbar. Die Wunschbilder wechseln bei Hover und
Tastaturfokus von Grau zu Farbe; auf Touch-Geräten sind sie direkt farbig.
Reduzierte Bewegung wird berücksichtigt. Bilder sind ausdrücklich Illustrationen
oder echte Produktansichten mit fiktiven Daten. Keine erfundenen Referenzen.

## Veröffentlichungsstand

Der manuelle Workflow `.github/workflows/pages.yml` baut ausschließlich die
aktive Website nach `dist/pages/`. Der reguläre Build bleibt gesperrt, solange
`data-publish-placeholder` in den öffentlichen HTML-Dateien steht:

- `downloads.html`: sieben geprüfte Release-URLs einsetzen. Mac-Manager 6.1.3,
  Windows-Manager 6.1.3, Erstinstallation/Updates 6.1.3. Versionen und URLs
  gemeinsam aktualisieren; deaktivierte Buttons durch Downloadlinks ersetzen.
- `lizenzen.html`: öffentlichen Quellcode-Link ergänzen. Der Build erzeugt
  `licenses/wartezimmer-LICENSE.txt` ausschließlich aus der Root-Datei `LICENSE`.
  Maßgeblich ist Version 1.1 vom 13. Oktober 2026
  ohne Entwurfs- oder Arbeitsfassungskennzeichnung. Die Übersicht erklärt erlaubte
  Praxisnutzung, Anpassung und beauftragte IT-Leistungen sowie erlaubnispflichtige
  Download-, Produkt- und Softwaredienstangebote. GitHub-Forks, automatische
  Quellcodearchive und Projektbeiträge sowie die nichtöffentliche direkte Weitergabe
  unveränderter Fassungen an einzelne Empfänger sind als Ausnahmen zu berücksichtigen.
  Details regelt die Lizenz. Das Projekt ist Source-available; sonstige Website-Inhalte
  sind nur bei ausdrücklicher Zuordnung umfasst.
- `datenschutz.html`: bestehende Hosting- und Kontaktangaben vervollständigen.

Betreiber- und Kontaktdaten wurden unverändert aus dem bisherigen Impressum
übernommen. Vorhandene Veröffentlichungsmarkierungen bleiben erhalten.
Keine fehlenden URLs, Lizenzentscheidungen oder rechtlichen Angaben erfinden.

Aktuell ist kein Git-Remote eingerichtet. Für die Veröffentlichung Repository
verbinden, GitHub Pages auf GitHub Actions einstellen und den Workflow manuell
starten. Mit Repository-Variable `PAGES_BASE_URL` (vollständiger URL einschließlich
Projektpfad) werden Sitemap und deren robots.txt-Verweis erzeugt.

## Assets

Nur auf den öffentlichen Seiten verwendete Bilder werden aktiv übernommen. Manrope und DM Sans werden
lokal ausgeliefert, Lizenztexte unter `licenses/`. Originale und frühere Styles,
Skripte und Entwürfe bleiben ausschließlich im Archiv. Produkt- und Techniktexte
bei Änderungen mit der Betriebsdokumentation und bestätigten Projektentscheidungen
abgleichen. Im Archiv liegen auch die bisherigen ausführlichen Quellen und Notizen.

### Raum-Panel-Visualisierung

`../docs/archive/website/2026-10-12-unused-assets/produkt-room-panel-demo.jpg` ist ein Browser-Screenshot einer statischen
Darstellung mit Beispieldaten, abgeleitet aus `RoomPanelPreview.svelte`,
`room-panel.css` und `tokens.css`. Außenpanel, Anzeige ohne Patientennamen:
Untersuchung 1, Bitte eintreten., A-003. Kein Screenshot einer laufenden Praxis.

`images/room-panel-tuer-foto.webp` wurde mit dem integrierten Imagegen-Werkzeug
unter Verwendung dieses UI-Screenshots als Bildschirmvorlage generiert und im
Reiter Weitergehen als Visualisierung eingesetzt.

`../docs/archive/website/2026-10-12-unused-assets/produkt-tv-demo.jpg` zeigt eine statische Anzeige mit Beispieldaten,
abgeleitet aus der TV-Route, `tv.css` und `tokens.css`.
`images/wartezimmer-tv-foto.webp` wurde mit dem integrierten Imagegen-Werkzeug
und diesem Screenshot als Bildschirmvorlage generiert. Die Fotovisualisierungen
wechseln im Reiter Weitergehen alle zwei Sekunden ohne Bedienelemente.
Ausgeblendete oder nicht sichtbare Galerien wechseln nicht weiter.
Bei reduzierter Bewegung ist der automatische Wechsel deaktiviert.

### Formatierter Lizenztext

`lizenz.html` ist die UTF-8-HTML-Vorlage für den vollständigen Lizenztext.
`scripts/build-pages.mjs` erzeugt ihren Inhalt direkt aus der Root-Datei `LICENSE`,
mit Absätzen und verlinkbaren Abschnittsüberschriften. Die Website-Lizenzdatei
wird beim Build ebenfalls aus `LICENSE` erzeugt. Der Leselink führt auf die
HTML-Seite; die Textdatei ist dort zusätzlich als Download verlinkt.

Nicht verwendete Bilder liegen unter [`docs/archive/website/2026-10-12-unused-assets/`](../docs/archive/website/2026-10-12-unused-assets/README.md).

Die vier großen Illustrations-PNGs werden verlustfrei als WebP ausgeliefert.
Abmessungen und RGBA-Pixel wurden beim Konvertieren auf Gleichheit geprüft.
Die PNG-Originale liegen im oben genannten Archiv. Die Lizenztextdatei wird
ausschließlich beim Build erzeugt; es gibt keine zweite gepflegte Quellfassung.
