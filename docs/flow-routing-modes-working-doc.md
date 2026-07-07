# Flow Routing Modes - Arbeitsdokument

Stand: 2026-07-07

Dieses Dokument ist ein Arbeitsstand. Ziel ist, Ausgangslage, Zielbild, API-Grenzen,
Side Effects und Implementierungsreihenfolge fuer Simple Routing und Complex Routing
sauber zu klaeren, bevor UI und Produktfeature-Schnitt final gebaut werden.

## Kontext

Praxis Flow hat aktuell ein operatives Flow-Modell ueber `packages/flow-core`.
Der Core kennt bereits zwei Routing-Varianten:

- Simple Routing ueber `RoutingRule` ohne `journeyTemplateId`
- Complex Routing ueber `RoutingRule` mit `journeyTemplateId`, bei dem die Journey ab
  Check-in die operative Route bestimmt

In der Host-App ist der Core bereits fuer Check-in, Visit/Queue, TV und Raum-Panel
angebunden. Die produktive Konfiguration nutzt aktuell aber faktisch Simple Routing:
Die Sync-Logik aus Ops-Settings erzeugt pro Topic eine RoutingRule mit
`journeyTemplateId: null`.

## Ausgangslage

### Was heute bereits ueber Flow Core laeuft

- Terminal-Check-in erzeugt `Visit` ueber `runtime.checkIn`.
- Queue/MFA-Dashboard lesen Visit-basierte Queue-Zeilen.
- Wartezimmer-TV filtert Visits ueber Surface-Visibility.
- Raum-Panel filtert Visits ueber Surface-Visibility und `targetLocationId`.
- Aufruf, Ankunft, Behandlung und Abschluss laufen ueber Core-Transitions.
- Reassignment im MFA-Dashboard aktualisiert aktuell das Visit-Ziel ueber eine Host-Bruecke.

### Was heute noch nicht produktiv genutzt wird

- Topic-Konfiguration setzt keine JourneyTemplates.
- Es gibt noch keine Host-UI fuer Journey-Zuordnung pro Topic.
- Es gibt noch keinen Host-Template-Designer fuer Journeys.
- Es gibt noch keinen integrierten Routing-/Journey-Simulator.
- Feature-/Lizenzgrenzen fuer Complex Routing sind noch nicht modelliert.

## Begriffe

### Topic

Das Anliegen des Patienten. Topics muessen in Simple und Complex Routing bearbeitbar
bleiben.

Gemeinsame Topic-Daten:

- `topicId`
- `label` / Name
- `enabled`
- `sortOrder`
- `laneCode`
- Icon / Kategorie
- Akzentfarbe
- Prioritaet

### RoutingRule

Start- und Policy-Schicht fuer einen Check-in.

Sie beantwortet:

- Darf dieses Topic an dieser Surface starten?
- Welche Escort-/Redirect-Policy gilt?
- Gibt es eine einfache initiale Route?
- Oder wird eine JourneyTemplate verwendet?

### JourneyTemplate

Mehrstufiger Ablauf nach dem Check-in.

Sie beantwortet:

- Welche Stationen/Locations durchlaeuft der Patient?
- Welche Queue gilt je Schritt?
- Wie bewegt sich der Patient: `self_go`, `call`, `pickup`?
- Wann wird zum naechsten Schritt weitergeschaltet?
- Wie ist das Anzeigeverhalten auf Surfaces?

### Surface

Terminal, Wartezimmer-TV, MFA-Dashboard, Raum-Panel oder andere Anzeige-/
Bedienoberflaeche. Surfaces muessen gegen versehentliches Loeschen/Deaktivieren
geschuetzt werden, solange sie referenziert werden.

## Zielbild

Es gibt eine gemeinsame Engine und zwei Bedienmodelle:

```text
flow-core = gemeinsame Runtime und Domain-Engine
simple routing = einfache Produktkonfiguration fuer normale Praxen
complex routing = Advanced-/Enterprise-Konfiguration mit Journeys
```

Nicht gewuenscht:

```text
/check-in-simple
/check-in-complex
zwei Runtime-Engines
zwei Queue-Modelle
zwei TV-/Panel-Implementierungen
```

