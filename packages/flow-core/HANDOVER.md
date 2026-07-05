# Flow Core — Handover

**Stand:** 2026-07-04  
**Ziel:** Übernahme in Praxis Flow (Monorepo als `packages/flow-core`)  
**Bezug:** `README.md` (API/Modell), `docs/plan-routing-core-poc.md` in Praxis Flow (Ursprungsauftrag)

Dieses Dokument fasst **getroffene Entscheidungen** und **offene Merge-Schritte** zusammen. Bei Widersprüchen zum README gilt hier das Integrations-Zielbild.

---

## Was dieses Repo ist

| Mitnehmen | Nicht mitnehmen |
|-----------|-----------------|
| `@praxis-flow/flow-core` — Shared Domain (TypeScript) | `src/public/` — Referenz-UI, Cherry-Pick only |
| `@praxis-flow/flow-core/server` — Runtime-Muster (Repositories, Services) | `src/server/http.ts` — PoC-HTTP-Server |
| `db/schema.sql` — Source of Truth | Auth, Portal, Dokumente, SSE/Outbox |
| `test/` — 111 Tests als Vertrag | Demo-Seed als Produkt-Katalog |

**Package:** `@praxis-flow/flow-core` · Branch `feat/typescript-package` · Build: `npm run build` → `dist/`  
Lokale PoC-DB: `db/flow-core.sqlite`.

---

## Getroffene Breaking-Entscheidungen

### 1. Ticket → Visit (kein Doppelmodell)

- **`visits` ersetzt `tickets` + `queue_entries`** im Zielsystem.
- **Öffentliche ID = Ticket-ID:** `visits.id = formatVisitId(businessDay, laneCode, sequence)` → `20260602-A-017`.
- Anzeige-Nummer: `queueNumber = formatTicketCode(...)` → `A-017` (Suffix der ID).
- Portal-URLs, SMS-Recall, OpenAPI-Pfade können weiter die Visit-ID nutzen — kein UUID-Mapping.

### 2. `authPath` ≠ `checkInPath`

| Feld | Bedeutung | Werte |
|------|-----------|-------|
| `authPath` | Wie hat sich der Patient am Terminal identifiziert? | `phone_dob`, `name_dob`, `egk`, `mfa_assist` |
| `checkInPath` | Routing-Kontext beim Check-in | `topic`, `mfa_assist` |

Nicht vermischen. PF `authPath` mappt 1:1 auf `visits.auth_path`.

### 3. Kein Topic-Snapshot — Topic-Lock stattdessen

- **Kein `topicLabel`-Snapshot** am Visit.
- **24h-Betrieb:** Solange offene Visits mit `primaryTopicId = X` existieren, ist **`PUT /api/topics/:X` blockiert** (`TOPIC_LOCKED`) — analog Journey-Template-Lock.
- Live-Katalog reicht, weil Topic während aktiver Fälle eingefroren ist.

### 4. Statusmodell: feiner als PF `in_room`

Flow Core behält **`arrived` + `in_progress`** statt PF `in_room`:

| PF (alt) | Flow Core (neu) | Anmerkung |
|----------|-----------------|-----------|
| `waiting` | `waiting` / `directed` | abhängig von `movementMode` |
| `called` | `called` | |
| `in_room` | `arrived` oder `in_progress` | Raum-Panel unterscheidet beides |
| `done` | `done` | |
| `absent_*` | — | **PF-Erweiterung** im Host, nicht im Core |
| — | `blocked`, `no_show`, `cancelled` | Core-Status |

**Raum-Panel-Mapping:**

- Anzeige „Bitte eintreten“ → `called`
- Anzeige „Im Raum“ → `arrived` | `in_progress`
- Filter: `targetLocationId === session.roomId` UND Status ∈ `{called, arrived, in_progress}`

### 5. Scoped Transitions (Raum-Panel)

Transition-Body (optional):

```json
{ "targetLocationId": "room_1" }
{ "actingLocationId": "room_1" }
```

