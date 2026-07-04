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
- [ ] TV: verbleibende Legacy-Tickets ohne Visit-Zeile weiter aus `listQueue` (ohne `explainVisibility`)
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
- [ ] MFA-UI auf Visit-Modell
- [ ] OpenAPI Breaking + Codegen
- [ ] `tickets`/`queue_entries` entfernen

## Bewusst nicht hier

- Produktions-Deploy, Docker-Release, Manager-Installer