Gewuenscht:

```text
eine Runtime API
eine Visit-Wahrheit
zwei Config-Modi
capability-gesteuerte UI
```

## Routing-Modi

### Simple Routing

Default fuer normale Arztpraxen.

Fachliches Modell:

```text
Topic -> Warteliste -> Zielraum/Empfang -> fertig
```

Topic-Konfiguration:

- Basisdaten des Topics
- `defaultRoomId`
- `laneCode`
- Aktiv/Sichtbarkeit/Sortierung

Host generiert daraus:

```text
RoutingRule:
  topicId
  initialTargetLocationId = topic.defaultRoomId
  initialQueueId = allgemeine Warteliste
  initialMovementMode = call
  journeyTemplateId = null
```

#### Simple Routing Sync (`syncCatalogFromOpsSettings`)

Im Simple Mode erzeugt `syncSimpleRoutingRulesFromOpsSettings` fuer jedes
konfigurierte Topic sowie `rule_mfa` eine RoutingRule mit `journeyTemplateId: null`.
`active` spiegelt `topic.enabled`; deaktivierte Topics behalten ihre Rule, werden
aber inaktiv. Der Einstieg ist `syncRoutingRulesFromOpsSettings`; im Complex Mode folgen
`syncJourneyTemplatesFromOpsSettings` und `syncComplexRoutingRulesFromOpsSettings`.

**Aus OpsSettings abgeleitet (pro Topic):**

| RoutingRule-Feld | Quelle |
|----------------|--------|
| `id` | `rule_{topicId}` |
| `topicId` | `topic.topicId` |
| `name` | `topic.label` |
| `active` | `topic.enabled` |
| `initialTargetLocationId` | `topic.defaultRoomId` → aufloesen auf enabled Room, sonst Empfang |
| `terminalInstructionTemplate` | generiert aus `topic.label` |
| `allowRedirect` | `0` fuer `mfa`, sonst `1` |

**Fest generiert (Simple Routing Konstanten):**

| RoutingRule-Feld | Wert |
|------------------|------|
| `initialLastKnownLocationId` | `pf_waiting` |
| `initialQueueId` | `pf_general_queue` |
| `initialMovementMode` | `call` |
| `initialLocationConfidence` | `assumed` |
| `publicDisplayMode` | `visible` |
| `requiresReceptionConfirmation` | `false` |
| `escortPolicy` | `none` |
| `allowedSurfaceIds` | `[pf_terminal_1]` |
| `journeyTemplateId` | `null` |

Zusaetzlich wird immer eine MFA-Assist-Rule (`rule_mfa`) mit Empfangsziel und
`allowRedirect: 0` synchronisiert.

**Weitere generierte Katalog-Entitaeten (nicht RoutingRule):**

- Locations: `pf_entrance`, `pf_waiting`, plus alle `settings.rooms`
- Queue: `pf_general_queue` (Home: Wartezimmer)
- Surfaces: Terminal, Wartezimmer-TV, MFA-Dashboard, optionale Raum-Panels
- Display Rules: `tv_general_visible`, `panel_{roomId}_target`

Nach dem Sync validiert `validateCatalogIntegrity` den Katalog.

UI:

- Topic Editor bleibt sichtbar.
- Raum-/Standardziel-Auswahl ist sichtbar.
- Keine Journey-Zuordnung.
- Kein Journey Template Designer.
- Simulator kann als "Routing testen" sichtbar sein.

Im Simple Mode bleiben gespeicherte Journey-Templates in OpsSettings und im
Flow-Core-Katalog bestehen; Sync nutzt sie nicht. UI und Capabilities sollen im
Simple Mode nicht auf Journey-Konfiguration zugreifen.

### Complex Routing

Advanced Feature fuer grosse Praxen, MVZs, Diagnostik, Labor-/OP-Vorbereitung oder
andere wiederverwendbare Use Cases.

Fachliches Modell:

```text
Topic -> JourneyTemplate -> JourneySteps -> operative Visit-Route
```

Topic-Konfiguration:

- Basisdaten des Topics
- Journey-Zuordnung
- optional einfache Zielraum-Felder als Fallback/Legacy-Daten, aber nicht als aktive Route