| Action | Verhalten |
|--------|-----------|
| `call` + `targetLocationId` | Setzt Aufrufziel (wie PF `room_id` beim Call) |
| `arrive` / `start` / `done` + `actingLocationId` | Nur wenn `visit.targetLocationId` passt → `VISIT_LOCATION_MISMATCH` |
| `done` + `actingLocationId` ab `arrived` | Raum-Panel „Fertig“ ohne explizites `start` (setzt `startedAt` retroaktiv) |

MFA-Dashboard sendet **kein** `actingLocationId` — uneingeschränkt wie bisher.

### 6. Konfiguration: Locks

| Entität | Guard | Fehlercode |
|---------|-------|------------|
| JourneyTemplate | Offene Visits auf Template | `JOURNEY_TEMPLATE_LOCKED` |
| Topic | Offene Visits mit `primaryTopicId` | `TOPIC_LOCKED` |
| RoutingRule | `topicId` immutable | `ROUTING_RULE_TOPIC_IMMUTABLE` |

---

## Runtime-Anbindung im Host

```typescript
import { openDb, createRuntime } from '@praxis-flow/flow-core/server';
import { getBusinessDay } from './database-time.js';

const db = openDb({ path: process.env.DB_PATH });
const runtime = createRuntime(db, { resolveBusinessDay: getBusinessDay });
```

- **`resolveBusinessDay`:** Host injiziert Praxis-Timezone (`getBusinessDay` in PF). Default im Core: UTC-Kalendertag.
- **Events:** Core schreibt `visit_events`. Host mappt auf `outbox_events` + SSE (Event-Typen sind nicht 1:1).
- **Patienten:** Core hat minimale `patients`-Tabelle. Host kann später `identityRef`, `checkinPhone` etc. auf Visit oder Patient legen — noch nicht im Core-Schema.

### Package-Exports (Stand TS-Migration)

| Entry | Verwendung |
|-------|------------|
| `@praxis-flow/flow-core` | Domain-Logik, Validierung, Parser, Labels — ohne SQLite |
| `@praxis-flow/flow-core/server` | `createRuntime`, `openDb`, Repositories, `updateVisit`, `runInTransaction`, … |

PoC-HTTP (`dist/server/http.js`) ist nur Referenz — im Host durch Fastify-Routes ersetzen.

---

## Schema-Übernahme (Tabellen)

**Neu (aus `schema.sql`):**

`topics`, `locations`, `queues`, `surfaces`, `surface_display_rules`, `routing_rules`, `journey_templates`, `journey_steps`, `patients`, `visits`, `visit_topics`, `visit_events`, `daily_queue_counters`

**Entfällt im Ziel:**

`tickets`, `queue_entries` — Felder wandern in `visits` (`calledAt`, `targetLocationId`, Status, …).

**Bleibt PF-spezifisch (nicht im Core):**

`ops_state`, `ops_settings` (→ später Sync in Catalog-Tabellen), `patient_sessions`, `documents`, `outbox_events`, `auth_settings`, Recall/Abwesenheit-Felder.

**Katalog-Seeding:** Demo-Seed in `seed-data.ts` ist PoC only. Produkt-Katalog kommt aus PF-Settings → Topics/Locations/Queues/RoutingRules — **beim Merge**, nicht vorher im Core.

---

## Shared-Module (über `@praxis-flow/flow-core`)

Alle unter `src/shared/*.ts`, exportiert via `src/index.ts`:

```text
types.ts, domain-enums.ts
journey.ts, visit-flow.ts, redirect-flow.ts
surface-visibility.ts, routing-scope.ts, admin-validation.ts
labels.ts, api-errors.ts, request-schemas.ts
journey-guard.ts, topic-guard.ts, transition-scope.ts
ticket-code.ts, lane-code.ts, business-day.ts
check-in-path.ts, auth-path.ts, escort.ts, visit-context.ts
```

Wichtige exportierte Typen: `Visit`, `RoutingRuleDraft`, `JourneyTemplateDraft`, `RedirectRequestBody`, `TransitionContext`, `ResolveBusinessDay`.

---

## Server-Muster (über `@praxis-flow/flow-core/server`)

