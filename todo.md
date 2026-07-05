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
- [ ] Manuell: MFA DnD aktiv → WZ, TV zeigt Nummer wieder, Raum-Panel leert Spalte (return_to_waiting)

## Phase A — Display-Cutover (2026-07-04)

- [x] `listQueue()` liefert nur Visit-Zeilen (`listVisitQueueRows`)
- [x] TV-Snapshot: kein Legacy-Loop / `mapLegacyTicketToTvItem`
- [x] Raum-Panel-Snapshot: kein Legacy-Loop über `listQueue()`
- [x] Toten Check-in-Pfad `createTicketInDb` / `buildCreateTicketInput` entfernt

**Offen (Phase B):** Schema-Drop `tickets`/`queue_entries`, absent/recall, Portal, OpenAPI

## Design: return_to_waiting (2026-07-04)

**Entscheidung: Option A** — neue Core-Transition `return_to_waiting` (nicht Redirect, nicht Host-Patch).

**Begründung:** Redirect würde Journey `abandoned` setzen und `allowRedirect` erfordern; außerdem bleibt `lastKnownLocationId` am Raum → TV unsichtbar. Host-Patch würde Invarianten duplizieren. Neue Action: von `called|arrived|in_progress` → `waiting`, löscht `targetLocationId` + Call-Timestamps, setzt `lastKnownLocationId` auf RoutingRule-Home (`pf_waiting`), Journey bleibt `active`.

**Bewusste Invarianten (nicht ändern ohne Rücksprache):**
- **Journey bei Recall:** Patient springt aus dem Aufruf-Zyklus, nicht aus der Route — kein `journey_abandoned`
- **`absent_*`:** kein Visit-Status — weiter nur `returnToWaitingInDb` (Legacy ohne Visit-Zeile)
- **Recall-Notify:** bei `return_to_waiting` nicht clearen — wie bisheriges Legacy, anders als `recallTicket`

**TV nach Recall:** `explainVisibility` auf `pf_waiting_tv` braucht `lastKnownLocationId === pf_waiting` (Surface-Standort) + passende DisplayRule; Status `waiting` ist typisches Ergebnis, nicht pauschal Voraussetzung.

**Tests:** Core + App automatisiert (Bridge, Legacy absent_*, Recall-Notify, TV/Panel-Snapshots). Manuell MFA-DnD offen.
- [x] Transitions: `checkInRoom`/`checkOutRoom`/`reassignRoom` → Visit-Bridge (`arrive`/`done`)
- [x] Tests: Visit call → arrive → done + scoped Raum-Panel (409 bei falschem Raum)
- [x] Catalog-Sync: nur konfigurierbare `ops_settings.topics` (kein System-Topic)
- [x] Hilfe-Button: Pressed-State + `needsAssistance` (kein Lane-M-Sofort-Ticket mehr)
- [x] Flow-Core-Kommentare: kein „System-Topic“ — Hilfe via `mfaAssist`/`needsAssistance`, PoC-Seed nur intern
- [x] TV: Legacy-Append aus listQueue entfernt (Phase A Display-Cutover)
- [x] Raum-Panel: Legacy-Append entfernt (Phase A Display-Cutover)
- [x] listQueue() visit-only (Phase A Display-Cutover)
- [x] Raum-Panel: Queue-Snapshot mit `explainVisibility` (`pf_panel_*`), Status `called`/`in_room` aus Visits
- [x] Fix: SSE-Verbindungs-Leak (Browser-Connection-Pool voll → Reassign hängt auf „Wird zugewiesen…“)
- [x] Fix: Raum-Panel `?room=` vs. Session-Cookie — falsches Panel bei URL-Wechsel / alter Session

## Design: Terminal-Hilfe-Button (2026-07-04)

**Zielbild:** Pressed-State (ephemeral, Host) → direkt Topic-Auswahl → Check-in mit `needsAssistance: true`.

**Entscheidungen (User):**
- Timeout **10 s** (`TERMINAL_ASSIST_PENDING_TIMEOUT_MS`)
- MFA: **blaues Banner** wie Notfall (`TerminalAssistAlert` + Queue-SSE `assistPending[]`)
- Legacy **`POST /mfa-assist`**: Cutover → gleiche Antwort wie `assist/press` (`TerminalAssistPressed`)
- Terminal: Hilfe-Press → **bleibt auf Startseite**, dann normale Auth (phone/name/egk) → Topic; `needsAssistance` serverseitig bei active press; kein `authPath`-Fake mehr

