# Flow Routing Modes - Arbeitspakete

Stand: 2026-07-07

Dieses Dokument zerlegt den Ausbau von Simple/Complex Routing in getrennte
Arbeitspakete. Die Pakete sind so geschnitten, dass sie einzeln an eine KI oder an
eine Entwicklerin gegeben werden koennen: genug Kontext fuer saubere Umsetzung, aber
nicht das komplette Zielbild auf einmal.

Grundlage: `docs/flow-routing-modes-working-doc.md`

## Leitplanken Fuer Alle Pakete

- Runtime-APIs werden nicht in Simple/Complex getrennt.
- `flow-core` bleibt die gemeinsame Engine.
- `routingMode` ist praxisweit.
- `routingMode: simple` ist der Default.
- `routingMode: complex` erlaubt Mixed Mode: einzelne Topics koennen Journeys
  nutzen, andere bleiben einfache RoutingRules.
- Topics bleiben in beiden Modi bearbeitbar.
- Lizenzlogik wird vorerst nur vorbereitet, nicht implementiert.
- Guards kommen vor UI-Ausbau.
- Neue Konfiguration gilt fuer neue Check-ins; laufende Visits behalten ihre
  gespeicherte operative Wahrheit.

## Paket 1 - RoutingMode Im Ops-Setting Modellieren

### Ziel

`routingMode` als praxisweites Ops-/Setup-Setting einfuehren, ohne bestehendes
Simple Routing zu veraendern.

### Kontext Fuer KI

Simple Routing ist heute faktisch aktiv: Ops-Settings werden in Flow-Core-Katalog
synchronisiert und erzeugen RoutingRules ohne `journeyTemplateId`. Der neue
`routingMode` soll diese aktuelle Logik nicht brechen, sondern explizit machen.

### Relevante Dateien

- `app/src/shared/db/db-types.ts`
- `app/src/shared/db/database.ts`
- `app/src/shared/flow-core/sync-catalog-from-ops-settings.ts`
- `app/src/shared/flow-core/sync-catalog-from-ops-settings.test.ts`
- UI-Settings-Dateien unter `ui/src/routes/mfa/settings/**`
- ggf. Setup-/Onboarding-Dateien unter `ui/src/routes/ops/**`

### Aufgaben

- Typ `RoutingMode = 'simple' | 'complex'` im Host modellieren.
- `routingMode` in `OpsSettings` aufnehmen.
- Default fuer bestehende/fehlende Settings: `simple`.
- Persistenz/Migration so bauen, dass bestehende Installationen ohne Wert weiterlaufen.
- Tests fuer Default und Speichern/Lesen ergaenzen.

### Nicht-Ziele

- Keine Journey-UI.
- Keine Lizenzlogik.
- Keine Aenderung an Check-in/Queue/TV/Room-Panel Runtime.
- Keine komplexe Mode-Wechsel-Logik ausser Default-Verhalten.

### Akzeptanzkriterien

- Bestehende Tests laufen unveraendert oder mit bewusst angepassten Defaults.
- Bestehende Praxis ohne `routingMode` verhaelt sich wie vorher.
- `routingMode` ist in Backend-Typen sichtbar und serialisierbar.
- Simple Routing Sync erzeugt weiterhin RoutingRules mit `journeyTemplateId: null`.

## Paket 2 - Capabilities Fuer UI Und Spaetere Lizenzguards

### Ziel

Eine klare Capability-Antwort aus dem bereits vorhandenen `OpsSettings.routingMode`
ableiten, damit UI und spaetere Guards zentral wissen, welche Routing-Komponenten
sichtbar und nutzbar sind.

### Kontext Fuer KI

AP1 hat `routingMode` bereits im Host modelliert und in die Ops-Settings-API
aufgenommen. Paket 2 fuehrt keine neue Persistenz und keinen neuen Modus ein.