Host setzt:

```text
RoutingRule:
  topicId
  journeyTemplateId = selectedJourney
```

Core-Verhalten:

```text
if routingRule.journeyTemplateId:
  Step 0 der Journey wird ab Check-in operative Wahrheit
else:
  initial_* der RoutingRule wird operative Wahrheit
```

UI:

- Topic Editor bleibt sichtbar.
- Routing-Abschnitt zeigt Journey-Zuordnung.
- Journey Template Designer wird verfuegbar.
- Simulator zeigt Step-by-Step-Verhalten ueber Terminal, MFA, TV und Raum-Panel.

#### Complex Routing Config (Host, Paket 5)

OpsSettings speichern Journey-Konfiguration getrennt von Topics:

- `journey_settings_json` — Journey-Templates inkl. Steps
- optional `topic.journeyTemplateId` pro Topic fuer Mixed Mode

Sync bei `routingMode: complex`:

- Topic mit Journey-Zuordnung → `routingRule.journeyTemplateId`
- Topic ohne Journey → Simple Rule (`journeyTemplateId: null`)
- Check-in nutzt bei Journey Step 0 als operative Route

#### RoutingMode-Wechsel

`routingMode` darf nur geaendert werden, wenn kein Visit `journey_state: active`
hat. Gilt symmetrisch fuer simple↔complex. Fehlercode: `ROUTING_MODE_CHANGE_BLOCKED`
(HTTP 409).

## API-Grenzen

### Runtime API bleibt stabil

Terminal, MFA-Dashboard, TV und Raum-Panel sollten nicht wissen muessen, ob ein Visit
aus Simple oder Complex Routing stammt.

Beispiele:

```text
POST /check-in
GET /queue
POST /visits/:id/call
POST /visits/:id/arrive
POST /visits/:id/done
POST /visits/:id/redirect
GET /tv-queue
GET /room-panel
```

Diese APIs arbeiten weiter mit:

- `Visit`
- `status`
- `targetLocationId`
- `queueId`
- `movementMode`
- `publicDisplayMode`
- `terminalInstruction`
- `journeyTemplateId`
- `journeyStepIndex`
- `journeyState`

### Config API unterscheidet sich

Simple:

```text
Topics / Rooms / Topic.defaultRoomId
```

Complex:

```text
Topics / JourneyTemplates / JourneySteps / Topic -> Journey
```

### Capability API

Die UI sollte nicht raten, welche Komponenten sichtbar sind. Der Stack sollte
Capabilities liefern.

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

Beispiel Complex:

```json
{
  "routingMode": "complex",
  "features": {
    "complexRouting": true,
    "journeyDesigner": true,
    "routingSimulator": true
  }
}
```

## Ops Setting / Produktfeature

Entscheidung:

```ts
type RoutingMode = 'simple' | 'complex';
```

Ops-/Setup-Setting:

```ts
routingMode: RoutingMode;
```

Produkt-/Lizenz-Capability:

```ts
complexRoutingEnabled: boolean;
```

Regeln:

- Wenn `complexRoutingEnabled === false`, kann `routingMode` nicht auf `complex`
  gesetzt werden.
- Wenn `routingMode === simple`, werden Journey-UI-Komponenten nicht angezeigt.
- Wenn `routingMode === complex`, werden Journey-Zuordnung, Template Designer und
  komplexer Simulator angezeigt.
- Der Core kann intern trotzdem vorhanden sein; lizenziert wird die Bedien- und
  Konfigurationsmoeglichkeit.

Lizenzthema als spaetere Leitplanke:

- Es soll jetzt nicht voll implementiert werden, aber die Architektur darf es nicht
  verbauen.
- Kein Online-Zugriff auf einen Lizenzserver im laufenden Praxisbetrieb.
- Spaetere Lizenzpruefung passiert vor allem an Schreib-/Update-Punkten fuer
  Complex Routing:
  - RoutingMode auf `complex` setzen
  - JourneyTemplate speichern
  - Topic mit Journey verknuepfen
  - Complex-Routing-Konfiguration importieren
- Manipulationen lassen sich lokal nie vollstaendig verhindern. Wichtig ist, sie bei
  Updates/Config-Writes zu erkennen und das Update zu verweigern.
