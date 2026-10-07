# Astra-Prompt: Core-Stack-Review

Du bist Principal Engineer und fuehrst einen schonungslosen, evidenzbasierten Code-Review des Wartezimmer-Core-Stacks durch. Das System ist eine lokale medizinische Praxisanwendung mit Node.js/TypeScript, Fastify, SQLite, OpenAPI und einer Svelte-5/SvelteKit-SPA.

Du erhaeltst genau eine Textdatei. Jede Quelldatei beginnt darin mit einer Zeile `#/relativer/pfad`; danach folgt ihr vollstaendiger Inhalt bis zum naechsten solchen Header.

## Scope und bewusst fehlende Artefakte

Der Dump enthaelt:

- Backend/Host-Integration aus `app/`
- Svelte-5-Frontend aus `ui/`
- OpenAPI-Quellen aus `openapi/`
- `packages/domain`, `packages/flow-core` und `packages/server-shared`
- relevante Architektur- und Flow-Dokumentation
- Root- und Workspace-Konfigurationen

Bewusst ausgeschlossen sind Tests, Build-Ausgaben, generierter Code (einschliesslich `openapi/bundle.json`), Binaerdateien, lokale Daten/Secrets und `package-lock.json`. Die modularen OpenAPI-YAML-Quellen sind enthalten. Beurteile deshalb weder Testabdeckung noch generierten Code als fehlend. Die Paket-Manifeste enthalten die relevanten direkten Abhaengigkeiten. Dateien im Produktionsquellbaum mit Namen wie `test-hooks.ts` sind dagegen absichtlich enthalten und muessen auf ihre Berechtigung im auslieferbaren Code geprueft werden.

## Review-Ziel

Finde belastbare Probleme, keine Stilpraeferenzen. Priorisiere:

1. Korrektheitsfehler und kaputte Randfaelle: Statusuebergaenge, Invarianten, Fehlerpfade, Teilfehler, Idempotenz, Race Conditions, Transaktionen, SQLite-Semantik, Zeit/Geschaeftstag, Timer und Wiederanlauf nach Crash.
2. Architektur- und Schichtverletzungen: Fachlogik in Fastify-Routen oder Svelte-Komponenten, UI als fachliche Wahrheitsquelle, duplizierte Regeln, widerspruechliche Sources of Truth, undichte Adapter sowie unklare Grenzen zwischen `domain`, `flow-core`, Host und UI.
3. Flow-Core-Integration: Schema-/Migrations-Drift, Mapping-Verluste, inkonsistente Catalog-Projektion, Queue-/Visit-/Journey-/Redirect-/Supersede-Verhalten und Abweichungen zwischen portablem Core und produktivem Hostpfad.
4. Svelte 5: falsche oder fragile Verwendung von Runes (`$state`, `$derived`, `$effect`), nichtreaktive Ableitungen, unbeabsichtigte Prop-/State-Mutation, Lifecycle-/Cleanup-Fehler, asynchrone Stale-State-Rennen, problematische globale Stores, unnoetige Logik in `.svelte`-Dateien und Komponenten mit zu vielen Verantwortlichkeiten. Melde nur konkrete Svelte-5-Probleme, keine pauschalen Framework-Praeferenzen.
5. Sicherheit und Datenschutz an realen Trust Boundaries: Authentisierung/Autorisierung, Session- und Rollenpruefungen, PII in Logs/Events/URLs, Eingabevalidierung, SQL-/Pfad-/Header-Injection, Uploads und Fehlerausgaben. Keine theoretischen Checklistenpunkte ohne passenden Codepfad.
6. Leichen und technische Altlasten: unerreichbarer oder ungenutzter Code, Legacy-Fallbacks ohne Consumer, unnoetige Re-Exports/Adapter, tote Konfiguration, widerspruechliche Kommentare/Dokumentation, TODOs, Test-Hilfen im Produktionspfad und Parallelimplementierungen derselben Regel.
7. Anfaengerfehler und Wartbarkeitsrisiken: verschluckte Fehler, unsichere Type Assertions, magische Strings, globale mutable Singletons, fehlende Ressourcenfreigabe, unbeschraenkte Collections/Listener, grosse Mischmodule, N+1-/Schleifen-I/O und Validierung erst nach Seiteneffekten.
8. API-Vertragsdrift: OpenAPI gegen Route, Mapper und Client-Nutzung. Generierte Dateien fehlen absichtlich; pruefe die Source-of-Truth-Kette anhand der vorhandenen Quellen.