Die Lizenzlogik wird noch nicht umgesetzt. Trotzdem sollen UI und spaetere Guards
nicht hart auf lokale Annahmen pruefen. Es braucht eine zentrale Antwort, die heute
aus `routingMode` abgeleitet wird und spaeter zusaetzlich Lizenz-/Produktfeature-
Status beruecksichtigen kann.

Beispiel:

```json
{
  "routingMode": "simple",
  "features": {
    "complexRouting": false,
    "journeyDesigner": false,
    "routingSimulator": true
  }
}
```

### Relevante Dateien

- `app/src/shared/db/database.ts`
- passende Route/API fuer Ops-/Settings-/Capabilities
- `ui/src/lib/mfa/practice-ops-api.ts`
- `ui/src/routes/mfa/settings/**`
- OpenAPI-Dateien, falls diese Route dokumentiert wird

### Aufgaben

- Capability-Typ definieren.
- Capability-Resolver implementieren:
  - `routingMode` aus OpsSettings
  - `routingSimulator` initial true
  - `complexRouting` aktuell true, wenn `routingMode === 'complex'`
  - `journeyDesigner` aktuell true, wenn `routingMode === 'complex'`
  - interner Stub/Erweiterungspunkt fuer spaetere Lizenz-Capability, ohne sie jetzt
    zu implementieren
- API/Client-Anbindung schaffen.
- Tests fuer simple/complex Capability-Antwort.

### Nicht-Ziele

- Keine neue Persistenz.
- Kein weiteres RoutingMode-Modell.
- Keine echte Lizenzpruefung.
- Keine Journey-Konfiguration.
- Keine UI-Komponenten aus `new_flow_core` uebernehmen.

### Akzeptanzkriterien

- UI kann zentral abfragen, ob Journey-Features sichtbar sein duerfen.
- Simple Mode liefert keine Journey-/Complex-UI-Freigabe.
- Complex Mode liefert Journey-/Complex-UI-Freigabe.
- Capability-Response ist stabil und testbar.
- Keine Runtime-API braucht Kenntnis von Lizenzdetails.

## Paket 3 - Guards Fuer Surface, Location Und Queue Fertigziehen

### Ziel

Guards analog zu Topic-/Journey-Locks bereitstellen, damit Surface, Location und
Queue nicht geloescht oder deaktiviert werden, solange sie fachlich referenziert
sind.

### Kontext Fuer KI

Topic- und Journey-Locks existieren bereits. Ein erster Surface-Guard wurde begonnen.
Das Prinzip ist:

```text
Konfiguration darf nicht entfernt oder deaktiviert werden, wenn laufende oder
fachlich relevante Visits dadurch ihre operative Wahrheit verlieren wuerden.
```

### Relevante Dateien

- `packages/flow-core/src/shared/surface-guard.ts`
- `packages/flow-core/src/shared/topic-guard.ts`
- `packages/flow-core/src/shared/journey-guard.ts`
- `packages/flow-core/src/shared/admin-validation.ts`
- `packages/flow-core/src/index.ts`
- `packages/flow-core/test/unit/*guard*.test.ts`
- ggf. `app/src/shared/flow-core/sync-catalog-from-ops-settings.ts`

### Aufgaben

- Surface-Guard komplettieren.
- Location-Guard ergaenzen.
- Queue-Guard ergaenzen.
- Referenzen erfassen:
  - Surface: Display Rules, RoutingRules.allowedSurfaceIds, Visits.lastSurfaceId
  - Location: Topic.defaultRoomId im Host, JourneySteps, RoutingRules, Queues,
    offene Visits
  - Queue: JourneySteps, RoutingRules, SurfaceDisplayRules, offene Visits
- Fehlercodes konsistent benennen, z. B. `SURFACE_IN_USE`, `LOCATION_IN_USE`,
  `QUEUE_IN_USE`.
- Unit-Tests ergaenzen.

### Nicht-Ziele

