# Wartezimmer · GitHub Pages

Die aktive Website liegt ausschließlich in `website/`. Frühere Entwürfe und
Originalbilder sind über die Git-Historie bis Commit `64dd37b` nachvollziehbar,
unter `docs/archive/website/`. Sie gehören nicht mehr zum aktuellen Dateibaum.

## Redaktioneller Aufbau

1. Mehr Ruhe für Team und Patienten. Zwei direkte Wege: Alltag ansehen / herunterladen.
2. Sechs Alltagssituationen mit jeweils einer konkreten Hilfe.
3. Ein Besuch mit Anmeldung, Unterlagen, optionaler Abwesenheit und Aufruf, jeweils aus Patienten- und Teamperspektive.
4. Klein anfangen, Download oder Unterstützung, kurze FAQ und Kontakt.

„Kostenlos im Praxisbetrieb · Lokal in Ihrer Praxis · In 5 Minuten startklar.“ bleibt
bereits im Hero sichtbar. Downloads und Technik haben eigene Seiten.
Header und Footer werden aus `partials/header.html` und `partials/footer.html`
beim Build eingesetzt. `{{SITE_HEADER}}` und `{{SITE_FOOTER}}` müssen in jeder
Seitenvorlage genau einmal stehen. `{{HOME}}` in der Header-Vorlage erhält auf
Unterseiten den Startseitenpfad; aktive Navigationslinks bekommen `aria-current`.

## Ratgeber und Vergleich

`patientenaufruf-vergleich.html` ist eine eigenständige Entscheidungshilfe für
Praxisinhaber, MFA-Leitung und Praxis-IT. Der Einstieg bleibt ein kompakter
Artikelkopf mit klarer Leserfrage und einer Einleitung zu Inhalt und Nutzen:
keine Hero-Sektion, kein dekoratives Einstiegsschaubild und keine Start-CTAs.
Das Layout folgt einem Fachartikel mit begrenzter Textbreite und sachlichen
Zwischenüberschriften. Der Artikel bleibt am Desktop mittig; links daneben steht
eine mitlaufende Sprungnavigation. Der Vergleich nutzt bis zu 1240 px Breite;
Fließtexte bleiben auf 850 px begrenzt. Die Leistungsmerkmale verteilen sich je nach
Spaltenbreite flexibel; Symbol und Bezeichnung bleiben zusammen. PVS-Namen bleiben
ab 640 px ohne Umbruch. Bis 1780 px steht die Navigation vor dem
Artikel, bis 1100 px werden die Anbieter als Karten dargestellt. Das Frau-Weber-Beispiel
erklärt den Stationswechsel mit drei Ablaufschritten, mobil untereinander.
Fachbegriffe dort verwenden, wo sie Entscheidungen präzisieren; Einleitungen und
Hinweise nicht mehrfach wiederholen. Der Praxischeck schließt an die Bestandsaufnahme
im PVS an. Auf schmalen Bildschirmen steht jeder Test direkt unter der zugehörigen
Alltagssituation. Offene Fragen aus dem Test führen zum nach Aufgaben gegliederten
Anbietervergleich. Herstellerangaben, empirische Befunde und eigene Produktangaben
werden getrennt und unmittelbar verlinkt. Die Anbieterperspektive und der
Recherchestand bleiben sichtbar; keine Rangliste oder unbelegte Einsparungsversprechen
ergänzen.

Die Anbieterperspektive steht auch vor der Tabelle; der Artikel nennt Daniel Deuter
sichtbar und als Person in den Article-Microdata. Der Einstieg behält die Leserfrage
unter der beschreibenden H1 „Patientenaufruf im Vergleich“.
Die persönliche Entstehungsgeschichte bleibt als letzter Expander auf der Ratgeberseite.
Im Vergleich bleiben Auswahlkriterien, Quellenbasis und der Hinweis auf nicht selbst
getestete Fremdprodukte. Studien, Methodik und Entstehungsgeschichte haben dezent graue Expander-Köpfe.
Anbieterdetails ergänzen die Tabelle um Zusatzkosten und Grenzen, ohne die
PVS-Angaben zu wiederholen. Betrieb und Demo-Hinweise bleiben kurz.

