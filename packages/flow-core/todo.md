# Flow Core — Handover

## Erledigt (Baseline)

- [x] Transaktionen, atomare Queue-Nummern, WAL
- [x] Admin-Validierung (Rules, JourneyTemplates, SurfaceDisplayRules)
- [x] Journey-Autopilot, Redirect-Semantik, Escort
- [x] Surface-Visibility mit Konfliktauflösung
- [x] Journey-Guard (Template-Lock bei offenen Visits)
- [x] `journey_state`, Events mit `correlationId`
- [x] Datenmodell bereinigt (`visit_topics` ohne queue/target)
- [x] 111 Tests grün
- [x] Dump-Export-Skript entfernt
- [x] README für Übernahme geschrieben
- [x] Entscheidung: `src/public/` bleibt Referenz/Cherry-Pick, geht nicht ins Host-Projekt

## Offen für Übernahme

- [x] Terminal-Hilfe: `mfaAssist` (Hilfe-Button) vs `needsAssistance` (MFA-Markierung) getrennt; kein assist_queue-Overlay
- [x] Lane-Fix (`lane_day`, `A-017`, `M-042`) — Infekt `I`, Impfung `X`
- [x] Review-Follow-ups: README Lane/Integration, Tests (shared Lane A, mfa redirect, counter rollback), UI-Copy, CSS-Breite
- [x] Visit-Status-Sets kanonisch (`ACTIVE` / `OPEN` / `TERMINAL`, Runtime-SQL ohne Inline-Listen)
- [x] Escort-Remap zentralisiert (`applyEscortPolicyToMovementMode` in shared/escort.ts)
- [x] Cleanup: deprecated `findSurfaceDisplayRule`, escort Re-Exports, SSOT-Lücken, Test-Merge
- [x] PoC-Naming bereinigen (`routing-core-poc` → `flow-core`, DB `flow-core.sqlite`; UI-Titel in public nur Referenz)
- [x] Visit-ID = Ticket-ID (`formatVisitId`, `parseVisitId`)
- [x] `authPath` auf Visit (getrennt von `checkInPath`)
- [x] `topic-guard.ts` + `saveTopic` API
- [x] Scoped transitions: `actingLocationId`, `call` mit `targetLocationId`, Raum-Panel-`done` ab `arrived`
- [x] `HANDOVER.md` — Integrations-Entscheidungen und Merge-Checkliste
- [x] Host-Projekt: shared-Module als Package oder Subtree — `@praxis-flow/flow-core`, Branch `feat/typescript-package`
- [x] TS Phase 0 (Branch `feat/typescript-package`): tsconfig, `@praxis-flow/flow-core`, build/typecheck
- [x] TS Phase 1: `src/shared/` → TypeScript, Server/Public/Tests auf `@praxis-flow/flow-core`, `/shared/*.js` aus `dist/`
- [x] TS Phase 2: `src/server/` → TypeScript, Unit-Tests → `.test.ts`, PoC-HTTP → `dist/server/http.js`
- [x] TS Phase 3: Integration-Tests → `.test.ts`, Barrel-Exports + `package.json` `main`/`types`/`files`
- [x] README + HANDOVER auf TypeScript/Package-Stand aktualisiert
- [x] Veraltete `.mjs`-Verweise in Kommentaren/Docs bereinigt (`types.ts`, `journey-admin.js`, `HANDOVER.md`, `todo.md`)
- [x] `runtime.ts` aufgeteilt (open-db, seed, catalog/visit-repository, visit/admin-service, Composition Root)
- [x] `npm run dump` wiederhergestellt — 11 Dateien Runtime-Refactoring in `dump.txt`
- [ ] Host-Projekt: PoC-Runtime → DB-Adapter + API-Schicht
- [ ] Host-Projekt: Schema-Migration
- [ ] Migrations-Readiness (2026-07-04): Puzzle-Analyse PF ↔ Core — siehe Chat; SSR kein Blocker (PF `ssr:false`); Hürden: Surfaces/TV-Filter, Status-Mapping, Catalog-Sync, Room-Panel-Transitions
- [ ] Host-Projekt: UI-Muster aus `public/` cherry-picken (journey-admin, redirect, surface-preview)
- [ ] Auth, Rollen, PVS-Anbindung (bewusst out of scope hier)

## Bewusst später

- `requiresReceptionConfirmation` — Schließanlage/Gate
- Template-Versioning / Snapshot bei laufenden Visits
- `manual` advance (entfernt, nicht unterstützt)