- Bei Lizenzverlust soll es spaeter eine Karenzzeit geben.
- Nach Ablauf der Karenzzeit wird auf Simple Routing zurueckgefuehrt oder Complex
  Config schreibgeschuetzt/deaktiviert, ohne laufende Visits still zu beschaedigen.
- Details zur Lizenzlogik werden spaeter entschieden; jetzt schaffen wir nur klare
  Guard-Punkte und Capabilities.

Aktueller Planungsentscheid:

- Lizenzlogik wird jetzt nicht implementiert.
- Architektur muss aber klare Guard-Punkte fuer spaetere Lizenzpruefungen behalten.
- Entscheidend sind Schreib-/Update-Pfade, nicht reine Runtime-Lese- oder
  Anzeige-APIs.
- Ohne gueltige Complex-Lizenz darf eine lokale Manipulation spaeter nicht durch
  einen Config-Write oder ein Update dauerhaft legitimiert werden.

## Topic-Bearbeitung

Topics bleiben immer bearbeitbar.

Gemeinsamer Editor:

- Name/Label
- Icon
- Farbe
- Lane
- Aktiv
- Sortierung

Routing-Abschnitt je Modus:

Simple:

```text
Standardziel / Raum
```

Complex:

```text
Journey auswaehlen
Journey bearbeiten
Journey simulieren
```

Entscheidung:

- `routingMode` ist praxisweit.
- Auch im Complex Routing kann ein Topic technisch weiter Simple Routing nutzen, weil
  eine RoutingRule ohne `journeyTemplateId` weiterhin eine vollwertige Route ist.
- Der praxisweite Modus steuert daher nicht die technische Mindestkomplexitaet jedes
  Topics, sondern die verfuegbare Konfigurationsoberflaeche und das Produktverhalten.

Folgerung:

- `routingMode === simple`: UI bietet nur einfache Zielraum-/Routing-Konfiguration an.
- `routingMode === complex`: UI bietet zusaetzlich Journey-Zuordnung und Journey
  Designer an; einzelne Topics duerfen aber weiterhin einfache RoutingRules ohne
  Journey verwenden.
- Es darf pro Topic trotzdem nur eine aktive Routing-Wahrheit geben:
  entweder Simple Route oder Journey Route.

## Simulator

Der Simulator prueft nicht nur Datenvaliditaet, sondern sichtbares Verhalten.

Ziel:

- Topic auswaehlen
- Check-in simulieren
- Terminal-Hinweis sehen
- MFA-Warteliste sehen
- Wartezimmer-TV-Ausgabe sehen
- Raum-Panel-Ausgabe sehen
- Status-/Journey-Timeline sehen
- Optional Step-Actions durchspielen: call, arrive, start, done, redirect

Simple Simulator:

```text
Topic -> Check-in -> Warteliste -> Aufruf -> Raum -> Fertig
```

Complex Simulator:

```text
Topic -> Journey Step 1 -> Step 2 -> Step N -> Fertig
```

Der Simulator ist besonders wichtig, weil Surface-Visibility und Journey-Steps sonst
erst im echten Praxisbetrieb auffallen.

## Guards und Locks

Bereits vorhanden oder begonnen:

- JourneyTemplate-Lock bei offenen Visits auf dem Template
- Topic-Lock bei offenen Visits auf dem Topic
- RoutingRule: `topicId` immutable
- Surface-Guard als Shared-Core-Baustein begonnen

Noetige Guards:

- Surface nicht entfernen/deaktivieren, solange referenziert durch:
  - Display Rules
  - Routing Rules / allowed Surface IDs
  - offene oder relevante Visits
  - spaeter ggf. Journey-/Designer-spezifische Surface-Referenzen
- Location nicht entfernen/deaktivieren, solange referenziert durch:
  - Topics / defaultRoomId
  - JourneySteps
  - RoutingRules
  - Queues
  - offene Visits
- Queue nicht entfernen/deaktivieren, solange referenziert durch:
  - JourneySteps
  - RoutingRules
  - offene Visits
