# Wartezimmer – GitHub Pages

Die statische Projektwebsite liegt in `website/`.
`index.html`, `styles.css` und `demo.js` enthalten die Website und das interaktive
Beispiel. `technik.html` beschreibt den Betrieb auf einem vorhandenen Praxisrechner,
Mac- und Windows-Unterstützung, Installationsszenarien (intern, HTTPS und
getrennter Portalzugang) sowie Systemvoraussetzungen und optionale Bondrucker. Technische
Grundlage sind die damalige Auslieferungsdokumentation (Git-Historie) und `docs/operations/runtime.md`;
der erfolgreiche Windows-Test einschließlich Portalzugang wurde vom
Projektverantwortlichen am 07.10.2026 bestätigt (die Betriebsdokumentation
ist hierzu noch nicht nachgezogen). Konkrete Hardware-Mindestwerte werden
nach Betriebsprüfungen ergänzt. Die
verlinkten Docker-Anforderungen sind Voraussetzungen der Laufzeit, keine
Leistungszusage für den gesamten Praxisbetrieb.

Der eingebettete Entwurfsrahmen wurde entfernt. Alle Schriften und
Symbole liegen lokal; die Website benötigt keine externen CDNs, Analysewerkzeuge
oder dauerhafte Browserspeicherung. Die Beispiele verwenden fiktive Daten.

## Lokal vorbereiten

```sh
node scripts/build-pages.mjs --preview
python3 -m http.server 8000 --directory dist/pages
```

Die öffentlichen Texte sind für das Live-Angebot formuliert. Offene rechtliche
Angaben bleiben in markierten, teils ausgeblendeten Blöcken erhalten; der Build
verhindert deren Veröffentlichung.

## Navigation und Styles pflegen

Alle fünf Seiten verwenden denselben Header mit Logo, Untertitel und den Zielen
Ablauf, Funktionen, Downloads, Technik und Einführung. Die Technikseite markiert
Technik mit `aria-current="page"`. Änderungen am gemeinsamen Header auf allen
Seiten übernehmen. Links sind relativ und
funktionieren auch unter einem GitHub-Pages-Projektpfad. Die Navigation bleibt
auf kleinen Bildschirmen vollständig sichtbar und bricht in mehrere Zeilen um.

`styles.css` enthält die gemeinsamen Grundlagen und Komponenten, anschließend
responsive Regeln in ihrer bisherigen Kaskadenreihenfolge. `demo.js` steuert nur
das Besuchsbeispiel, die Ausbaustufen und den Download-Expander. Abschnittslinks
verwenden die native Browsernavigation; reduzierte Bewegung wird berücksichtigt.

## Downloadbereich

Der Bereich `#wz-downloads` liegt direkt unter dem Einstieg der Startseite.
Die Downloadtabelle hat Spalten für Version, AMD64 und ARM64 und enthält einen gemeinsamen
Link zur offiziellen Docker-Desktop-Downloadseite. Sieben Paketplätze sind
vorbereitet: Mac-Manager für beide Architekturen (`.dmg`), Windows-x64-Manager
(`.exe`) sowie Wartezimmer-Erstinstallationspakete (`.pfinstall`) für ARM64 und
AMD64 sowie Updatepakete (`.pfupdate`) für beide Architekturen. Solange öffentliche Release-Adressen fehlen, bleiben die Schaltflächen
deaktiviert und mit `data-publish-placeholder="download-url"` markiert. Die Texte
sind bereits aus der Perspektive des Live-Angebots formuliert. Zum Bereitstellen die
Schaltflächen durch echte Downloadlinks ersetzen, geprüfte Artefakt-URLs
eintragen und die jeweilige Platzhalter-Markierung entfernen. Mac-Manager je Architektur mit dem passenden Build verlinken.
Die Pakete werden mit dem Manager importiert; Updatepakete (`.pfupdate`)
sind davon getrennt.