Betriebsmodell, Softwarepreis und PVS-Anbindung haben eigene Spalten;
eine weitere Spalte unterscheidet Kiosk/Self-Service, Mehrsprachigkeit je Oberfläche
und separate Raum-Panels. Nur dokumentierte Herstellerangaben aufnehmen und direkt
verlinken. Tablet-Kioskmodus für Fragebögen nicht mit einem Anmeldekiosk gleichsetzen,
Aufrufmonitore nicht mit Türanzeigen. Angekündigte Funktionen als solche kennzeichnen;
fehlende Belege bedeuten keine bestätigte Nichtverfügbarkeit. Angebote für Kliniken
nicht als enthaltene Leistungen des verglichenen Praxistarifs darstellen.
Bezugsgröße, Umsatzsteuer und Preisbedingungen bleiben sichtbar. Einzelheiten zu
Einrichtung und Export stehen unter der Tabelle. Studienergebnisse zur Entlastung
benennen Messgröße, Stichprobe, Design und Grenzen. Herstellerbefragungen nicht
als gemessene Wirksamkeit oder Zeitgewinn durch Wartezimmer darstellen.
CSV-Kontaktabgleich ist vorhanden; GDT-/PVS-Individualentwicklung bleibt vom
Standardumfang und einer geprüften Anbindung an ein konkretes PVS getrennt.
Monats- und Netto-Umrechnungen sind Rechenhilfen, keine abweichenden Tarife.
Das Kostenbeispiel umfasst auch Wartezimmer mit Einrichtung und Betrieb;
keine unbelegten Einrichtungsbudgets nennen.

Die Seite enthält Article-Microdata, Canonical- und Open-Graph-Metadaten, wird in
Sitemap und `llms.txt` aufgenommen und von der Startseite verlinkt. Sie benötigt
kein JavaScript. Preise und Quellen beim Aktualisieren erneut prüfen. Angaben zum
Manager-Backup, lokalen Portal und offenen Sicherheitsbefunden mit der Betriebsdokumentation abgleichen.

## Vorschau

```sh
node scripts/build-pages.mjs --preview
python3 -m http.server 8000 --directory dist/pages
```

`npm run lint:website` prüft JavaScript, CSS und ungenutzte Selektoren.
Ungenutzte Schriftdefinitionen, Animationen und CSS-Variablen werden ebenfalls gemeldet.
Zusätzlich zu PurgeCSS werden vollständige Selektoren gegen das mit den gemeinsamen
Vorlagen gerenderte HTML geprüft. Hover und Fokus sowie geöffnete Dialoge, Details
und ausgewählte Besuchsreiter werden dabei berücksichtigt. Neue dynamisch erzeugte
Strukturen müssen in `scripts/check-website-css.mjs` ausdrücklich modelliert werden.
`node --test scripts/build-pages.test.mjs scripts/check-website-css.test.mjs` prüft
den Build, die Interaktionen, gemeinsame Vorlagen und die CSS-Prüfung.
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
aktive Website nach `dist/pages/`. Alle bisherigen Veröffentlichungsplatzhalter sind ausgefüllt. Neue
`data-publish-placeholder`-Markierungen sperren den regulären Build:

- `downloads.html`: sieben Downloadlinks für Manager, Erstinstallation und Updates
  der Version 6.1.8 zeigen auf `nox-do/wartezimmer`, Release `v6.1.8`.
  Prüfsummen und Releaseübersicht sind ebenfalls verlinkt. Vor dem Website-Publish
  die Release-Assets bereitstellen und die tatsächliche Erreichbarkeit prüfen.
  Bei späteren Releases Versionen und URLs gemeinsam aktualisieren.
- `lizenzen.html`: Quellcode-Link auf `https://github.com/nox-do/wartezimmer` gesetzt. Der Build erzeugt
  `licenses/wartezimmer-LICENSE.txt` ausschließlich aus der Root-Datei `LICENSE`.
  Maßgeblich ist Version 1.1 vom 13. Oktober 2026
  ohne Entwurfs- oder Arbeitsfassungskennzeichnung. Die Übersicht erklärt erlaubte
  Praxisnutzung, Anpassung und beauftragte IT-Leistungen sowie erlaubnispflichtige
  Download-, Produkt- und Softwaredienstangebote. GitHub-Forks, automatische
  Quellcodearchive und Projektbeiträge sowie die nichtöffentliche direkte Weitergabe
  unveränderter Fassungen an einzelne Empfänger sind als Ausnahmen zu berücksichtigen.
  Details regelt die Lizenz. Das Projekt ist Source-available; sonstige Website-Inhalte
  sind nur bei ausdrücklicher Zuordnung umfasst.
