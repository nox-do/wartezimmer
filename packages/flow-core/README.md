# Flow Core

Kernmodell für Praxisdurchläufe — Visit-Routing, Queues, Surfaces und Journey-Templates.

Dieses Repo ist der **extrahierte Kern** für die Übernahme in die Praxissoftware. Siehe **`HANDOVER.md`** für Integrations-Entscheidungen und Merge-Checkliste.

**Package:** `@praxis-flow/flow-core` (TypeScript, Build nach `dist/`)

## Domain-Modell

| Begriff | Rolle |
|---|---|
| **Visit** | Operative Wahrheit eines heutigen Praxisdurchlaufs |
| **Location** | Physischer Ort oder Station (Wartezimmer ist eine normale Location) |
| **Queue** | Geordnete Bearbeitungsliste (Warteliste, Laborliste, …) |
| **Surface** | Anzeige oder Bedienoberfläche (Terminal, WZ-TV, Labor-Panel, …) |
| **Topic** | Anliegen aus dem Check-in |
| **RoutingRule** | Policy + Auswahl (Topic, Terminals, Escort, Redirect); Route entweder `single_step` oder vollständig aus **JourneyTemplate** |
| **JourneyTemplate** | Vordefinierte Mehrschritt-Route; ersetzt ab Check-in die operative Route |

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

| Feld | Bedeutung |
|---|---|
| `queueNumber` | Formatiert, z. B. `A-017` — **nicht** numerisch parsen |
| `queueLaneCode` | Snapshot Nummernkreis (A–Z) |
| `queueSequence` | Laufnummer im Lane-Tag |
| `queueNumberDate` | Geschäftstag (PoC: Kalendertag) |
| `queueNumberScope` | immer `lane_day` |
| `needsAssistance` | MFA-Markierung — **kein** Routing/Escort/Lane-Effekt |
| `checkInPath` | `topic` (Standard) oder `mfa_assist` (Hilfe-Button) |
| `authPath` | `phone_dob`, `name_dob`, `egk`, `mfa_assist` — Terminal-Anmeldeweg |
| `id` (Visit) | `formatVisitId(businessDay, laneCode, sequence)` → `20260602-A-017` |

**Wichtig für Adapter:** Ticket-Anzeige und Sortierung über `queueLaneCode` + `queueSequence` (oder `parseTicketCode(queueNumber)`). `visit.topic.laneCode` ist Live-Katalog und kann vom Snapshot abweichen.

## Projektstruktur

```text
db/schema.sql              — SQLite-Schema (Source of Truth)
src/shared/                — portable Domain-Logik (TypeScript → dist/shared/)
  types.ts                 — Typen und Enums
  journey.ts               — Journey-Autopilot (Patches, Advance)
  visit-flow.ts            — erlaubte Statusübergänge
  redirect-flow.ts         — Redirect-Semantik
  surface-visibility.ts    — Sichtbarkeit auf Surfaces
  routing-scope.ts         — Rule-Auswahl pro Terminal/Topic
  admin-validation.ts      — Config-Invarianten
  labels.ts                — deutsche UI-Labels
src/server/                — Referenz-Runtime (TypeScript → dist/server/)
  runtime.ts               — Composition Root (createRuntime)
  visit-service.ts         — Check-in, Transition, Redirect
  catalog-repository.ts    — Katalog aus SQLite
  visit-repository.ts      — Visits + Events
  admin-service.ts         — Rules, Templates, Topics
  seed-data.ts             — Demo-Szenarien
  http.ts                  — PoC-HTTP-API + Static Server
src/index.ts               — @praxis-flow/flow-core (shared barrel)
src/public/                — Referenz-UI (nur hier, nicht übernehmen)
  app.js                   — API-Nutzung, Redirect-Felder, Surface-Preview
  journey-admin.js         — mountbare Journey-Admin-Komponente (Cherry-Pick)
test/                      — Unit + Integration (111 Tests, .test.ts)
canvases/                  — Architektur-Visualisierung (optional)
dist/                      — Build-Ausgabe (gitignored)
```

### Package-Exports

| Import | Inhalt |
|---|---|
| `@praxis-flow/flow-core` | Shared Domain (Types, Validierung, Journey, Visit-Flow, …) |
| `@praxis-flow/flow-core/server` | Runtime (`createRuntime`, `openDb`, Repositories, Services) |

## Referenz-UI (`src/public/`) — nicht übernehmen

Bleibt in diesem Repo zum **lokalen Durchspielen** und als **Cherry-Pick-Quelle** für das Host-Projekt. Die Produkt-UI lebt woanders; hier nachschauen, was sinnvoll ist, einzeln übernehmen.

| Datei | Cherry-Pick-Kandidaten |
|---|---|
| `app.js` | API-Aufrufe, Redirect-Formularfelder, Surface-Visibility mit `explainVisibility`, Visit-Chips/Labels |
| `journey-admin.js` | Mount-Pattern für Journey-Templates (`mountJourneyAdmin`, `updateCatalog`) |
| `index.html` / `styles.css` | Layout-Ideen — nur als Referenz, nicht 1:1 kopieren |