Die Versionsspalte folgt den tatsächlich bereitgestellten Paketen: aktuell Mac-Manager
6.1.1, Windows-Manager 6.1.2, Erstinstallation und Update 6.1.1. Bei jedem Release
Versionen und Downloadziele gemeinsam aktualisieren. Docker Desktop verweist auf
den Versionsstand beim Anbieter.

## Vor der Veröffentlichung ergänzen

- `impressum.html`: Betreiber, Anschrift und Telefonnummer wurden aus dem
  BB-Pilot-Impressum übernommen. Die Kontakt-E-Mail `info@notaus.de` wurde vom
  Projektverantwortlichen bestätigt. Gegebenenfalls zusätzlich geltende Register-, Steuer- oder Berufsangaben
  vor Veröffentlichung prüfen. Grundlage: [§ 5 DDG](https://www.gesetze-im-internet.de/ddg/__5.html).
- `datenschutz.html`: die Rechtsgrundlagen,
  Löschfristen und für das tatsächliche GitHub-Hosting geltenden Angaben zu
  Vertragspartner und möglichen Drittlandübermittlungen. GitHub speichert
  IP-Adressen bei Pages-Aufrufen zu Sicherheitszwecken, siehe
  [GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages#data-collection).
- `lizenzen.html`: beschlossene Projektlizenz und öffentliche Quellcode-URL.
- Die Markierungen `data-publish-placeholder` erst entfernen, wenn der jeweils
  zugehörige Inhalt vollständig ist. Die Vorbereitungsnotizen dann entfernen.

`node scripts/build-pages.mjs` stoppt, solange diese Markierungen vorhanden sind.
Es kopiert ausschließlich Website-Dateien nach `dist/pages/`; README, Anwendung,
Konfiguration und Backups sind nicht Teil des veröffentlichten Artefakts.

## Maschinenlesbare Informationen

`llms.txt` beschreibt Wartezimmer, Zielgruppe, Module, Betrieb und den aktuellen
Verfügbarkeit des Live-Angebots. Alle HTML-Seiten verweisen über `rel="describedby"` darauf.
Die Datei enthält sachliche Produktinformationen und relative Seitenlinks.

Die Inhaltsstruktur der `llms.txt` ist bewusst auf diesen Stack ausgerichtet:
Zielgruppe und Nutzen → Besuchsabläufe/Journeys → sechs Ausbaustufen → PVS-Abgrenzung
→ Installation und Plattformen → Komponenten → Betriebsvarianten → Daten und
externe Dienste → Veröffentlichungsstand → öffentliche Seitenlinks.

Bei Änderungen die Aussagen mit `docs/architecture/system.md`,
`docs/architecture/routing.md`, `docs/architecture/documents.md`,
der damaligen Auslieferungsdokumentation (Git-Historie), `docs/operations/runtime.md` und
`docs/operations/tls.md` abgleichen. Aktuelle bestätigte Projektentscheidungen
haben Vorrang vor noch nicht nachgezogener Dokumentation, etwa beim Windows-Test.
Die Datei beschreibt Fakten statt Empfehlungen an KI-Systeme. Sie enthält keine
Behauptungen über automatische PVS-Integration, vollständige Offline-Fähigkeit,
pauschale Datenschutzkonformität oder einen konkreten, noch nicht beschlossenen
Lizenzbezeichner. Die Live-Texte setzen die vollständige Bereitstellung des
Open-Source-Angebots voraus; diese wird vor Veröffentlichung geprüft.
Vor Veröffentlichung die Download-/Quellcode-Verweise vervollständigen und
die Lizenzentscheidung umsetzen. Keine internen Zugangsdaten, Hostpfade oder Verwaltungs-URLs aufnehmen.

`robots.txt` erlaubt das Crawlen der öffentlichen Informationswebsite.
Bei einer GitHub-Pages-Projektseite gilt eine `robots.txt` im Projektverzeichnis
nicht als robots.txt der Host-Domain; deren Regeln müssen am Domain-Ursprung liegen.
Die Datei ist keine Zugriffskontrolle.

Sobald die öffentliche Website-Adresse feststeht, `PAGES_BASE_URL` mit dem
vollständigen Basis-Pfad setzen, zum Beispiel `https://example.org/wartezimmer/`.
Der Build erzeugt daraus `sitemap.xml` und ergänzt deren absolute Adresse in
`robots.txt`. Im GitHub-Workflow wird die Repository-Variable `PAGES_BASE_URL`
verwendet. Ohne Basis-Adresse bleibt die lokale Vorschau ohne Sitemap; es werden
keine erfundenen Domains publiziert.

Quelle der übernommenen Betreiberangaben:
`/Users/ddeuter/dev/work/bb_pilot/src/routes/impressum/+page.svelte`
(geprüft am 07.10.2026). Die BB-Pilot-Datenschutz- und Vertragsbedingungen gelten
für eine andere Anwendung und wurden nicht als Wartezimmer-Bedingungen übernommen.

## GitHub einrichten

Aktuell ist kein Git-Remote konfiguriert. Sobald das Ziel-Repository feststeht:

1. Repository mit den Website-Dateien und dem Workflow verbinden.
2. Unter **Settings → Pages → Source** die Option **GitHub Actions** wählen.
3. Die vollständige Website mit `node scripts/build-pages.mjs` prüfen.
4. Den Workflow **Publish website to GitHub Pages** manuell starten.

Der Workflow wird nicht durch einen Push ausgelöst. Alle eigenen Links und
Assets sind relativ und funktionieren auch unter `/<repository>/`.
Eine eigene Domain kann später in den Pages-Einstellungen ergänzt werden.

## Lizenzentscheidung für das Projekt

Im Repository gibt es derzeit keine eigene `LICENSE` und keinen Lizenzbezeichner
in den Workspace-Paketen. Drittanbieter-Lizenzen ersetzen keine Projektlizenz.

**Empfehlung: AGPL-3.0-only**, wenn verteilte Weiterentwicklungen und veränderte
Versionen, mit denen Nutzer über ein Netzwerk interagieren, weiterhin mit
Quellcode verfügbar sein sollen. Bei einer solchen veränderten Netzwerkversion
muss der entsprechende Quellcode den Nutzern angeboten werden. Das gilt auch
im Praxisnetz; eine Veröffentlichung für die ganze Welt ist nicht in jedem Fall
erforderlich. Kommerzielle Nutzung, Einrichtung, Wartung und Anpassung sind
erlaubt. Siehe [GNU zur AGPL](https://www.gnu.org/licenses/why-affero-gpl.de.html)
und den [vollständigen Lizenztext](https://www.gnu.org/licenses/agpl-3.0.html).

**Alternative: Apache-2.0**, wenn auch geschlossene Weiterentwicklungen erlaubt
sein sollen. Sie enthält eine ausdrückliche Patentlizenz; Lizenz- und
Urheberhinweise bleiben zu beachten. Siehe
[Apache License 2.0](https://www.apache.org/licenses/LICENSE-2.0).

Nach der Entscheidung: vollständigen unveränderten Lizenztext als `LICENSE`
hinzufügen, Geltungsbereich und Rechteinhaber klären, Paketmetadaten und README
angleichen und die Lizenz samt Quellcode-Link auf dieser Website nennen.
Bei AGPL müssen veränderte Netzwerkversionen außerdem einen geeigneten
Quellcode-Zugang anbieten; die Website allein erledigt das nicht für die App.

### Bisherige Prüfung von Fremdkomponenten

- Die Lockfile enthält vorwiegend MIT, ISC, BSD und Apache-2.0. Das ist eine
  Metadatenprüfung, keine vollständige Prüfung sämtlicher ausgelieferter Dateien.
- `caniuse-lite` verwendet CC-BY-4.0; `svg-tags` deklariert MIT im alten
  `licenses`-Feld. Die fehlenden Lizenzfelder der eigenen Workspace-Pakete sind
  noch offen.
- Die Website bündelt DM Sans und Manrope unter OFL-1.1 sowie SVG-Symbole aus
  Lucide 1.17.0 unter ISC / teilweise MIT. Die vollständigen mitgelieferten
  Lizenztexte stehen unter `licenses/` und sind auf `lizenzen.html` verlinkt.
- Caddy und Inter sind bereits in `THIRD_PARTY_NOTICES.txt` erfasst.
- Das Sandbox-Image enthält außerdem ClamAV und `clamav-libunrar`. ClamAV steht
  unter GPLv2 und wird als eigenständiges Programm über `clamscan` aufgerufen.
  Diese Komponenten behalten ihre eigenen Bedingungen; bei der Auslieferung
  sind deren Lizenztexte und Quellcodepflichten separat zu prüfen und in den
  Third-Party-Hinweisen zu ergänzen. Die UnRAR-Komponente hat zusätzliche
  Bedingungen. Siehe [ClamAV-Dokumentation](https://docs.clamav.net/) und
  [ClamAV-Upstream](https://github.com/Cisco-Talos/clamav).

Die Lizenzempfehlung bezieht sich auf den eigenen Projektcode. Mitgelieferte
Drittanbieter-Komponenten werden dadurch nicht um­lizenziert.

## Produktbilder

`images/` enthält lokal gespeicherte WebP-Ausschnitte der bereitgestellten
Screenshots mit fiktiven Demo-Daten. Der Einstieg kombiniert einen Detailausschnitt
der Warteliste und des Arztzimmers mit einem persönlichen Aufruf. Weiter unten
stehen die vergrößerbare Praxisübersicht, die Terminal-Anmeldung und der
Wartezimmer-TV. Die Aufnahmen zeigen unterschiedliche Momente; Nummern und
Die Wartenummer bleibt unverändert. Das Ziel auf dem Bon im Einstieg ist
als HTML umgesetzt und wechselt horizontal zwischen „Wartezimmer“, „Empfang“
und „Infektion 1“. Bei reduzierter Bewegung bleibt „Wartezimmer“ stehen. Browserleisten, Praxisüberschriften
und Zeitstempel werden in den jeweiligen Ausschnitten weggelassen.
Der Pages-Build übernimmt die verwendeten Bilder aus `images/`; die Unterordner `originale/` und `archiv/` werden ausgeschlossen.

## Orientierung: Produktkarussell

Der Abschnitt „Orientierung. Bei jedem Schritt.“ zeigt sechs Themen: Praxisübersicht, Anmeldung,
Terminal-Hardware und Bondrucker, Wartezimmer-TV, Wege/Routing sowie Raum-Panels.
Die Themenwahl, Pfeile und Tastatur (Links/Rechts, Home/End) wechseln die Karte;
auf Touchgeräten unterstützt der Inhaltsbereich horizontales Wischen. Es gibt
keinen automatischen Wechsel. Ohne JavaScript bleiben alle Karten untereinander
lesbar. Hardware, Routing und Tür-Panel sind ausdrücklich schematische Beispiele,
keine Hardware-Produktfotos oder Screenshots der Konfiguration.

## Gesicherter Ausprobieren-Bereich

Der interaktive Beispielbesuch ist vorerst aus der Website entfernt und unter
`snippets/ausprobieren.html` gesichert. Zum Wiederverwenden innerhalb von
`#wz-concept` einfügen. Die zugehörigen Styles und die bei vorhandenem
`#wz-ablauf` aktivierte Demo-Logik bleiben erhalten.

## Bondrucker auf der Technik-Seite

`technik.html#bondrucker` hält Anschlussmöglichkeiten und Auswahlkriterien kurz:
LAN/WLAN oder lokal am Terminal-Tablet bzw. Terminal-PC, 58/80 mm, Schneider,
Rollenwechsel und bei Tablet-USB gleichzeitiges Laden. Die öffentliche Seite
nennt MUNBYN P047-WiFi als Gerätetipp sowie Star TSP143IV UEWB/X4 und Epson
TM-T20IV als weitere Beispiele, ohne Produktlinks oder Preise.

Grundlage des vorhandenen Browserdrucks sind `docs/flows.md` und die
Druckkomponenten in `ui/src/lib/terminal/`. Automatischer Tablet- und gemeinsamer
Netzwerkdruck sind noch nicht umgesetzt und werden als in Vorbereitung bezeichnet.
Die Modellnennungen beruhen auf Herstellerangaben, nicht auf Tests mit Wartezimmer.
Vor einer Gerätefreigabe Anschlüsse, Druckanbindung, Layout und Schnitt prüfen.


## Eigenständiger Entwurf zum Praxisalltag

`praxisalltag.html` und `praxisalltag.css` enthalten den eigenständigen Entwurf
mit sechs Entlastungswünschen, einer offenen Patientenjourney und benannten
Quellen von BGW sowie KBV/IGES. Die Quellen belegen den fachlichen Hintergrund,
nicht die Wirksamkeit von Wartezimmer.

Der Entwurf ist unter `/praxisalltag.html` erreichbar und wird nur beim
Pages-Build mit `--preview` kopiert. Er ist mit `noindex` markiert.
Die Startseite wird erst nach redaktioneller Abstimmung angepasst.

Die Illustrationen zum Entwurf sind nach ihrem Einsatz benannt:
`journey-anmeldung`, `journey-unterlagen-wartezeit`,
`journey-abwesenheit-rueckholen` und `journey-aufruf-behandlungsraum`.
Für Wunsch 2 und 6 liegen `wunsch-teamueberblick-{grau,farbe}` und
`wunsch-patienten-begleiten-{grau,farbe}` vor. Umbenannte PNG-Originale
bleiben erhalten; die Seite lädt optimierte WebP-Versionen.
Die Wunschbilder starten grau, wechseln bei Hover und Tastaturfokus in Farbe
und lassen sich per Klick oder Antippen umschalten (`praxisalltag.js`).

Wunsch 5 verwendet das Bildpaar `wunsch-raumorientierung-{grau,farbe}`
(ursprünglich `room_panel_2.png` und `room_panel_1.png`).

Wunsch 1 verwendet `wunsch-empfang-entlasten-{grau,farbe}`
(ursprünglich `empfang_2.png` und `empfang_1.png`).

Wunsch 3 verwendet `wunsch-digitale-unterlagen-{grau,farbe}`
(aktualisiertes Paar: `portal_1.png` in Grau und `portal_2.png` in Farbe).

Wunsch 4 verwendet `wunsch-abwesenheit-rueckkehr-{grau,farbe}`
(ursprünglich `raus_1.png` in Grau und `raus_2.png` in Farbe).
Damit haben alle sechs Wunschkarten ein Bildpaar.


Der Praxisalltag-Entwurf verbindet inzwischen Wünsche und Journey mit
ausgewählten Startseiteninhalten: dem 15-Minuten-Einstieg, offenem lokalem
Betrieb, Hilfe nach Bedarf, Technik, FAQ und direktem Kontakt. Downloads
verweisen auf den gepflegten Bereich der Startseite.


## Bildablage und Benennung

- `images/`: verwendete, für die Website optimierte WebP-Dateien.
- `images/originale/`: die 16 PNG-Originale der Illustrationen, mit demselben Basisnamen wie ihre WebP-Version.
- `images/archiv/`: derzeit unbenutzte Bilder; aktuell die ältere Produktansicht zum Patientenaufruf.

Die Präfixe unterscheiden echte Produktansichten (`produkt-`),
Illustrationen zum Besuch (`journey-`) und die sechs Wunschmotive (`wunsch-`).
Bei Bildpaaren bezeichnet `-grau` die Ausgangsansicht und `-farbe` die
Hover-Ansicht. Originale und Archiv werden weder im Vorschau- noch im
Veröffentlichungsbuild ausgeliefert.