- `datenschutz.html`: GitHub Pages als alleiniger Host, Google für E-Mail und
  Löschung nach Wegfall des Zwecks unter Beachtung gesetzlicher Aufbewahrungspflichten
  sind beschrieben. Anbieterinformationen sind verlinkt.

Betreiber- und Kontaktdaten wurden unverändert aus dem bisherigen Impressum
übernommen. Die bisherigen Veröffentlichungsmarkierungen sind durch die bestätigten Angaben ersetzt.
Keine fehlenden URLs, Lizenzentscheidungen oder rechtlichen Angaben erfinden.

## Schutz vor einfachen Crawlern

Der Build verpackt `impressum.html` und `datenschutz.html` mit dem lokal eingebundenen
StaticSeal-Runtime-Stand aus `vendor/staticseal/`. Besucher öffnen die vollständige
Seite mit einem Button ohne Passwort. JavaScript ist erforderlich; ein Hinweis
erscheint bei deaktiviertem JavaScript. Beide Seiten bleiben unter ihren bisherigen
URLs erreichbar, bitten um `noindex,nofollow,noarchive` und stehen nicht in der Sitemap.
Die übrigen Seiten, einschließlich Lizenz, bleiben direkt lesbar.

Die Startseite verweist für Kontakt auf `https://deuter.org`, `llms.txt` auf das Impressum. Auch die
kanonische Root-Lizenz verweist für gesonderte Vereinbarungen auf das Impressum;
der Lizenztext und sein Download werden weiterhin aus dieser Datei erzeugt.

Die Pakete enthalten Base64-kodiertes HTML, keine Verschlüsselung. Crawler, die
die Pakete dekodieren oder den Öffnen-Button auslösen, können die Inhalte lesen.
Quellen und Git-Historie des öffentlichen Repositorys bleiben ebenfalls lesbar.
Die Quellen in `website/` dienen der Bearbeitung; lokal immer den Build aus
`dist/pages/` ansehen. Beide Vorschau- und Veröffentlichungsbuilds verpacken die Seiten.
HTML und Links werden vor und nach dem Verpacken geprüft. Der Öffnungsbildschirm lädt das gemeinsame CSS und die beiden lokalen Schriften
vor, ohne die Website-Styles bereits anzuwenden. Das reduziert nachträgliche
Layoutwechsel beim Öffnen; bei sehr frühem Klick können Ressourcen noch laden.
Die CSP erlaubt den
Inline-Code des Öffnungsbildschirms über exakt berechnete SHA-256-Hashes.

Das Git-Remote ist `git@github.com:nox-do/wartezimmer.git`. Für die Veröffentlichung
GitHub Pages auf GitHub Actions einstellen und den Workflow manuell
starten. Jeder Build erzeugt die Sitemap und deren robots.txt-Verweis für
`https://nox-do.github.io/wartezimmer/`, einschließlich der Vergleichsseite.
Die Repository-Variable `PAGES_BASE_URL` kann diese Basisadresse überschreiben
(vollständige URL einschließlich Projektpfad).

## Google Search Console

Die URL-Präfix-Property lautet `https://nox-do.github.io/wartezimmer/`.
Im Sitemap-Feld hinter diesem Präfix nur `sitemap.xml` ohne führenden Schrägstrich
eintragen. Die vollständige Adresse muss
`https://nox-do.github.io/wartezimmer/sitemap.xml` sein;
`https://nox-do.github.io/sitemap.xml` gehört nicht zur Projektwebsite.

Der Build erzeugt zusätzlich `sitemap.txt` mit denselben URLs, eine pro Zeile.
Für den Vergleich bei anhaltendem Abruffehler der XML-Sitemap einmalig
`sitemap.txt` in derselben Property einreichen. Die bestehende XML-Sitemap bleibt
erhalten. Eine Einreichungsbestätigung belegt noch keine Verarbeitung: Im
Sitemap-Bericht müssen anschließend Status „Erfolgreich“ und erkannte Seiten
erscheinen. Das Textformat wird von Google unterstützt, garantiert aber keine
Verarbeitung oder Indexierung.