- Keine UI.
- Keine DB-Migration.
- Kein Loesch-/Deaktivierungs-Flow fuer alle Settings.
- Keine Lizenzpruefung.

### Akzeptanzkriterien

- Guards liefern nachvollziehbare Referenzen oder blockieren mit eindeutigem Fehler.
- Tests decken Referenzen und freie Entitaeten ab.
- Export aus `@praxis-flow/flow-core` ist vorhanden.

## Paket 4 - Simple Routing Explizit Benennen Und Absichern

### Ziel

Die bestehende Sync-Logik fachlich als Simple Routing stabilisieren und
dokumentieren.

### Kontext Fuer KI

Heute erzeugt `syncCatalogFromOpsSettings` pro Topic eine RoutingRule mit
`journeyTemplateId: null`. Das ist korrekt fuer Simple Routing, aber noch nicht
explizit als Modus modelliert.

### Relevante Dateien

- `app/src/shared/flow-core/sync-catalog-from-ops-settings.ts`
- `app/src/shared/flow-core/sync-catalog-from-ops-settings.test.ts`
- `app/src/shared/checkin-topic-settings.ts`
- `app/src/shared/checkin-topic-settings.test.ts`
- `docs/flow-routing-modes-working-doc.md`

### Aufgaben

- Sync-Logik explizit auf `routingMode: simple` pruefen oder so kapseln, dass Simple
  der klare Pfad ist.
- Tests aktualisieren: Simple Mode erzeugt Rules ohne Journey.
- Dokumentieren, welche Felder generiert sind.
- Sicherstellen, dass bestehende Topic-/Room-Settings unveraendert funktionieren.

### Nicht-Ziele

- Kein Complex Sync.
- Keine Journey-UI.
- Kein Simulator.

### Akzeptanzkriterien

- Simple Mode ist explizit getestet.
- Keine Regression in Terminal-Check-in, MFA-Queue, TV, Raum-Panel.
- Generierte RoutingRules bleiben validierbar durch `validateCatalogIntegrity`.

## Paket 5 - Complex Routing Config Ohne UI

### Ziel

Host-seitig die Daten- und API-Schicht vorbereiten, um Topics optional mit
JourneyTemplates zu verknuepfen.

### Kontext Fuer KI

Der Core kann JourneyTemplates bereits. Im Host fehlt die produktive
Konfigurationsschicht. Complex Mode erlaubt Mixed Mode: ein Topic kann eine Journey
haben, muss aber nicht.

### Relevante Dateien

- `packages/flow-core/src/server/admin-service.ts`
- `packages/flow-core/src/shared/admin-validation.ts`
- `app/src/shared/flow-core/sync-catalog-from-ops-settings.ts`
- `app/src/shared/db/database.ts`
- relevante Settings/API-Routen
- Tests unter `app/src/shared/flow-core/*.test.ts`

### Aufgaben

- Modellieren, wo Topic->Journey-Zuordnung im Host gespeichert wird.
- Sync erweitern:
  - wenn Topic eine Journey-Zuordnung hat: `routingRule.journeyTemplateId`
  - wenn nicht: Simple RoutingRule
- Mixed Mode testen.
- Mode-Wechsel-Regeln backendseitig absichern:
  - Simple -> Complex: bestehende Simple-Rules bleiben gueltig
  - Complex -> Simple: blockieren bei offenen aktiven Journey-Visits
  - neue Simple-Routes muessen valide sein

### Nicht-Ziele

- Keine Journey-Designer-UI.
- Keine Lizenzdurchsetzung ausser Capability-/Guard-Haken.
- Kein Simulator.

### Akzeptanzkriterien

- Complex Mode kann eine Journey pro Topic aktivieren.
- Topics ohne Journey bleiben im Complex Mode simple.
- Check-in nutzt bei Journey Step 0, sonst `initial_*`.
- Tests decken Mixed Mode und Complex->Simple Blockade ab.

