# praxis_flow_merge — Todo

**Zweck:** Isolierte Arbeitskopie für Core-Integration. Original `../praxis_flow` bleibt unangetastet.

**Quellen:**
- Basis: Kopie von `praxis_flow` (2026-07-04)
- Core: `packages/flow-core` aus `new_flow_core` (`feat/typescript-package`)

## Setup

- [x] Arbeitskopie `praxis_flow_merge` angelegt (ohne `node_modules`, ohne `.git`)
- [x] `packages/flow-core` eingebunden, Workspace in `package.json`
- [x] `npm install` + `npm run build:flow-core` + `npm -w @praxis-flow/flow-core test`
- [x] Eigenes Git-Repo initialisiert
- [x] Spike 1: `createRuntime` + Catalog-Sync + Dev-Endpoints (`/api/v1/dev/flow-core/*`)
- [ ] Spike 1 manuell: MFA-Login → `POST /api/v1/dev/flow-core/sync-catalog` → `GET .../catalog`
- [x] Spike 2: `POST /api/v1/dev/flow-core/check-in` via `runtime.checkIn()` (Visit-ID + `terminalInstruction`)
- [x] Spike 2: `GET /api/v1/dev/flow-core/tv-snapshot` mit `explainVisibility`
- [x] Spike 3: `POST /api/v1/dev/flow-core/visits/:visitId/:action` (call/arrive/start/done)
- [x] Cutover: Flow-Core-Schema in Haupt-DB (`ensureFlowCoreSchema` beim Start)
- [x] Cutover: Catalog-Sync bei App-Start + Settings-Update
- [x] Cutover: Terminal-Check-in → `runtime.checkIn()` (Visit statt Ticket)
- [x] Cutover: MFA-Queue liest Visits + `callTicket` → `runtime.transition`
- [x] Smoke-Endpoint entfernt (nicht mehr nötig)
- [ ] Manuell: Terminal-Anmeldung → MFA-Aufruf → Raum-Panel eintreten/fertig auf Visit-Basis
- [x] Transitions: `checkInRoom`/`checkOutRoom`/`reassignRoom` → Visit-Bridge (`arrive`/`done`)
- [x] Tests: Visit call → arrive → done + scoped Raum-Panel (409 bei falschem Raum)
- [x] Catalog-Sync: nur konfigurierbare `ops_settings.topics` (kein synthetisches System-Topic)
- [ ] Bridge: Hilfe-Button (`/checkins/mfa-assist`) noch Legacy-Ticket bis `needsAssistance`-Flag am Terminal
- [x] Fix: SSE-Verbindungs-Leak (Browser-Connection-Pool voll → Reassign hängt auf „Wird zugewiesen…“)
- [x] Fix: Raum-Panel `?room=` vs. Session-Cookie — falsches Panel bei URL-Wechsel / alter Session

## Integration (Reihenfolge)

- [x] Spike: `createRuntime` hinter Dev-Endpoints in `app`
- [x] Catalog-Sync: `ops_settings` → Topics/Locations/Queues/RoutingRules (Haupt-DB)
- [x] Schema: `visits` + Catalog-Tabellen parallel zu `tickets` (additive, `ensureFlowCoreSchema`)
- [x] Check-in schreibt Visit statt Ticket
- [x] Transitions: restliche PF-API → `runtime.transition` (call, arrive, done, reassign)
- [ ] Transitions: `return_to_waiting` für Visits (Core hat kein Äquivalent — blockiert)
- [ ] TV-Snapshot mit Surface-Visibility
- [ ] Raum-Panel: Status-Mapping (`in_room` → `arrived`/`in_progress`) — Queue-Liste nutzt gemapptes `in_room` + `roomId`
- [ ] MFA-UI auf Visit-Modell
- [ ] OpenAPI Breaking + Codegen
- [ ] `tickets`/`queue_entries` entfernen

## Bewusst nicht hier

- Produktions-Deploy, Docker-Release, Manager-Installer