**Storage:** A1 — `terminal_assist_pending` (DB) + TTL-Scheduler

**Implementiert:**
- [x] Host: `terminal_assist_pending` + 10s TTL-Scheduler
- [x] API: `assist/press|release|pending` + Check-in setzt `needsAssistance` bei active press
- [x] Bridge/Snapshot/OpenAPI: `needsAssistance` + `assistPending`
- [x] Terminal UI: Press → Topic + Empfang-Hinweis
- [x] MFA UI: blaues Banner + `Users`-Symbol auf QueueEntry
- [x] Tests (278 app + core)
- [x] Legacy `createMfaAssistTicket` entfernt; `/mfa-assist` → press cutover

- [ ] Hilfe-Button Legacy-Ticket abgehakt (oben)


- [x] Spike: `createRuntime` hinter Dev-Endpoints in `app`
- [x] Catalog-Sync: `ops_settings` → Topics/Locations/Queues/RoutingRules (Haupt-DB)
- [x] Schema: `visits` + Catalog-Tabellen parallel zu `tickets` (additive, `ensureFlowCoreSchema`)
- [x] Check-in schreibt Visit statt Ticket
- [x] Transitions: restliche PF-API → `runtime.transition` (call, arrive, done, reassign)
- [x] Transitions: `return_to_waiting` für Visits (Core-Action `return_to_waiting`, Journey bleibt aktiv)
- [x] TV-Snapshot mit Surface-Visibility (`buildTvQueueSnapshot` + `explainVisibility`)
- [x] Raum-Panel: Queue-Snapshot mit Surface-Visibility (`buildRoomPanelQueueSnapshot` + `explainVisibility`)
- [x] MFA-UI auf Visit-Modell (Naming visitId, Phase B4)
- [x] OpenAPI Breaking + Codegen (ticketId → visitId, Phase B4)
- [x] `tickets`/`queue_entries` entfernen (Phase B3)

## Phase B3 — Legacy-Schema entfernen (2026-07-05)

Schema-Cutover: Tabellen `tickets` / `queue_entries` und Legacy-*InDb-Schicht entfernt. Öffentliche ID bleibt `visits.id` (= bisherige Ticket-ID).

- [x] `database.ts` — nur Visit-Pfade (`requireVisitExistsInDb`, keine `*InDb`-Fallbacks)
- [x] `database-queue.ts` gelöscht (+ 7 Legacy-Testdateien)
- [x] `database-statements.ts` — Ticket/Queue-Statements entfernt, Visit-Day-Stats
- [x] Day-Reset / Runtime-Reset auf Visit-Counts (`countAllVisitsStmt`); Visits via `clearFlowCoreVisitRuntime`
- [x] `ensureVisitLegacyDropSchema` — DROP `queue_entries`, `tickets` (Runtime-Migration)
- [x] `001_baseline.sql` — keine tickets/queue_entries; portal mit `visit_id`
- [x] `visit-portal-schema` — FK auf visits für frische Baseline
- [x] CheckinSessionDeps ohne insertTicket/insertQueueEntry/getNextTicketNumber
- [x] Recall-Scheduler nur Visit-Pfad
- [x] Tests: `visit-legacy-drop-schema.test.ts`, Day-Lifecycle Visit-Counts; **270 app tests grün**
- [x] Grep-Guard: kein `FROM tickets` / `INTO tickets` / `queue_entries` im App-Code (außer Drop/Migration/Kommentare)
- [ ] Manuell: Check-in → MFA Call → Done; Mark away + Recall; Portal Upload; Day-Reset

## Phase B4 — OpenAPI, Naming & Docs (2026-07-05)

Breaking API rename: `ticketId` → `visitId`, Pfade `{ticket}` → `{visitId}`. Kein Schema-Change, gleiche ID-Werte (`visits.id`).