Die Sitemap enthält die sechs öffentlich indexierbaren Seiten. Der Build setzt
deren `{{CANONICAL_URL}}`-Platzhalter aus derselben Basisadresse wie die Sitemap.
Die bevorzugte Startseite ist das Projektverzeichnis mit abschließendem `/`,
nicht `index.html`. Beide URLs liefern bei GitHub Pages denselben Inhalt;
Canonical-Angabe und interne Links verweisen deshalb auf das Verzeichnis.
Auch Open Graph und die Artikel-Microdata der Vergleichsseite übernehmen die
konfigurierte Adresse. Impressum und Datenschutz bleiben bewusst `noindex` und
außerhalb der Sitemap.

Google liest `robots.txt` nur am Host-Stamm, hier unter
`https://nox-do.github.io/robots.txt`. Die im Projekt ausgelieferte
`/wartezimmer/robots.txt` wird dort nicht als Crawling-Regeldatei ausgewertet.
Ein HTTP 404 für die Datei am Host-Stamm sperrt das Crawling nicht. Deshalb die
Sitemap direkt in der Search Console einreichen; eine zusätzliche Datei im
separaten Host-Stamm ist für die Indexierung nicht erforderlich.

Bei „Konnte nicht abgerufen werden“ zuerst in den Sitemap-Details die vollständige
eingereichte URL prüfen und genau diese im URL-Prüftool live testen. Die Sitemap
muss HTTP 200 und XML liefern. Ein erfolgreicher Abruf vom eigenen Rechner
belegt noch nicht den Abruf durch Google. Nach Veröffentlichung geänderter
Canonical-Angaben die bevorzugte Startseite live prüfen und deren Indexierung
anfordern. Eine weiter als Duplikat ausgeschlossene `index.html` ist erwartbar,
wenn Google stattdessen die bevorzugte Startseite indexiert. „Gecrawlt – zurzeit
nicht indexiert“ bedeutet, dass Google die Seite bereits abrufen konnte; es ist
keine Zusage für eine spätere Indexierung und kein Beleg für ein Hostingproblem.

Referenzen: [Sitemap-Bericht](https://support.google.com/webmasters/answer/7451001?hl=de),
[Text-Sitemaps](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap#text),
[Canonical-Angaben](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls),
[robots.txt-Platzierung](https://developers.google.com/crawling/docs/robots-txt/create-robots-txt),
[robots.txt-HTTP-Status](https://developers.google.com/crawling/docs/robots-txt/robots-txt-spec),
[Seitenindexierung](https://support.google.com/webmasters/answer/7440203?hl=de).

## Assets

Nur auf den öffentlichen Seiten verwendete Bilder werden aktiv übernommen. Manrope und DM Sans werden
lokal ausgeliefert, Lizenztexte unter `licenses/`. Originale und frühere Styles,
Skripte und Entwürfe bleiben ausschließlich im Archiv. Produkt- und Techniktexte
bei Änderungen mit der Betriebsdokumentation und bestätigten Projektentscheidungen
abgleichen. Im Archiv liegen auch die bisherigen ausführlichen Quellen und Notizen.

### Raum-Panel-Visualisierung

Die frühere Datei `docs/archive/website/2026-10-12-unused-assets/produkt-room-panel-demo.jpg`
(bis Commit `64dd37b`) ist ein Browser-Screenshot einer statischen
Darstellung mit Beispieldaten, abgeleitet aus `RoomPanelPreview.svelte`,
`room-panel.css` und `tokens.css`. Außenpanel, Anzeige ohne Patientennamen:
Untersuchung 1, Bitte eintreten., A-003. Kein Screenshot einer laufenden Praxis.

`images/room-panel-tuer-foto.webp` wurde mit dem integrierten Imagegen-Werkzeug
unter Verwendung dieses UI-Screenshots als Bildschirmvorlage generiert und im
Reiter Weitergehen als Visualisierung eingesetzt.

Die frühere Datei `docs/archive/website/2026-10-12-unused-assets/produkt-tv-demo.jpg`
(bis Commit `64dd37b`) zeigt eine statische Anzeige mit Beispieldaten,
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

Nicht mehr verwendete Bilder bleiben über die Git-Historie bis Commit `64dd37b`
unter `docs/archive/website/2026-10-12-unused-assets/` verfügbar.

Die vier großen Illustrations-PNGs werden verlustfrei als WebP ausgeliefert.
Abmessungen und RGBA-Pixel wurden beim Konvertieren auf Gleichheit geprüft.
Die PNG-Originale sind im oben genannten historischen Stand erhalten. Die Lizenztextdatei wird
ausschließlich beim Build erzeugt; es gibt keine zweite gepflegte Quellfassung.
