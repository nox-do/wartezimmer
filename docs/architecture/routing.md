# Routing — Modi, Catalog-Regeln, Journeys

Stand: 2026-09-09 · Ist am Code (`sync-catalog-from-ops-settings`, `flow-core` Visit-/Journey-Flow)

**Scope:** Wie ein Check-in zum operativen Ziel wird; `simple` vs. `complex`; Journey-Autopilot; Redirect; Mode-/Lizenz-Guards.  
Nicht: Nummernkreis/Themen-Editor-Detail → [`domain.md`](domain.md) · Call-Raum-Resolver → [`domain.md`](domain.md) §3 · Fachflows UI → [`../flows.md`](../flows.md) · Package-API → `packages/flow-core/README.md`

**Stil:** Architecture-Docs beschreiben den **Ist-Stand**.

## 1. Leitidee

| Ebene                | Verantwortung                                                                                    |
| -------------------- | ------------------------------------------------------------------------------------------------ |
| Praxis-Konfiguration | **Konfigurationswahrheit** in `ops_settings`: Mode, Topics, Räume und Journeys                   |
| Catalog              | **Ausführbare Projektion** durch `syncCatalogFromOpsSettings()`                                  |
| Visit                | **Operative Wahrheit**: Status, Aufenthaltsort, Ziel, Queue, Movement und Journey-Cursor         |
| Flow-Core            | Zustandsautomat, Journey-Fortschritt und fachliche Guards                                        |
| Host-Workflows       | Komponieren Core-Transitions atomar und prüfen konfigurierte Räume sowie Kapazitäten             |
| UI / Surfaces        | Übersetzen Bedienhandlungen in API-Kommandos und zeigen Sichten; sie sind keine Routing-Wahrheit |

Zwei Wege zur ersten Route:

1. **Single-step** — `RoutingRule.initial_*` (Ziel Wartezimmer → `call`, echtes Raumziel → `self_go`)
2. **Journey** — Rule trägt `journeyTemplateId`; Check-in nimmt **nur Step 0**; `initial_*` wird ignoriert

```mermaid
flowchart TB
  ops[ops_settings]
  sync[syncCatalogFromOpsSettings]
  catalog[topics locations routing_rules journey_*]
  checkin[checkIn]
  visit[Visit operativ]
  ops --> sync --> catalog
  catalog --> checkin --> visit
  visit --> transitions[call arrive start done continue_journey redirect]
```

## 2. `routingMode`: simple vs. complex

Gespeichert: `ops_settings.routing_mode` (`'simple' | 'complex'`).  
Fachliche Autorität: **Ops Settings** — nicht MFA. Manager/Setup dürfen den lokalen technischen Kompatibilitätspfad nur für Host-/Restore-Abläufe verwenden (`ops-settings-patch-by-role.ts`).

|                           | **simple**                                  | **complex**                                                    |
| ------------------------- | ------------------------------------------- | -------------------------------------------------------------- |
| Catalog-Sync              | nur `syncSimpleRoutingRulesFromOpsSettings` | + Journey-Templates + `syncComplexRoutingRulesFromOpsSettings` |
| Topic-`journeyTemplateId` | wird **nicht** in die Rule geschrieben      | verknüpft, wenn Template existiert und `active`                |
| UI Journey-Designer       | aus (`features.journeyDesigner`)            | an, **nur wenn lizenziert**                                    |
| Host-Default ohne Journey | Wartezimmer → `call`; Raumziel → `self_go`  | gleich, wenn kein aktives Template am Topic                    |

**Wichtig:** `complex` allein aktiviert keine Mehrschritt-Routen. Ohne Templates bleiben Rules single-step-förmig.

### Lizenz & Capabilities

Die folgenden Lizenzbezeichner sind technische Capability-Schalter. Sie erteilen
keine Nutzungs- oder Weitergaberechte und ändern die
[Wartezimmer-Lizenz](../../LICENSE) nicht. Complex Routing ist standardmäßig
freigegeben; daraus entsteht keine gesonderte Lizenzgebühr.

`resolveRoutingCapabilities` (`app/src/shared/ops/routing-capabilities.ts`):