- [x] OpenAPI: `openapi/*.yaml` — Queue, Check-in, Identity, Documents, Ops, common (`ticketCode` Display bleibt)
- [x] Codegen: `npm run generate:api` (Fastify-Schemas, app/ui generated types)
- [x] App-Routes: `:visitId`, Responses `visitId`; route-access-rules + Tests
- [x] DB/Outbox: `QueueStatusChanged`/`CheckinCreated` Payload `visitId`; Public-API-Parameter `visitId`
- [x] UI: queue/mfa/portal/terminal auf generierte Types (`visitId`, `VisitCreated`, Ops `openVisits`/`resetVisitCount`)
- [x] Docs: `architecture.md`, `events.md`, `flows.md`, `plan-room-panel.md`
- [x] Kleinkram: `events.md` Emitter `flow-core-checkin.ts`; Test-Mocks `visitId`; `DocumentExportInfo`/`PatientSession` in Tests
- [x] App-Tests: **270 grün**
- [x] UI Queue-Tests: **38 grün** (`src/lib/queue/`)
- [x] `npm run check:drift` — Codegen/Bundle/Schemas OK (nach Stage der generierten Dateien)
- [ ] `check-openapi-route-sync` — dev flow-core-Routes fehlen in OpenAPI (vorbestehend)
- [ ] UI typecheck grün (4 fehlende i18n-Keys + TerminalAuthPath — vorbestehend, nicht B4)
- [ ] Manuell: Smoke optional (`smoke:openapi-contract`, `smoke:doc-flow`)

**Breaking (PR):** API fields `ticketId` → `visitId`; paths `/queue/{ticket}/…` → `/queue/{visitId}/…`. Event payloads analog. Werte unverändert.

**Bewusst belassen:** `TICKET_NOT_FOUND` Error-Code; interne DB-Methoden `callTicket`, `listDocumentsForTicket`; User-facing „Ticket“-Texte (Wartenummer).

## Phase B1 — Host Queue-Metadaten an Visits (2026-07-05)

- [x] Schema `visit_host_state` (+ FK CASCADE) in `ensureFlowCoreSchema`
- [x] DB-Layer `visit-host-state.ts` (upsert, recall, summary, expired windows)
- [x] Check-in schreibt `checkin_phone` / `checkin_locale` in Host-State
- [x] `visitToQueueTicketRow` / `listVisitQueueRows` Batch-Enrichment (Host-State + Document-Count)
- [x] `database.ts`-Bridges: setAbsence, recallTicket, callback, triage, identityRef, getQueueSummary, returnToWaiting (+ absent clear)
- [x] Recall-Scheduler: Visit-Pfad via `listExpiredVisitRecallWindows` + `processExpiredRecallWindowForVisit`
- [x] Mark-Absence-Lookup auf Visits + Host-State (findByCode, listAbsenceLookup, checkinPhone-Match)
- [x] Tests: `visit-host-state.test.ts`, `visit-queue-bridge.test.ts` erweitert (289 app tests grün)
- [x] Fix: call/arrive/reassign blockiert bei `absent_mode`-Overlay (Legacy-Parity)
- [ ] Manuell: Check-in → MFA Phone; Mark away; Recall + Fenster; return_to_waiting DnD

**Design (festgehalten):**
- `absent_*` = Host-Overlay (`absent_mode`), Core-Status bleibt waiting/called
- `return_to_waiting` / abgelaufenes Recall-Fenster: `absent_mode` clearen, Recall-Notify **nicht** clearen
- `recallTicket`: `absent_mode=return_later`, `return_until`, Callback clearen, Notify-State clearen (wie Legacy)
- `setIdentityRef`: Host `identity_ref_override` (Core `patientDisplayName` unverändert)
- Document-Count: `documents.ticket_id = visit.id` (Phase B2: FK-Migration)

## Phase B2 — Portal/Dokumente auf visit_id (2026-07-05)

End-to-end Visit-Patienten: Portal-Code → Session → Dokument-Upload; Identity + Document-Count über visits FK.

- [x] Migration `ticket_id` → `visit_id` (patient_sessions, documents) via `ensureVisitPortalSchema`
- [x] Statements: Portal-Context, Identity-View, Sessions, Documents auf visits + visit_host_state
- [x] Check-in-Sessions: Visit-Status-Block (done/cancelled/no_show), visit_id in Sessions
- [x] Documents: FK visits, `listDocumentsForTicket` via `visitExists`
- [x] `countPendingDocumentsByVisitIds` auf `documents.visit_id`
- [x] Tests: `database-visit-portal.test.ts` (Migration, Portal, Docs, Identity absent)
- [ ] Manuell: Terminal Check-in → Portal Code → Upload; MFA Document-Badge + Preview

**API:** Responses nutzen `visitId` (= visit.id) seit B4.

**Out of scope:** Core-Package


## Bewusst nicht hier

- Produktions-Deploy, Docker-Release, Manager-Installer
