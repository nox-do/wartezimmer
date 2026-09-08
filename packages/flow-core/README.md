# Flow Core

Library für Praxisdurchläufe — Visit-Routing, Queues, Surfaces und Journey-Templates.

**Package:** `@praxis-flow/flow-core` (TypeScript, Build nach `dist/`)

Host-Architektur (Modi, Sync, Guards): [`docs/architecture/routing.md`](../../docs/architecture/routing.md).

Standalone-Referenz (HTTP + UI): `../new_flow_core` (Sibling-Repo neben diesem Monorepo).

## Domain-Modell

| Begriff             | Rolle                                                                                                                        |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| **Visit**           | Operative Wahrheit eines heutigen Praxisdurchlaufs                                                                           |
| **Location**        | Physischer Ort oder Station (Wartezimmer ist eine normale Location)                                                          |
| **Queue**           | Geordnete Bearbeitungsliste (Warteliste, Laborliste, …)                                                                      |
| **Surface**         | Anzeige oder Bedienoberfläche (Terminal, WZ-TV, Labor-Panel, …)                                                              |
| **Topic**           | Anliegen aus dem Check-in                                                                                                    |
| **RoutingRule**     | Policy + Auswahl (Topic, Terminals, Escort, Redirect); Route entweder `single_step` oder vollständig aus **JourneyTemplate** |
| **JourneyTemplate** | Vordefinierte Mehrschritt-Route; ersetzt ab Check-in die operative Route                                                     |

### Wichtige Invarianten

- **Visit = operative Wahrheit** — Queue, Location, Status, Anweisung leben auf dem Visit, nicht auf VisitTopic.
- **JourneyTemplate** — bei verknüpfter Vorlage führt der Autopilot Schritt für Schritt; `journey_state`: `active` · `completed` · `abandoned`.
- **Template-Lock** — solange offene Visits auf einem Template laufen, ist Speichern blockiert (`journey-guard.ts`).
- **Redirect** — setzt neue operative Wahrheit, schreibt Historie; Journey wird `abandoned`.
- **Surface-Visibility** — WZ-TV, Labor-Panel etc. filtern Visits über Display-Regeln (Spezifität, `sort_order`, hidden > visible).
- **Transaktionen** — Check-in, Transition, Redirect und Config-Writes laufen transaktional (`BEGIN IMMEDIATE`, WAL).
- **Nummernkreis (Lane)** — pro Topic konfiguriert (`topics.lane_code`); Counter pro `(Geschäftstag, Lane)`; Anzeige `A-017` (nicht global `017`).
- **Ticket-Snapshot** — beim Check-in: `queueLaneCode`, `queueSequence`, `queueNumber`, `queueNumberDate`, `queueNumberScope: lane_day`. Mehrere Topics können Lane teilen (z. B. `general` + `op_prep` → `A`).

### Visit-Ticket-Felder (API)

| Feld               | Bedeutung                                                                                                          |
| ------------------ | ------------------------------------------------------------------------------------------------------------------ |
| `queueNumber`      | Formatiert, z. B. `A-017` — **nicht** numerisch parsen                                                             |
| `queueLaneCode`    | Snapshot Nummernkreis (A–Z)                                                                                        |
| `queueSequence`    | Laufnummer im Lane-Tag                                                                                             |
| `queueNumberDate`  | Geschäftstag (Default: Kalendertag)                                                                                |
| `queueNumberScope` | immer `lane_day`                                                                                                   |
| `needsAssistance`  | Persistenter Begleitbedarf; Escort wird `required`, `self_go` wird `pickup`; Topic, Ziel und Lane bleiben erhalten |
| `checkInPath`      | `topic` (Standard) oder `mfa_assist` (Hilfe-Button)                                                                |
| `authPath`         | `phone_dob`, `name_dob`, `egk`, `none` — Terminal-Anmeldeweg                                                       |
| `id` (Visit)       | `formatVisitId(businessDay, laneCode, sequence)` → `20260602-A-017`                                                |

**Wichtig für Adapter:** Ticket-Anzeige und Sortierung über `queueLaneCode` + `queueSequence` (oder `parseTicketCode(queueNumber)`). `visit.topic.laneCode` ist Live-Katalog und kann vom Snapshot abweichen.