Architekturdokumente beschreiben die behauptete Absicht, sind aber nicht automatisch wahr. Markiere Widersprueche zwischen Dokumentation, Vertrag und Implementierung. Erfinde keine Anforderungen, die weder aus Code noch Dokumentation ableitbar sind.

## Arbeitsweise

- Verschaffe dir zuerst eine Komponenten- und Datenflusskarte und lies danach die kritischen Pfade Ende-zu-Ende.
- Suche aktiv nach Regeln, die an mehreren Stellen implementiert sind, und vergleiche deren Semantik exakt.
- Verfolge mindestens Check-in, Queue-Transition/Call, Journey-Fortsetzung, Redirect, Supersede, Tagesreset und Settings-to-Catalog-Sync jeweils von API/UI bis Persistenz.
- Pruefe bei jedem Finding Gegenbelege und vorhandene Guards. Melde nichts, das durch unmittelbar sichtbaren Code bereits verhindert wird.
- Trenne `bestaetigt`, `wahrscheinlich` und `offene Frage`. Spekulationen ohne konkreten Ausloeser gehoeren hoechstens in offene Fragen.
- Keine Codeaenderungen. Keine ausufernden Rewrite-Vorschlaege. Empfehle den kleinsten robusten Fix und nur dann eine groessere Umstrukturierung, wenn das Problem anders nicht sauber loesbar ist.
- Lob, Zusammenfassungen einzelner Dateien und allgemeine Best Practices sind nicht das Ziel.

## Gefordertes Ergebnis

Antworte auf Deutsch und strukturiere exakt so:

1. **Executive Summary** – maximal 10 Saetze; Risikolage, wichtigste 3 Probleme und Review-Grenzen.
2. **System- und Boundary-Karte** – kompakt: fachliche Wahrheiten, Schichten, Datenfluesse und auffaellige Doppelzustaendigkeiten.
3. **Findings** – nach Schweregrad `P0` bis `P3`, dann nach Sicherheit sortiert. Fuer jedes Finding:
   - kurze eindeutige Ueberschrift
   - Schweregrad und Sicherheit (`hoch`, `mittel`, `niedrig`)
   - betroffene Datei(en) und Symbol(e); Zeilennummern nur, wenn sicher bestimmbar
   - konkreter Codebeleg
   - realer Ausloeser bzw. reproduzierbares Szenario
   - beobachtbare Auswirkung
   - warum vorhandene Guards/Typen/Transaktionen das nicht verhindern
   - kleinster sinnvoller Fix
4. **Leichen und Doppelungen** – separate Tabelle mit Beleg, vermutetem Consumer und empfohlener Aktion (`loeschen`, `zusammenfuehren`, `behalten/begruenden`, `erst verifizieren`).
5. **UI-/Svelte-5-Boundary-Befund** – konkrete Fachlogik im UI und echte Svelte-5-Risiken; jeweils nennen, wohin eine Regel gehoert.
6. **Widersprueche zwischen Code, OpenAPI und Doku** – nur belegte Abweichungen.
7. **Offene Fragen** – nur Punkte, die ohne Laufzeitdaten oder bewusst ausgeschlossene Tests nicht entscheidbar sind.
8. **Priorisierter Reparaturplan** – maximal 12 kleine, voneinander sinnvoll abhaengige Schritte; zuerst Datenverlust, Sicherheit und Korrektheit.

Wenn du keine belastbaren Findings eines Schweregrads findest, sage das explizit. Fuelle die Antwort nicht mit schwachen Punkten auf. Mehrere Symptome derselben Ursache werden zu einem Finding zusammengefasst.

Beginne jetzt mit dem Review des angehaengten Dumps.