- `complexRouting` / `journeyDesigner` = Mode `complex` **und** `isComplexRoutingLicensed()`
- Lizenz-Stub: Env `COMPLEX_ROUTING_LICENSED=true|false`, sonst standardmäßig lizenziert (`packages/server-shared/src/routing-license-stub.ts`)
- `routingSimulator: true` immer (Capability-Flag; keine eigene Produktfläche dokumentiert)

Wechsel **nach** `complex` bei explizitem Opt-out → `COMPLEX_ROUTING_NOT_LICENSED`.
Offene Visits (Status ∉ `done` \| `cancelled` \| `no_show`) → Mode-Wechsel blockiert (`ROUTING_MODE_CHANGE_BLOCKED`).

## 3. Catalog-Entitäten (Routing-relevant)

| Entität                           | Rolle                                                                                                |
| --------------------------------- | ---------------------------------------------------------------------------------------------------- |
| **Topic**                         | Anmeldgrund; Host: `defaultRoomId`, optional `journeyTemplateId`                                     |
| **Location**                      | Ort (`pf_entrance`, `pf_waiting`, Praxis-Räume, …)                                                   |
| **Queue**                         | Host-Sync: eine `pf_general_queue` (Package-Modell erlaubt mehr)                                     |
| **Surface**                       | Terminal / TV / MFA / Raum-Panel; Scope & Redirect-Fähigkeit                                         |
| **RoutingRule**                   | Policy pro Topic: Escort, `allowRedirect`, Terminal-Scope; **entweder** `initial_*` **oder** Journey |
| **JourneyTemplate / JourneyStep** | Mehrschritt; Step: Ziel, Queue, `movementMode`, `publicDisplayMode`, `completedWhen`                 |

Typen: `packages/flow-core/src/shared/types.ts`. Schema: `packages/flow-core/db/schema.sql`.

### Raumbegriffe und Zuständigkeiten

Ein Praxisraum existiert absichtlich auf zwei Ebenen:

- `ops_settings.rooms` enthält die administrativen Eigenschaften: Bezeichnung, Aktivierung, `defaultCallTarget`, Kapazität und Panel-Konfiguration.
- Der Catalog projiziert jeden Raum als `Location`; ein aktiviertes Raum-Panel wird zusätzlich als `Surface` angelegt.

Am Visit sind Aufenthaltsort und Ziel strikt getrennt:

- `lastKnownLocationId`: letzter bekannter tatsächlicher Aufenthaltsort
- `targetLocationId`: operatives Ziel des aktuellen Hops
- `locationConfidence`: ob der Aufenthaltsort angenommen, angewiesen oder bestätigt ist

Das Themenfeld `defaultRoomId` ist das primäre Ziel im Simple Routing. Zeigt es auf einen fehlenden oder deaktivierten Raum, greift der mit `defaultCallTarget` markierte aktive Praxisraum. Ist kein Raum markiert, ist `pf_waiting` der definierte Fallback. Das feste Systemthema M verwendet ebenfalls dieses Standard-Aufrufziel.

Beginnt ein normaler Simple-Routing-Fall bewusst in `pf_waiting`, liefert `postWaitingCallTargetId` das Ein-Klick-Ziel für den späteren MFA-Aufruf. Die MFA kann dieses Ziel im Raum-Board für die Browser-Session temporär überschreiben. Diese Auflösung findet ausschließlich im MFA-Client statt und wird als explizites Raumziel an die normale Call-API gesendet. Sie gilt nicht für Complex Routing, begleitete Patienten (`needsAssistance`) oder Drag & Drop.

### Movement & Display

| Typ                 | Werte                                 | Wirkung (Auszug)                                                                                                              |
| ------------------- | ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `MovementMode`      | `self_go` \| `call` \| `pickup`       | Check-in/Hop: `self_go` → Status `directed`; `call`/`pickup` → `waiting`. `call`-Transition nur bei `movementMode === 'call'` |
| `PublicDisplayMode` | `visible` \| `hidden` \| `call_only`  | TV/public_display; Staff-Panels nutzen `surface_display_rules`, nicht Visit-Display-Mode                                      |
| `EscortPolicy`      | `none` \| `recommended` \| `required` | kann Movement auf `pickup` heben; `required` blockiert Redirect mit `self_go`                                                 |
| `completedWhen`     | `arrive` \| `start` \| `done`         | wann der aktuelle Journey-Step als erledigt gilt                                                                              |

