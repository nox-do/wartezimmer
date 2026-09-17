# Portal-Frontend im gemeinsamen Stack isolieren

Stand: 17.09.2026. Status: geplant, noch nicht umgesetzt.

## Auftrag und Ausgangspunkt

Das Patientenportal soll am Restricted-Listener ausschließlich seine eigene UI,
seine benötigten Assets und die freigegebenen Portal-APIs bereitstellen. Ein
gemeinsamer Caddy, App-Prozess, Datenbank und Installations-/Updateweg bleiben
erhalten. Es entsteht kein zweiter Laufzeit-Stack.

Der kurzfristige Fix in `app/src/routes/ui-static-routes.ts` verhindert den
SPA-Fallback für fehlende `/_app`-Assets und Favicons, auch bei URL-kodierten
Pfaden. Vorhandene Staff-Chunks bleiben unter der bisherigen Wildcard erreichbar.
Das ursprüngliche Finding ist damit nur teilweise behoben; die folgenden
Arbeitspakete schließen die verbleibende Freigabe des gemeinsamen Builds.

## Verbindliches Zielbild

- Eigener Portal-Frontend-Build mit ausschließlich den vier Portal-Seiten,
  erforderlichen Layouts, Fehlerseite und gemeinsam benötigten Bibliotheken.
- Eigene Portal-HTML-Shell und eigener Asset-Namespace, vorgeschlagen
  `/portal-assets/`. Keine Staff-Routen im Portal-Routenregister.
- Die URLs `/portal`, `/portal/`, `/portal/menu`, `/portal/upload` und
  `/portal/anamnese` bleiben erhalten. API-URLs bleiben unverändert.
- Portal-Routen liefern auch am Staff-Origin dieselbe Portal-Shell. Damit
  bleiben interne Portalaufrufe erhalten, ohne zwei Portalversionen zu pflegen.
- Restricted erlaubt GET/HEAD für die expliziten UI-Einstiege und ausschließlich
  vorhandene Dateien des Portal-Builds. Ein Asset-Namespace darf niemals auf
  eine SPA-Shell zurückfallen. Andere Methoden und unbekannte Routen sind gesperrt.
- Der Staff-Build und sein `/_app`-Namespace sind am Restricted-Listener gesperrt.
- Portal-Sessions und serverseitige Autorisierung bleiben die Datengrenze.
  Dieser Umbau schafft keine Prozess- oder Datenbankisolation.

## Arbeitspakete in Ausführungsreihenfolge

### 1. Buildgrenze und Abhängigkeiten festlegen

- [ ] `ui/src/routes/portal`, Root-Layout, Fehlerseite, `ui/src/app.css`,
      `$lib/portal`, Übersetzungsloader und gemeinsame Komponenten auf tatsächliche
      Portal-Abhängigkeiten prüfen; dynamische Imports und statische URLs einschließen.
- [ ] Ein separates Portal-Buildziel mit eigener SvelteKit-Konfiguration und
      eigenem Ausgabeverzeichnis anlegen. Gemeinsamen Quellcode referenzieren;
      keine manuell synchronisierten Kopien der Portal-Seiten erzeugen.
- [ ] Portal-Routen aus dem Staff-Routenregister entfernen und sicherstellen,
      dass Navigation vom Staff-Bereich ins Portal einen vollständigen Seitenaufruf
      ausführt, statt den Staff-Client-Router zu verwenden.
- [ ] Mit einem kleinen produktiven Build nachweisen, dass die öffentlichen
      `/portal`-URLs und der separate Asset-Namespace zusammen funktionieren.
      Keine nachträglichen Textersetzungen im kompilierten SvelteKit-Router einsetzen.

Abnahme: Das erzeugte Portal-Routenregister enthält keine MFA-, Ops-, Terminal-,
TV- oder sonstigen Staff-Routen. Dynamisch benötigte Portal-Abhängigkeiten sind
vollständig enthalten. Gemeinsam genutzte Hilfsfunktionen sind zulässig;
Staff-Seiten und ausschließlich für Staff benötigte Module sind es nicht.

### 2. Auslieferung und Proxyvertrag umstellen

- [ ] `app/src/routes/ui-static-routes.ts` um eine getrennte Portal-Static-Root
      und eine exakte Zuordnung der Portal-UI-Einstiege zur Portal-Shell erweitern.
- [ ] Portal-Assets nur aus dem Portal-Ausgabeverzeichnis bedienen; Verzeichnis-
      listing, Pfadtraversal, Sourcemaps und Zugriff auf Build-Metadaten ausschließen.
- [ ] `packages/server-shared/src/portal-surface.ts` auf den neuen Assetvertrag
      umstellen: gemeinsame `/_app`-Freigabe entfernen, Versionsdatei und Icons
      ebenfalls dem Portal zuordnen. Keine generelle `/portal/*`-SPA-Freigabe.