## Paket 6 - Topic UI Mit RoutingMode-Schnitt

### Ziel

Topic-Editor so schneiden, dass Topics in beiden Modi bearbeitbar bleiben, aber der
Routing-Abschnitt je Modus passt.

### Kontext Fuer KI

Topic-Basisdaten sind immer editierbar. Nur der Routing-Abschnitt wechselt:

- Simple: Standardziel/Raum
- Complex: Journey auswaehlen, Journey bearbeiten/simulieren

### Relevante Dateien

- `ui/src/lib/components/mfa/TopicsEditor.svelte`
- `ui/src/lib/components/mfa/TopicEditorModal.svelte`
- `ui/src/routes/mfa/settings/topics-rooms/+page.svelte`
- `ui/src/lib/queue/topic-settings-form.ts`
- `ui/src/lib/mfa/practice-ops-api.ts`

### Aufgaben

- Capability/RoutingMode im Settings-UI verfuegbar machen.
- Topic-Basisdaten unveraendert bearbeitbar halten.
- Simple Routing-Abschnitt nur in Simple oder fuer simple Topics anzeigen.
- Complex Routing-Abschnitt vorbereiten, ggf. zunaechst read-only/Platzhalter.
- Keine sichtbare Journey-UI, wenn Capability fehlt.

### Nicht-Ziele

- Kein vollstaendiger Template Designer.
- Kein Simulator.
- Keine Lizenzlogik im Frontend ausser Capability-Auswertung.

### Akzeptanzkriterien

- Topic-Editor funktioniert in Simple Mode wie bisher.
- Complex Mode zeigt keine widerspruechlichen Routing-Wahrheiten pro Topic.
- UI fragt Capabilities ab und hardcodet Feature-Verfuegbarkeit nicht.

## Paket 7 - Journey Admin UI Uebernehmen

### Ziel

Die relevante Idee aus `../new_flow_core/src/public/journey-admin.js` in die Host-UI
uebertragen.

### Kontext Fuer KI

Die Referenz-UI aus `packages/flow-core/src/public` und `../new_flow_core` ist
Cherry-Pick-Quelle, nicht Produkt-UI. Es soll in bestehende Svelte-Komponenten und
Settings-Flows passen.

### Relevante Dateien

- `../new_flow_core/src/public/journey-admin.js`
- `packages/flow-core/src/public/journey-admin.js`
- `ui/src/routes/mfa/settings/**`
- `ui/src/lib/components/mfa/**`
- `ui/src/lib/mfa/practice-ops-api.ts`

### Aufgaben

- Referenz-UI analysieren und relevante Bedienkonzepte extrahieren.
- Svelte-Komponenten fuer Journey-Liste, Step-Editor und Topic-Zuordnung bauen.
- Guards/Locks in UI sichtbar machen.
- Speichern nur ueber Backend-API, nicht rein clientseitig.
- Capability-Gating beachten.

### Nicht-Ziele

- Kein 1:1-Kopieren der Referenz-UI.
- Kein Simulator.
- Keine neuen Runtime-APIs.

### Akzeptanzkriterien

- JourneyTemplates koennen im Complex Mode verwaltet werden.
- Bei Locks/Guards gibt es klare Fehlermeldungen.
- Simple Mode zeigt diese UI nicht.

## Paket 8 - Routing-/Journey-Simulator

### Ziel

Simulator bauen, der Konfiguration und sichtbares Verhalten ueber Terminal, MFA,
TV und Raum-Panel pruefbar macht.

### Kontext Fuer KI

Der Simulator soll Verhalten verstaendlich machen, nicht nur Validierung ausgeben.
Er ist fuer Simple Routing hilfreich und fuer Complex Routing zentral.

### Relevante Dateien