## Projektstruktur

```text
db/schema.sql              — SQLite-Schema (Source of Truth)
src/shared/                — portable Domain-Logik (TypeScript → dist/shared/)
src/server/                — Runtime (TypeScript → dist/server/)
  runtime.ts               — Composition Root (createRuntime)
  visit-service.ts         — Check-in, Transition, Redirect
  catalog-repository.ts    — Katalog aus SQLite
  visit-repository.ts      — Visits + Events
  admin-service.ts         — Rules/Templates/Topics (Package-Tests / Legacy)
  open-db.ts / seed*.ts    — Test-Infrastruktur (nicht Host-Produktpfad)
src/index.ts               — @praxis-flow/flow-core (shared barrel)
test/                      — Unit + Integration
dist/                      — Build-Ausgabe (gitignored)
```

### Package-Exports

| Import                          | Inhalt                                                      |
| ------------------------------- | ----------------------------------------------------------- |
| `@praxis-flow/flow-core`        | Shared Domain (Types, Validierung, Journey, Visit-Flow, …)  |
| `@praxis-flow/flow-core/server` | Runtime (`createRuntime`, `openDb`, Repositories, Services) |

`openDb` / `seed*` sind **Package-Testadapter**, nicht Teil des Host-Betriebs. Der Host nutzt Fastify + eigene DB/Migration und importiert Runtime/Shared.

## Entwicklung

```bash
npm run -w @praxis-flow/flow-core build
npm run -w @praxis-flow/flow-core typecheck
npm run -w @praxis-flow/flow-core lint
npm run -w @praxis-flow/flow-core test
```

## Integration

```typescript
import {
  assertTransitionAllowed,
  ruleForTopicAtSurface,
  formatVisitId,
  type Visit,
  type RoutingRuleDraft,
} from '@praxis-flow/flow-core';

import { createRuntime, loadCatalog } from '@praxis-flow/flow-core/server';
```

Shared-Module (Domain, ohne DB) — vollständige Liste siehe `src/index.ts`.

**An Host-Grenze:**

- `createRuntime` / Services → eigener DB-Layer, Auth, Event-Bus
- `schema.sql` → Migration in Host-DB
- `resolveBusinessDay()` → Host injiziert Praxis-Tagesgrenze via `createRuntime(db, { resolveBusinessDay })` (Default: UTC-Kalendertag)

**Praxis-Flow-Mapping (Check-in / Ticket):**

| Flow Core                         | Praxis Flow                              | Anmerkung                                      |
| --------------------------------- | ---------------------------------------- | ---------------------------------------------- |
| `checkInPath: 'topic'`            | Routing-Kontext Standard-Themen-Check-in |                                                |
| `checkInPath: 'mfa_assist'`       | Routing-Kontext Hilfe-Button             |                                                |
| `authPath`                        | `phone_dob`, `name_dob`, `egk`, `none`   | Terminal-Identifikation                        |
| `id` / Visit-ID                   | `formatVisitId(...)`                     | wie PF Ticket-ID                               |
| `queueLaneCode` + `queueSequence` | `laneCode` + `number`                    | strukturiert bevorzugen                        |
| `queueNumber`                     | `formatTicketCode(...)`                  | `A-017`; Legacy-Consumer nicht als Zahl parsen |
| `needsAssistance`                 | Begleitbedarf                            | additiv zum Topic; wirkt auf Escort/Movement   |

**Ticket-Format:** `formatTicketCode` mit `padStart(3)` bis 999, danach variable Breite; `parseTicketCode` akzeptiert 1–4 Ziffern und optionalen Bindestrich.

**Bewusste Dopplungen** an Host-Grenzen (siehe Kommentar in `journey.ts`):

- `stepsForTemplate` (catalog-repository) vs. `stepsForJourneyTemplate` (visit-context) — kein Shared-Monolith

## Bewusste Grenzen

Keine Authentifizierung, keine Rollen, keine PVS-Anbindung, kein produktiver Migrationsverlauf, keine echten Patientendaten.

Reserviert für später: `requiresReceptionConfirmation` (Schließanlage/Gate), kein Template-Versioning.