- Deaktivieren und Loeschen folgen fachlich demselben Schutzprinzip:
  - Keine harte Entfernung, solange Referenzen oder offene Nutzung existieren.
  - Wenn eine Entitaet nicht in Nutzung ist, darf sie geloescht werden.
  - Wenn historische Referenzen erhalten bleiben muessen, ist Deaktivieren statt
    Loeschen der bevorzugte Weg.
- Beim Wechsel von Complex zu Simple:
  - Wechsel ist blockiert, solange offene aktive Journey-Visits existieren.
  - Bestehende JourneyTemplates bleiben erhalten, werden aber in Simple UI nicht
    aktiv bearbeitet.
  - RoutingRules muessen fuer neue Check-ins wieder eine valide Simple Route haben.

Guard-Prinzip:

```text
Konfiguration darf nicht entfernt oder deaktiviert werden, wenn laufende oder
fachlich relevante Visits dadurch ihre operative Wahrheit verlieren wuerden.
```

Das ist dasselbe Grundmuster wie bei `TOPIC_LOCKED` und
`JOURNEY_TEMPLATE_LOCKED`, nur auf Surface, Location und Queue erweitert.

## Side Effects

### Wechsel Simple -> Complex

Moegliche Auswirkungen:

- Bestehende Topics behalten Basisdaten.
- Bestehende Simple-RoutingRules koennen als Fallback erhalten bleiben.
- Pro Topic kann entschieden werden, ob eine Journey zugeordnet wird.
- Bis zur Journey-Zuordnung kann ein Topic weiter Simple Routing nutzen.
- Mixed Mode ist im Complex-Setup erlaubt: einige Topics koennen Journeys nutzen,
  andere bleiben simple.

### Wechsel Complex -> Simple

Risiken:

- Aktive Visits koennen noch `journeyState: active` haben.
- JourneyTemplates koennen noch von RoutingRules referenziert werden.
- UI wuerde Journey-Kontext verstecken, obwohl Runtime ihn noch braucht.

Regel:

- Wechsel blockieren, solange offene aktive Journey-Visits existieren.
- Danach RoutingRules auf Simple-Routing zuruecksetzen oder Journey-Zuordnung nur
  deaktivieren, wenn ein valider `defaultRoomId` pro Topic existiert.

### Laufende Visits

Runtime-Visits duerfen durch Config-Wechsel nicht ihre operative Wahrheit verlieren.

Grundregel:

```text
Neue Konfiguration gilt fuer neue Check-ins.
Laufende Visits behalten ihre gespeicherte operative Wahrheit.
```

### Kommerzielle Feature-Grenze

Wenn Complex Routing als Produktfeature verkauft wird:

- Runtime-Core darf intern weiter existieren.
- UI und Config-APIs fuer Journey Designer werden capability-gated.
- Bestehende Complex-Konfiguration darf bei Lizenzverlust nicht still kaputtgehen.
- Ohne Lizenzserver muss die lokale App bei relevanten Updates/Config-Writes pruefen,
  ob Complex Routing noch erlaubt ist.
- Nach einer Karenzzeit soll ein Rueckweg auf Simple Routing moeglich sein.

Bewusst spaeter zu entscheiden:

- Lizenzverlust nach Karenzzeit: automatisch auf Simple zurueckfuehren oder Complex
  read-only anzeigen und neue Complex-Writes blockieren?

Diese Entscheidung ist fuer den ersten RoutingMode-/Guard-Ausbau kein Blocker,
solange die spaeteren Lizenz-Guard-Punkte nicht verbaut werden.

## Implementierungsreihenfolge

### Phase 1 - Arbeitsgrundlage und Guards

- Arbeitsdokument abstimmen.
- RoutingMode-Typ und Setting modellieren.
- Capability-Antwort fuer UI definieren.
- Surface-/Location-/Queue-Guards fertigziehen.
- Tests fuer Guards und Mode-Wechsel-Szenarien.

### Phase 2 - Simple explizit machen

- Bestehende Sync-Logik als Simple Routing benennen.
- Generated RoutingRules klar markieren oder dokumentieren.
- Topic Editor weiter fuer Simple Routing stabilisieren.
- Simulator-Minimum fuer Simple Routing planen.