```text
runtime.ts              — Composition Root
catalog-repository.ts   — Katalog laden
visit-repository.ts     — Visits, Events, updateVisit
visit-service.ts        — checkIn, transition, redirect
admin-service.ts        — saveRule, saveJourneyTemplate, saveTopic
queue-counter.ts          — atomare Lane-Nummern
unit-of-work.ts           — Transaktionen
location-routing.ts       — Queue-Wechsel bei Ankunft
escort.ts (server)        — Check-in-Routing mit Escort-Remap
open-db.ts, seed.ts       — PoC-DB (Host ersetzt durch Postgres-Adapter)
http.ts                   — PoC-HTTP (Host ersetzt durch Fastify)
```

---

## TypeScript-Migration (erledigt)

| Phase | Inhalt |
|-------|--------|
| 0 | `tsconfig`, Package `@praxis-flow/flow-core`, `dist/` |
| 1 | `src/shared/` in TypeScript, Browser importiert `dist/shared/*.js` |
| 2 | `src/server/` in TypeScript, Unit-Tests → `.test.ts`, PoC-HTTP → `dist/server/http.js` |
| 3 | Integration-Tests → `.test.ts`, Barrel-Exports, `main`/`types`/`files` in `package.json` |

**Verifikation:** `npm test` → build + 111 Tests grün.

---

## Offen im Core (klein)

| Thema | Priorität |
|-------|-----------|
| Raumkapazität (`called`+`arrived`+`in_progress` pro Location) | Mittel — Logik aus PF `@praxis-flow/domain/room-capacity` portieren |
| `ticket-code` mit `@praxis-flow/domain` deduplizieren | Niedrig — beim PF-Merge |
| Referenz-UI: `authPath`, Transition-Body | Optional, nur PoC |

---

## Offen im Host (Merge-Arbeit)

**Stand 2026-07-05:** Kern-Migration in `praxis_flow_merge` abgeschlossen (Schema, Check-in, Queue, Portal, OpenAPI). Verbleibend:

1. ~~Package als `packages/flow-core`~~ erledigt
2. ~~`createRuntime` hinter Fastify-Routes~~ erledigt
3. ~~Schema-Migration~~ erledigt (`ensureFlowCoreSchema`, Legacy-Drop)
4. Journey-Admin, Redirect-Formular (aus `public/journey-admin.js`) — UI noch offen
5. ~~OpenAPI Visit-Breaking~~ erledigt
6. ~~PF-Features auf Visit-Ebene~~ erledigt (absent/recall/portal)
7. ~~Outbox/SSE-Event-Mapping~~ erledigt
8. ~~Day-Close / Check-in-Lock an Visit-Reset~~ erledigt
9. Produktions-Deploy — out of scope hier

---

## Bewusst nicht im Core

- `requiresReceptionConfirmation` (Schließanlage)
- Template-Versioning bei laufenden Visits
- `manual` Journey-Advance
- `stay_at_terminal` als MovementMode (PoC-Plan verworfen)
- Auth, Rollen, PVS, Docker, echte Migrationen

---

## Empfohlene Merge-Reihenfolge

```text
1. Branch feat/typescript-package → packages/flow-core im PF-Monorepo; npm test grün
2. Schema visits/catalog parallel; Check-in schreibt Visit statt Ticket
3. Queue-Transitions → runtime.transition / redirect
4. Settings → RoutingRule-Sync (automatisch aus topics/rooms)
5. MFA-UI auf Visit-Modell
6. Portal/Dokumente an Visit-ID umhängen
7. tickets/queue_entries entfernen
```

---

## Verifikation vor Go-Live

- [ ] 111 Core-Tests grün im Package (`npm test`)
- [ ] Check-in erzeugt ID `YYYYMMDD-L-NNN`
- [ ] Infekt unsichtbar am WZ-TV, Labor nur `call_only`
- [ ] Journey-Lock + Topic-Lock unter Last
- [ ] Raum-Panel: scoped arrive/done, fremder Raum → 409
- [ ] `getBusinessDay` mit Praxis-Timezone
- [ ] PF-Smoke: Terminal, MFA, TV, Portal, Day-Close