- `packages/flow-core/src/shared/surface-visibility.ts`
- `packages/flow-core/src/shared/journey.ts`
- `app/src/shared/queue/tv-queue-snapshot.ts`
- `app/src/shared/queue/room-panel-queue-snapshot.ts`
- `app/src/shared/flow-core/visit-queue-bridge.ts`
- neue UI-Komponenten unter `ui/src/lib/components/**` oder Settings-Routen

### Aufgaben

- Entscheiden: Simulation serverseitig, clientseitig oder hybrid.
- Simulationsinput definieren: Topic, Surface/Room-Kontext, optional Journey-Step.
- Vorschau erzeugen:
  - Terminal-Hinweis
  - MFA-Warteliste
  - Wartezimmer-TV
  - Raum-Panel
  - Status-/Journey-Timeline
- Simple und Complex Szenarien abdecken.

### Nicht-Ziele

- Keine echte Visit-Erzeugung in produktiver Queue.
- Keine Abhaengigkeit von Lizenzserver.
- Kein Ersatz fuer Integrationstests.

### Akzeptanzkriterien

- Simulator veraendert keine echten Visits.
- Sichtbarkeit entspricht Core-Regeln.
- Simple und Complex Topics sind nachvollziehbar testbar.

## Paket 9 - Reassignment-Entscheidung Und Konsolidierung

### Ziel

Klaeren und ggf. umsetzen, ob MFA-Reassignment dauerhaft Host-Aktion bleibt oder
auf Core-Redirect umgestellt wird.

### Kontext Fuer KI

Heute aktualisiert Reassignment das Visit-Ziel ueber eine Host-Bruecke. Core-Redirect
hat staerkere fachliche Semantik: operative Umleitung, History, Journey-Abandonment.

### Relevante Dateien

- `app/src/shared/flow-core/visit-queue-bridge.ts`
- `app/src/shared/db/database.ts`
- `packages/flow-core/src/shared/redirect-flow.ts`
- `packages/flow-core/src/server/visit-service.ts`
- MFA-Reassignment UI unter `ui/src/lib/components/mfa/ReassignRoomModal.svelte`

### Aufgaben

- Fachlich entscheiden:
  - Reassignment = eigener MFA-Raumwechsel
  - oder Reassignment = Core-Redirect
- Falls Host-Aktion bleibt: Tests und Namen klarer machen.
- Falls Core-Redirect: Mapping und Journey-Abandonment bewusst pruefen.

### Nicht-Ziele

- Keine UI-Neugestaltung ausser notwendigen Text-/Fehleranpassungen.
- Kein RoutingMode-Setting.

### Akzeptanzkriterien

- Semantik ist dokumentiert.
- Tests decken Status, Zielraum und Journey-Verhalten ab.

## Empfohlene Reihenfolge

1. Paket 1 - RoutingMode Im Ops-Setting Modellieren
2. Paket 2 - Capabilities Fuer UI Und Spaetere Lizenzguards
3. Paket 3 - Guards Fuer Surface, Location Und Queue Fertigziehen
4. Paket 4 - Simple Routing Explizit Benennen Und Absichern
5. Paket 5 - Complex Routing Config Ohne UI
6. Paket 6 - Topic UI Mit RoutingMode-Schnitt
7. Paket 7 - Journey Admin UI Uebernehmen
8. Paket 8 - Routing-/Journey-Simulator
9. Paket 9 - Reassignment-Entscheidung Und Konsolidierung

Paket 9 kann vorgezogen werden, wenn Reassignment-Semantik vor der Journey-UI
produktentscheidend wird.

## Vorlage Fuer Einzelne KI-Auftraege

```text
Bitte bearbeite Paket N aus docs/flow-routing-work-packages.md.

Nutze als Kontext:
- docs/flow-routing-modes-working-doc.md
- den Abschnitt zu Paket N
- die dort genannten Dateien

Nicht-Ziele aus dem Paket bitte respektieren.
Am Ende bitte kurz nennen:
- geaenderte Dateien
- Tests/Checks
- offene Risiken
```