Das Wartezimmer-TV ist eine lokale Patientenanzeige, keine praxisweite Routing-Übersicht:

- Sichtbarkeit setzt voraus, dass `lastKnownLocationId` dem Standort des Displays entspricht.
- `called` wird als Aufruf und lokales `pickup` als Abholhinweis angezeigt.
- `directed`/`self_go` bleibt eine Anweisung am Terminal beziehungsweise durch das Personal und erscheint nicht auf dem TV.
- Das MFA-Dashboard bleibt die globale operative Übersicht. `publicDisplayMode` schränkt die lokale TV-Sichtbarkeit zusätzlich ein, erweitert sie aber nicht auf andere Standorte.

## 4. Sync (Host → Catalog)

Einziger Produktions-Writer: `app/src/shared/flow-core/sync-catalog-from-ops-settings.ts`.

```text
Ops PATCH / updateOpsSettings
  → validateComplexRoutingLicenseChange (bei Mode→complex)
  → validateRoutingModeChange (offene Visits)
  → syncFlowCoreCatalog → syncCatalogFromOpsSettings
  → Topics/Locations/Queue/Surfaces
  → syncRoutingRulesFromOpsSettings (simple | complex+journeys)
  → validateCatalogIntegrity
```

**Simple-Rule** (`buildSimpleRoutingRuleRow`):

- `initialLastKnown` = `pf_waiting`
- `initialTarget` = enabled `defaultRoomId`, sonst Wartezimmer
- `initialQueueId` = `pf_general_queue`
- `initialMovementMode` = am Wartezimmer `'call'`, bei einem Raumziel `'self_go'`; `publicDisplayMode` = `'visible'`
- Systemthema M: `initialLastKnown` = Eingang, Ziel folgt dem Standard-Aufrufziel, `allowRedirect: false`

**Complex mit Journey** (`buildJourneyRoutingRuleRow`): Rule verknüpft Template; `initial_*` werden weiter befüllt, aber Check-in ignoriert sie.

Entfernte Topics/Locations/Rules: **soft deactivate** (FK-sicher zu historischen Visits).

App-Start: `initializeFlowCore()` synct aus gelesenen `ops_settings`. Backup exportiert Catalog **nicht** — nach Import neu syncen ([`../operations/backup.md`](../operations/backup.md)).

## 5. Check-in → erste Route

`createVisitService().checkIn` (`packages/flow-core/src/server/visit-service.ts`):

1. Topic auflösen (`mfa_assist` → Assist-Topic)
2. `ruleForTopicAtSurface(catalog, topicId, surfaceId)` — aktive Rule am Terminal
3. Snapshot `allowRedirect` + Escort von der Rule
4. `needsAssistance` beziehungsweise `mfa_assist` hebt den effektiven Escort auf `required`; dadurch wird `self_go` operativ zu `pickup`
5. **Mit Journey:** Steps laden; Step 0 Pflicht (`JOURNEY_STEP_MISSING`); Route aus `stepToVisitPatch`; `journeyState: 'active'`, Index `0`; Confidence am Check-in `'assumed'`
6. **Ohne Journey:** `resolveCheckInRouting` kopiert `initial_*`, Escort→Movement, Terminal-Instruction

Ticket-Felder (`laneCode`, Sequence, `topicLabel`) sind danach immutable; Ziel/Queue/Movement bleiben über Transitions änderbar.

## 6. Journey-Laufzeit

```text
Step abgeschlossen (completedWhen matcht Transition)
  → completeJourneyStepPatch
      → nächster Step self_go? sofort startNext…
      → sonst journeyStepCompletedAt setzen
  → Staff: callVisit / continue_journey → start_next_journey_step
```

Besonderheiten:

- **H7:** `lastKnownLocationId ===` nächstes Ziel → Status direkt `arrived` (kein waiting/call-Zyklus)
- Letzter Step fertig → `journeyState: 'completed'`, Index `null`
- `return_to_waiting` hält Journey **active** (kein Redirect)
- Redirect / Cancel → Journey `abandoned` (Redirect nullt Step-Cursor)