Lokal starten: `npm run dev` → `http://127.0.0.1:3001`. Shared-Module werden unter `/shared/*.js` aus `dist/shared/` ausgeliefert.

## Start

```bash
npm install
npm run build      # TypeScript → dist/
npm run reset-db   # Schema + Seed neu aufbauen
npm run dev        # http://127.0.0.1:3001
npm test           # build + 111 Tests
npm run typecheck  # tsc ohne Emit
```

## API (Referenz-Runtime)

| Methode | Pfad | Beschreibung |
|---|---|---|
| GET | `/api/catalog` | Locations, Queues, Surfaces, Topics, Rules, Templates |
| GET | `/api/visits` | Alle Visits (angereichert) |
| GET | `/api/visits/:id/events` | Event-Historie |
| POST | `/api/check-in` | Patient + Visit anlegen, Routing anwenden |
| POST | `/api/visits/:id/call\|arrive\|start\|done` | Statusübergang (Body optional: `targetLocationId`, `actingLocationId`) |
| POST | `/api/visits/:id/redirect` | Operative Umleitung |
| PUT | `/api/routing-rules/:id` | RoutingRule speichern (validiert) |
| PUT | `/api/journey-templates/:id` | JourneyTemplate speichern (Lock-Guard) |
| PUT | `/api/topics/:id` | Topic speichern (Lock-Guard) |

## Seed-Szenarien (nach `reset-db`)

- **Allgemein** — Terminal → WZ → Empfang → Raum (`journey_general`)
- **Blutabnahme** — direkt Labor, Aufruf nur über Labor-Panel
- **Impfung** — direkt Impfraum, nicht im WZ-TV
- **Redirect** — MFA kann operative Wahrheit ändern
- **Begleitung** — `escortPolicy` aus Rule; `needsAssistance` ist reine MFA-Markierung ohne Routing-Effekt
- **Terminal-Hilfe** — Hilfe-Button (`mfaAssist`) → System-Topic `mfa` + `checkInPath: mfa_assist`; Checkbox `needsAssistance` nur additiv zum gewählten Thema

## Integration ins Host-Projekt

**Als Package einbinden** (nach `npm run build` bzw. als Workspace-Package im Monorepo):

```typescript
import {
  assertTransitionAllowed,
  ruleForTopicAtSurface,
  formatVisitId,
  type Visit,
  type RoutingRuleDraft,
} from '@praxis-flow/flow-core';

import { createRuntime, openDb } from '@praxis-flow/flow-core/server';
```

Shared-Module (Domain, ohne DB) — vollständige Liste siehe `src/index.ts`.

**An Host-Grenze anbinden** (Adapter nötig):

- `createRuntime` / Services → eigener DB-Layer (Postgres), Auth, Event-Bus
- `schema.sql` → Migration in Host-DB (**PoC: nur `npm run reset-db`, kein ALTER-Skript**)
- `resolveBusinessDay()` → Host injiziert Praxis-Tagesgrenze via `createRuntime(db, { resolveBusinessDay })` (Default: UTC-Kalendertag)

**Praxis-Flow-Mapping (Check-in / Ticket):**

| Flow Core | Praxis Flow | Anmerkung |
|---|---|---|
| `checkInPath: 'topic'` | Routing-Kontext Standard-Themen-Check-in | |
| `checkInPath: 'mfa_assist'` | Routing-Kontext Hilfe-Button | |
| `authPath` | `phone_dob`, `name_dob`, `egk`, `mfa_assist` | Terminal-Identifikation |
| `id` / Visit-ID | `formatVisitId(...)` | wie PF Ticket-ID |
| `queueLaneCode` + `queueSequence` | `laneCode` + `number` | strukturiert bevorzugen |
| `queueNumber` | `formatTicketCode(...)` | `A-017`; Legacy-Consumer nicht als Zahl parsen |
| `needsAssistance` | *(neu in PF)* | reine MFA-Markierung, additiv zum Topic |

**Ticket-Format:** wie PF — `formatTicketCode` mit `padStart(3)` bis 999, danach variable Breite; `parseTicketCode` akzeptiert 1–4 Ziffern und optionalen Bindestrich.

**Nicht übernehmen** — nur Cherry-Pick aus `src/public/`:

- Admin-UI, Dashboard, Journey-Editor → Muster in `journey-admin.js` / `app.js` nachbauen

**Bewusste Dopplungen** an Host-Grenzen (siehe Kommentar in `journey.ts`):

- `stepsForTemplate` (catalog-repository) vs. `stepsForJourneyTemplate` (visit-context) — kein Shared-Monolith

## Bewusste Grenzen

Keine Authentifizierung, keine Rollen, keine PVS-Anbindung, kein Docker, kein produktiver Migrationsverlauf, keine echten Patientendaten.

Reserviert für später: `requiresReceptionConfirmation` (Schließanlage/Gate), kein Template-Versioning.

SQLite liegt lokal unter `db/flow-core.sqlite`.

## Architektur-Visualisierung

Optional: `canvases/routing-core-model.canvas.tsx` — Datenmodell mit Runtime-Guards als interaktives Diagramm (Cursor Canvas).