### Phase 3 - Complex Config anbinden

- JourneyTemplates im Host verwaltbar machen.
- Topic -> Journey-Zuordnung in Config/API modellieren.
- RoutingRule-Sync fuer Complex Mode erweitern.
- Mode-Wechsel-Regeln implementieren.

### Phase 4 - UI uebernehmen

- Komponenten aus `../new_flow_core/src/public/journey-admin.js` auswerten.
- Nicht 1:1 kopieren, sondern in bestehende Svelte-/MFA-/Ops-Settings-UI uebertragen.
- Zuerst Topic-Journey-Zuordnung.
- Danach Journey Template Designer.
- Danach Simulator.

### Phase 5 - Simulator

- Simulation-API oder clientseitiger Simulationsadapter definieren.
- Simple und Complex Szenarien abdecken.
- Surface-Preview fuer Terminal, MFA, TV, Raum-Panel.
- Status-/Journey-Timeline.
- Optional: Validierungsbericht mit Warnungen.

## Geklaerte Punkte

- `routingMode` ist praxisweit.
- Complex Routing kann Simple Routing abbilden.
- Mixed Mode ist im Complex-Setup erlaubt: einzelne Topics koennen Journey-Routing
  nutzen, andere bleiben einfache RoutingRules.
- Topics bleiben in beiden Modi bearbeitbar.
- Runtime-APIs werden nicht in Simple/Complex getrennt.
- Lizenzthema wird jetzt vorbereitet, aber nicht umgesetzt.
- Es gibt keine Online-Lizenzserver-Abhaengigkeit im laufenden Praxisbetrieb.
- Guards fuer Surface, Location und Queue folgen demselben Muster wie Topic- und
  Journey-Locks.
- Loeschen/Deaktivieren ist nur erlaubt, wenn keine laufende oder fachlich relevante
  Nutzung besteht.

## Spaeter Bewusst Zu Klaeren

Diese Punkte sind wichtig, aber nicht notwendig, um RoutingMode, Guards und erste
UI-Schnitte sauber anzulegen.

- Was passiert bei Lizenzverlust mit bestehenden Journey-Konfigurationen?
- Wie lang ist die Karenzzeit bei Lizenzverlust?
- Wird nach der Karenzzeit automatisch auf Simple zurueckgefuehrt oder Complex
  read-only angezeigt?
- Welche konkreten Complex-Config-Writes werden spaeter lizenzgeguardet?

## Implementierungsfragen

Diese Punkte muessen vor oder waehrend der konkreten Umsetzung entschieden werden.

- Soll Reassignment im MFA-Dashboard langfristig ueber `runtime.redirect` laufen
  oder als eigene Host-Aktion bleiben?
- Gibt es im spaeteren Designer explizite Surface-Referenzen, oder reichen
  `publicDisplayMode` plus Display Rules?
- Wenn Designer-Surface-Referenzen hinzukommen: gehoeren sie in den Core-Katalog
  oder bleiben sie Host-/UI-Konfiguration?

## Vorlaeufige Entscheidungen

- Runtime API bleibt fuer Simple und Complex identisch.
- Topics bleiben in beiden Modi bearbeitbar.
- Simple Routing ist Default.
- Complex Routing ist ein optionales Advanced-/Produktfeature.
- `routingMode` ist praxisweit.
- Mixed Mode ist im Complex-Setup erlaubt: Complex Routing kann einfache
  RoutingRules ohne Journey weiterhin abbilden.
- Lizenzthema wird spaeter implementiert, aber jetzt ueber Capabilities und Guard-
  Punkte vorbereitet.
- Keine Online-Lizenzpruefung im laufenden Betrieb als Voraussetzung fuer Routing.
- Loeschen/Deaktivieren von Surface, Location und Queue wird analog zu Topic- und
  Journey-Locks geschuetzt.
- Flow Core bleibt die gemeinsame Engine.
- UI-Verfuegbarkeit wird ueber Ops Setting und Capabilities gesteuert.
- **Modus-Umschaltung:** Praxis Flow Manager (Setup-API, kein Ops-PIN) — nicht MFA/Ops-Web-UI.
- Guards muessen vor dem UI-Ausbau stehen.