Host-Bridge: `app/src/shared/flow-core/visit-queue-bridge.ts` — u. a. `callVisit` führt zuerst `start_next_journey_step` aus, wenn `journeyStepCompletedAt` gesetzt ist.

MFA-Drag-&-Drop auf einen Raum startet bei abgeschlossenem Hop denselben nächsten Journey-Step wie „Weiter“, übergibt aber den gewählten Raum als operatives Ziel für diesen Hop. Spätere Journey-Steps bleiben unverändert.

### Drag & Drop: UI-Absicht, serverseitige Autorität

Der Resolver `ui/src/lib/queue/queue-drop-resolver.ts` ist reine UI-Logik. Er kennt Drag-Quelle und Drop-Zone und übersetzt die abgeschlossene Geste in ein Kommando:

- Wartebereich → Raum: `call` oder `place-in-room`
- aktiver Bereich → Raum: `reassign`, `continue-journey` oder `place-in-room`
- aktiver Bereich → Wartezimmer: `return-to-waiting`
- Wartebereich → abwesend: `mark-away`

Der Resolver ändert keinen Visit und entscheidet nicht verbindlich, ob die Operation erlaubt ist. `mfa-queue-commands.svelte.ts` ruft lediglich die passende Queue-API auf. API, Host-Workflow und Flow-Core prüfen anschließend erneut Transition, aktiven Praxisraum, Kapazität, Location-Scope und Assistenzregeln. Die Assistenz-Bestätigung vor der Platzierung ist eine UI-Sicherheitsabfrage; fachlich ausgeführt wird danach derselbe serverseitige atomare Platzierungsworkflow.

Die explizite Platzierung wird im Host-Workflow `placeVisitInRoom` (`app/src/shared/queue/place-visit-in-room.ts`) komponiert: optionaler Journey-Start, Call/Reassign und Arrival laufen unter einer gemeinsamen SQLite-Transaktion. `CoreDatabase.checkInRoom()` bleibt dagegen die einfache Ankunftsbestätigung, wie sie insbesondere Raum-Panels und die begleitete Ankunft in `pf_waiting` benötigen. Nach außen meldet der Platzierungsworkflow genau einen Übergang vom Status vor der Benutzeraktion zum finalen Status; die einzelnen Flow-Core-Events bleiben für das Audit erhalten.

Ein normaler Aufruf und eine explizite Platzierung akzeptieren serverseitig nur aktuell aktivierte Praxisräume. Das gilt auch, wenn dieselbe Ziel-ID bereits am Visit gespeichert ist. `pf_waiting` selbst ist ausschließlich als Ziel der begleiteten Wartezimmer-Ankunft zulässig und nie das finale Ein-Klick-Aufrufziel; der Simple-Routing-Komfortpfad löst es vorher auf einen aktiven Praxisraum auf.

Queue-HTTP: Transition-Typ `continue_journey` (`queue-visit-transitions.ts`).

## 7. Redirect

Voraussetzungen (`validateRedirectRequest`):

- Surface `supportsRedirect` (Host-MFA-Dashboard ja; Raum-Panels nein)
- Visit `allowRedirect` (Assist: false)
- Escort `required` → kein Redirect auf `self_go`

Wirkung: neues operatives Ziel/Movement/Queue; Call-/Arrive-/Start-Zeiten clear; Journey abandoned.  
`reassignTarget` (Raumwechsel in call/arrive/in_progress) ist **kein** Redirect und abandoned die Journey nicht von allein.  
**Host/MFA:** nur Reassign verdrahtet; Redirect-API am Queue bewusst noch nicht (siehe Kommentar an `reassignVisitRoom`).

## 8. Konfiguration & Guards (nichtfunktional)

| Guard                                   | Wann                      | Code                                                       |
| --------------------------------------- | ------------------------- | ---------------------------------------------------------- |
| Offene Visits global                    | Mode-Wechsel              | `ROUTING_MODE_CHANGE_BLOCKED`                              |
| Lizenz                                  | Mode → complex            | `COMPLEX_ROUTING_NOT_LICENSED`                             |
| Offene **aktive** Journeys pro Template | Journey speichern/löschen | `JOURNEY_TEMPLATE_LOCKED` (nur `journey_state = 'active'`) |
| Topic↔Template                          | Ops-JSON                  | `validateTopicJourneyAssignments`                          |
| Catalog-Integrität                      | nach Sync                 | u. a. keine überlappenden aktiven Rules pro Topic+Surface  |

