# Wartezimmer – GitHub Pages

Die statische Website bleibt während der Vorbereitung in `mockups/wartezimmer/`.
`index.html`, `styles.css` und `demo.js` enthalten die Website und das interaktive
Beispiel. Der eingebettete Entwurfsrahmen wurde entfernt. Alle Schriften und
Symbole liegen lokal; die Website benötigt keine externen CDNs, Analysewerkzeuge
oder dauerhafte Browserspeicherung. Die Beispiele verwenden fiktive Daten.

## Lokal vorbereiten

```sh
node scripts/build-pages.mjs --preview
python3 -m http.server 8000 --directory dist/pages
```

Die Vorschau enthält die noch offenen rechtlichen Angaben.

## Vor der Veröffentlichung ergänzen

- `impressum.html`: tatsächlicher Betreiber, ladungsfähige Anschrift, Kontakt
  und gegebenenfalls Rechtsform, Vertretungsberechtigte, Registerdaten, USt-ID
  oder berufsrechtliche Angaben. Grundlage: [§ 5 DDG](https://www.gesetze-im-internet.de/ddg/__5.html).
- `datenschutz.html`: dieselben Betreiberangaben sowie die Rechtsgrundlagen,
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