- [ ] `setup/src/proxy-tls.ts` anpassen und Generatorversion erhöhen, damit
      bestehende generierte Konfigurationen den neuen Vertrag übernehmen können.
- [ ] Fehlender Portal-Build liefert einen eindeutigen Fehler und niemals die
      Staff-Shell. Fehlende Dateien bleiben bei GET und HEAD hart 404.

Abnahme: Portal-UI und Portal-Assets funktionieren auf beiden vorgesehenen
Origins. Restricted weist den bisherigen Staff-Asset-Namespace und alle nicht
freigegebenen UI-/API-Pfade ab. Ein eigener reiner Portal-Dateibaum mit strikter
Existenzprüfung genügt; eine pro Release wechselnde Hashliste in Caddy ist dafür
nicht erforderlich.

### 3. Build, Lieferung und Upgrade vollständig integrieren

- [ ] Root- und UI-Buildskripte, `scripts/build-ui.mjs` und
      `scripts/copy-ui-static.mjs` um beide Artefakte erweitern. Veraltete Ausgaben
      vor dem Kopieren entfernen; fehlender Portal-Build muss Release-Builds abbrechen.
- [ ] `app/Dockerfile`, Release-Images und Pfupdate-Paketierung prüfen und beide
      Frontends in dasselbe App-Image aufnehmen. Keine zusätzlichen Laufzeitcontainer.
- [ ] Den tatsächlichen Proxy-Regenerierungs-/Reloadpfad bei Updates prüfen:
      bestehende aktive Restricted-Installationen müssen den neuen Caddy-Vertrag
      ohne manuelle Nacharbeit erhalten.
- [ ] Reihenfolge für App-Image und Caddy-Wechsel festlegen: Bei inkompatiblen
      Zwischenständen lieber vorübergehende Nichterreichbarkeit als breitere Freigabe.
      Rücknahme stellt App-Version und zugehörige Caddy-Konfiguration gemeinsam her.
- [ ] Entwicklung, CI und Bundle-Prüfungen auf beide Builds erweitern;
      Betriebsdokumentation mit Fehlerbild und Recovery aktualisieren.

Abnahme: Frische Installation und Upgrade liefern beide Oberflächen aus einem
App-Image. Ein Upgrade behält keine alten Staff-Freigaben am Portal-Listener.
Rollback wird geprüft; eine Rückkehr zur alten Version stellt auch deren bekannte
Asset-Einschränkung wieder her und darf nicht als isolierter Zustand gelten.

### 4. Regression und reale Abnahme

- [ ] Fastify-Tests mit getrennten Fixture-Dateibäumen: korrekte Shell je Route,
      existierende Assets mit richtigem Content-Type, fehlende Assets ohne HTML.
- [ ] GET/HEAD, Querystrings, URL-kodierte Pfade, unzulässige Methoden und
      Traversalversuche prüfen; Root-Redirect und explizite UI-Routen erhalten.
- [ ] Produktionsbuild im Browser prüfen: Ticket-Einstieg, Menü, Sprachwechsel,
      Datenschutz, Upload, Anamnese, Submit, Reload und Direktlinks. Alle im Netzwerk
      tatsächlich geladenen Assets müssen aus dem Portal-Build stammen.
- [ ] Staff-Login und Staff-Navigation einschließlich internem Portalaufruf prüfen.
- [ ] Caddy-Konfiguration mit `caddy adapt`/`caddy validate` prüfen und eine reale
      Listener-Matrix ausführen: Staff/Restricted × Host/SNI × erlaubter/verbotener Pfad.
- [ ] Am Restricted-Listener mindestens einen tatsächlich vorhandenen Staff-Chunk,
      einen erfundenen Portal-Assetpfad, Staff-UI, Staff-API und internen
      `verify-ticket-code`-Endpunkt negativ prüfen. Den vorhandenen Staff-Chunk am
      Staff-Listener als Positivkontrolle abrufen.
- [ ] Vorher/nachher-Ergebnisse und verbleibende Einschränkungen dokumentieren;
      erst danach das ursprüngliche Finding als vollständig behoben markieren.

## Fertigkriterium und Wiederaufnahme

Fertig ist der Umbau erst, wenn alle vier Arbeitspakete samt Release-/Upgradepfad
abgenommen sind. Ein erfolgreicher UI-Build allein genügt nicht.

Bei Wiederaufnahme zuerst Arbeitsbaum und den dann aktuellen NIC-/TLS-Stand
prüfen. Bereits vorhandene Änderungen nicht überschreiben. Danach Arbeitspaket 1
beginnen und diese Checkliste mit konkreten Prüfresultaten fortschreiben.
Geschätzter Gesamtaufwand: 2–4 Entwicklertage; Build-Abhängigkeiten und Upgrade-
Integration sind die wesentlichen noch zu prüfenden Unsicherheiten.