Rollen:

- MFA: Topics + `journeySettings` (wenn Capabilities)
- Ops: `routingMode` über `/api/v1/ops/settings`; keine Routing-Konfiguration im Manager

Transaktionen: Check-in / Transition / Redirect / Cancel mit `BEGIN IMMEDIATE` (flow-core).  
Tagesreset leert Visits; Mode, Topics, Journeys bleiben ([`system.md`](system.md) §5).

### Bekannte Drift-/Rest-Risiken (Ist)

1. **stale `journey_*` nach Wechsel auf simple:** Rules verlieren `journeyTemplateId`; Journey-Tabellen werden im Simple-Zweig nicht deaktiviert — Integrity prüft nur noch aktive Templates.
2. Bei Simple Routing wird für ein echtes Raumziel `self_go` und für das Wartezimmer `call` verwendet.

## 9. Code-Karte

| Pfad                                                                                | Verantwortung                     |
| ----------------------------------------------------------------------------------- | --------------------------------- |
| `app/src/shared/flow-core/sync-catalog-from-ops-settings.ts`                        | Catalog-Projektion simple/complex |
| `app/src/shared/ops/routing-capabilities.ts`                                        | Feature-Flags für UI              |
| `app/src/shared/ops/routing-mode-guard.ts`                                          | Mode + Open-Visit                 |
| `app/src/shared/ops/journey-template-guard.ts`                                      | Template-Lock                     |
| `app/src/shared/journey-settings.ts`                                                | Ops-JSON Journeys                 |
| `app/src/shared/flow-core/visit-queue-bridge.ts`                                    | Queue-Ops ↔ Core-Transitions      |
| `app/src/shared/queue/place-visit-in-room.ts`                                       | Atomare explizite Raumplatzierung |
| `packages/flow-core/src/shared/{journey,visit-flow,redirect-flow,routing-scope}.ts` | Domain-Algorithmen                |
| `packages/flow-core/src/server/visit-service.ts`                                    | Check-in / Transition / Redirect  |
| `ui/src/lib/queue/queue-drop-resolver.ts`                                           | Drop-Geste → UI-Kommando          |
| `ui/.../mfa/settings/topics-rooms/journeys/`                                        | Journey-Designer                  |

Tests mit hoher Signalstärke: `sync-catalog-from-ops-settings.test.ts`, `routing-mode-guard*.test.ts`, `packages/flow-core/test/integration/runtime.test.ts`, `journey*.test.ts`, `visit-queue-bridge.test.ts`.

## 10. Beispiele

**Simple — Thema Blut → Labor**

1. Topic `defaultRoomId: labor`, Mode `simple`
2. Sync: Rule waiting→labor, `self_go`, kein Journey
3. Check-in: Visit `directed`, Ziel Labor; Wegweisung erfolgt am Terminal
4. Ankunft bestätigen → `arrived`; danach `start` / `done`

**Complex — Empfang dann Labor**

1. Mode `complex` + Lizenz; Template Step0 Empfang (`call`, `completedWhen: arrive`), Step1 Labor
2. Topic verknüpft Template → Check-in nur Step0
3. Arrive schließt Step0 → `journeyStepCompletedAt` → `continue_journey` / Call startet Step1
4. Redirect mittendrin → neue operative Route, Journey `abandoned`

## 11. Verweise

| Thema                        | Dokument                                             |
| ---------------------------- | ---------------------------------------------------- |
| Catalog-Wahrheit / Call-Raum | [`domain.md`](domain.md)                             |
| API-Rollen Settings-PATCH    | [`apis.md`](apis.md)                                 |
| System / Tagesreset          | [`system.md`](system.md)                             |
| Backup Catalog-Resync        | [`../operations/backup.md`](../operations/backup.md) |
| Package-Domain kurz          | `packages/flow-core/README.md`                       |
