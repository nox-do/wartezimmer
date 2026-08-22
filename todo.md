# Routing Modes – Arbeitsstand

Stand: 2026-08-22

## UI-Tour — Room Panel Analyse (2026-08-22)

- Inventar + Architektur/Concern-Trennung dokumentiert (Chat); **kein Code geändert**
- Stack: `+page.svelte` Orchestrator (~521 Z.) · Layout dünn · `room-panel.css` (~489 Z.) · `$lib/room-panel/*` (API, Transition, URL, Snapshot-View, Text, Queue-Layout) · Components PinLogin + Preview
- Filigran / Hände weg: URL-Reconcile `$effect` + SSE-Trigger, Dual-Placement Login-Key, Auto-Login pin-frei, Call-Gate (`callAnnouncementReachable`), Snapshot-Actions, Queue-Layout/Pagination (DOM-Messung), Session-Recovery, Relogin-Hotspot
- Bewusst zurückgestellt: `room-panel-session.svelte.ts` (JSDoc wie TV — kein User-Gain ohne Feature/Bugfix)
- Tests: pure Helpers + Stream session-revoked gut; kein Page-Integrationstest für Reconcile
- **Nächster Schritt:** Cleanup-Batches nach Abstimmung (siehe Chat)
- Ticket-Anzeige vereinheitlicht: 3 MFA-Modals + Room Panel → `formatTicketCode` (Domain); Wrapper `formatRoomPanelTicketCode` entfernt

## UI-Tour — MFA Dashboard Analyse (2026-08-21)

- Layout dünn; State in `mfa-*.svelte.ts` + Barrel `mfa-queue-actions` (bereits gesplittet)
- Filigran / Hände weg ohne Anlass: WaitBoard DnD-Sensoren (Actions/Name/Grip), QueueEntry Grip vs Ticket-Supersede vs Name-Edit, hover-gated Actions (`queue-entry-actions-hover` + touch), Capacity-Drop-Disable, Call-Gate
- Hotspots Größe: QueueEntry ~559, WaitBoard ~345 (Away-Zweig doppelt drag/no-drag), RoomsEditor/DocumentPreview/Settings separat
- Aufräumen nur vorsichtig: Away-Snippet dedupe in WaitBoard ✅; Prop-Drill WaitBoard→Entry; QueueEntry Splits nur mit manueller DnD/Hover/Touch-Checkliste
- Offen Terminal: Topic-Fetch-Guard · Assist stub
- **Nächster Chat:** Room-Panel UI-Analyse (Prompt vorbereitet)

## UI-Tour (2026-08-21)

- Überblick Stack/Architektur/Concern-Trennung (SvelteKit SPA → `app/dist/ui-static`)
- **Terminal Cleanup** (Batch 1):
  - Assist/`needsAssistance`: Stub `terminal-assist.stub.ts` (API/Session/Hints bleiben, Press unverdrahtet)
  - Confirmed: unused Import weg; ein Countdown-Timer schließt
  - EmergencyBar: `emergencyActive` aus Heartbeat/Runtime, kein eigener Poll
  - Ops-Runtime: `terminal-ops-runtime.svelte.ts`; Layout dünn; Pages importieren `terminalOps` (kein Context)
  - Numpad: bewusst nicht angefasst
  - Bugbot-Fixes: EmergencyBar post-raise Heartbeat-Refresh + Release-Sync; Runtime State-Reset on mount/unmount
  - Bugbot Re-Review: keine Findings
  - Topic-Fetch: Unmount-Guard (kein Geister-Toast/Race)
  - CSS/Numpad: Audit — Datei vertretbar (~1k, kaum Totcode); Numpad≠NameDobPad (zwei UX); kein Split/Merge ohne konkreten Anlass
- Offen: Assist-Press UX verdrahten · Numpad/Keyboard nur nach gezielter Duplikat-Prüfung

## Test-Dopplungen Inventur (2026-08-21)

Zweitmeinung bestätigt; Batch bereinigt (001–006 + 008). **007 behalten**.

- **001** flow-core `ticket-code`: nur noch Visit-ID
- **002** UI `terminal-form`: i18n-Mapping-Smoke (+ `tooLong`/`invalidChars`); Domain `too_long` ergänzt
- **003** UI `room-panel-text`: Fallback-Case weg; Preset-Key + Custom-Wiring + Option-Label
- **004** UI `room-default-call-target.test.ts` gelöscht
- **005** UI `room-capacity`: Occupancy auf Adapter-Smoke; App unverändert (war schon Adapter/Errors)
- **006** Validate Empty-Topics entfernt (bleibt in Snapshot-Roundtrip)
- **008** flow-core Unit `topic-guard` gelöscht (Integration bleibt)

Bewusst behalten: supersede, room-panel snapshot, call-room, room-removal, Manager VM/Controller, room-panel-policy, **007** last-name locale.

## Release-Images 2.1.0 neu (2026-07-31)

- Working tree clean — kein Commit nötig
- Version **nicht** erhöht (`2.1.0` ungenutzt); Images + `.tar.gz` + `.pfupdate` neu
- Build: `docker build --no-cache` app+sandbox → `release:images:pack` → `release:pfupdate --no-build`

## CSS Nesting-Diät Settings/Home (2026-07-31)

- `data-surface="settings"` für `/`, `/panels`, `/ops/*` (ohne Setup), `/mfa/settings` — Fullscreen am `.app-main`, kein `:has()`-Punch-through mehr
- Höhen: einmal `100dvh` am Surface; Sidebar/Main über Flex/Grid (`min-height: 0`), kein 3× `100dvh`
- Header: `MfaSettingsPageHeader` → `StaffSettingsShell` (+ `actions`, `density="compact"`); MFA-Header-CSS in `staff.css`
- Relikt: `.panel--clickable :global(strong)` entfernt (Markup nutzt `.panel__text`)

## Home Sidebar (2026-07-30)

- `/` + `/panels`: Sidebar nur 2 Punkte (Schnellzugriffe, Raum-Panels); Cards im Content (neuer Tab)
- Raum-Panels: Chrome-Fullscreen/Startbildschirm-Hinweis für Android-Tablets
- Kacheln: `panel panel--clickable` + Grid; tote `.staff-settings-main .panel + .panel`-Regel entfernt (kaputt im Grid, redundant zu `.panel` margin-bottom)
- Kurze Untertitel (MFA → Dashboard)
- Shared Layout: optional Back, `external` Nav-Links, dynamische `label`, Footer-Meta
- Stack-Version unten links aus `GET /api/v1/ops/health` → `stackVersion` (Docker `PRAXIS_FLOW_STACK_VERSION` via `release:images`)
- Active-Match: `href: '/'` nur exact (kein Prefix auf alle Routen)

## Ops/MFA Settings Sidebar angleichen (2026-07-30)

- Shared `StaffSettingsLayout` + `staff-settings-layout.css`
- Ops: linke Navi mit kurzen Labels (Allgemein, Speicher, Kontakte, SMS, Portal, Sicherheit, Wartung); Langtexte bleiben im Content
- `/ops` → Redirect `/ops/practice`; Hub-Kacheln entfernt; Setup-Reopen unter Wartung
- Footer Ops → MFA Settings; MFA Footer → `/ops/practice`
- Review-Fixes: Setup-Escape (`StaffSettingsShell` Back → Home); tote Hub-i18n/`surface`/`variant`/`staff-page--settings` weg
- Wartung: Setup in eigener Card; Hinweise gebündelt; Reset als Danger-Card; Copy IT-kurz
- Setup Schritt Speicher + Ops „Dateien“: Pfad-Hinweis Manager → Wartung → Import & Export
- Release `2.1.0` Images neu gebaut (`--no-cache`) + `.tar.gz` neu gepackt

## Fix: arrive VisitPatch undefined (2026-07-30)

- Nach VisitPatch-Semantik (kein explizites `undefined`): Arrive setzte `queueId: nextQueueId`, auch wenn `resolveQueueOnArrival` `undefined` liefert (Redirect `queueId: null` + Raum ohne eigene Queue)
- Fix: `queueId` / `lastKnownLocationId` nur setzen wenn definiert — wie bei `call` / `return_to_waiting`

## Praxisname nur in Ops (2026-07-30)

- Manager-Wizard: Praxisname-Feld entfernt; Schritt 2 = nur noch Routing
- SetupPlanInput: `practiceDisplayName` optional (leer statt Default „Hausarztpraxis“)
- Wahrheit: Ops DB / `/ops/setup`; `.env` PRACTICE\_\* nur noch optionaler CLI-Seed

## Ops-Wizard Welcome/Speicher Copy (2026-07-30)

- Welcome: nur Host/.env-Hinweis (ohne Ordner-Liste, ohne „danach hier weiter“, ohne `npm run setup`)
- Ordner-Erklärung (`~/praxis-flow-imports` / exports) nach Schritt 3 Speicher verlagert
- `.env` bleibt nötig für Compose/Manager/Backup — Löschen blockiert Betrieb

## Manager Status-Latenz (2026-07-28)

- Ursache: Runtime-Health probeierte LAN auch ohne laufenden Stack (bis 8 s Timeout)
- Fix: Probes nur bei `compose.running`; Probe-Timeout 2 s; Runtime-UI unabhängig vom Config-Fetch; `GET /api/setup/health` für Setup-Start; Docker-CLI-Timeout 3 s

## Stack-Release 2.1.0 (2026-07-28)

- Stack-Versionierung: **Semver** (statt Kalender `YYYY.MM.P`); erstes Semver-Release nach Major-Änderungen: `2.1.0`
- Build: `docker build --no-cache` app+sandbox, dann `release:images:pack` + `release:pfupdate --no-build`
- Artefakte:
  - `dist/releases/praxis-flow-2.1.0/` — `.tar.gz` + manifest + SHA256 (Erstinstallation)
  - `dist/releases/praxis-flow-update-2.1.0.pfupdate` — Update-Paket (min. Manager `0.2.0`)
- Docs: [`docs/delivery.md`](docs/delivery.md) Beispiel/Empfehlung auf Semver umgestellt
- Manager DMG: `electronLanguages: ["de", "en"]` (Chromium-Locales schrumpfen)
- Offen: Docs/Manager-Config committen?

## LEG-003 Flow-Core PoC cleanup (2026-07-28)

- Entfernt aus `packages/flow-core`: PoC-HTTP (`http.ts`), Referenz-UI (`src/public`), `reset-db`, `scripts`/`dump`, `HANDOVER`, Package-`todo`, `canvases`, Package-`package-lock`, `jsconfig`, `api-errors` (Host hat eigene Map)
- Scripts: nur noch `build` / `typecheck` / `lint` / `test`
- README auf Library-only; Standalone/Referenz → `../new_flow_core`
- eslint/stylelint-Ignores für `public`/`canvases` entfernt
- PoC-Wording in Kommentaren bereinigt; `saveRule`/`saveJourneyTemplate`/`saveTopic` als Legacy markiert
- Check-in-Exklusivität: `assertCheckInCombination` in Shared; SoT an `visit-service.checkIn` (+ Parser delegiert). `labels` bleibt wegen `visit-context`
- Entscheidung: `needsAssistance` bleibt Visit-Flag im Core (Persistenz/Anzeige), **ohne** Escort/Lane/Route-Effekt; Begleitung = `escortPolicy` / Journey. Nicht aus Core herausziehen.

## Flow-Core vs `../new_flow_core` (2026-07-24)

- Quelle: `../new_flow_core` (Stand ~2026-07-04, Import); hier: `packages/flow-core` (**29 Commits voraus**)
- Entscheidung: **Option B** — Voll-Sync Monorepo → `../new_flow_core` (2026-07-24)
- Standalone: Domain-Helfer (`ticket-code` / `lane-code`) **inline** + `TODO(cleanup)`; keine `@praxis-flow/domain`-Dep
- LEG-003: PoC-HTTP/`src/public` aus Monorepo entfernt (2026-07-28)

## Audit Quick Wins (2026-07-23)

- Docs: [`docs/audit-dopplungen-altlasten.md`](docs/audit-dopplungen-altlasten.md) nachgeschärft (Reihenfolge, Effort, Smoke-Helper, Sync-Guards); Link in `docs/README.md`
- LEG-001: `validateTarArchiveEntryPaths` entfernt; Test auf `validateTarArchiveEntries`
- LEG-002: `SaveEnvBackupResult`-Alias entfernt; `save-env-backup.ts` → `SavePfbackupResult`
- DUP-001: `parseTicketCode` + `formatTicketCode` kanonisch in `@praxis-flow/domain`; Flow-Core/App/Smoke re-exportieren
- Offen als Nächstes: DUP-002 (OpenAPI-Orchestrierung); LEG-003 erledigt

## Docs / Produktbeschreibung (2026-07-23)

- [`docs/product.md`](docs/product.md): Produktinfo + Highlights + Markt-Kurzvergleich; Patient-App nur als Abgrenzung
- [`docs/flows.md`](docs/flows.md): Flow 2 auf **Patientenportal** umgestellt (Captive = Praxis-IT/Adapter, nicht unser Screen); Kurzabschnitt **Betrieb — Manager / Proxy / Gateway** ergänzt; Querschnitt-Diagramm und Bezüge angepasst

## Entscheidung: Produktgrenze WLAN / Captive (2026-07-18)

- **Wir stellen nicht her:** Router, APs, Captive-Portal-Hardware, eigenen Captive-Datenpfad
- **Wir liefern:** Portal-UI + Wartenummer-Prüfung + dünne Vendor-Adapter (Outbound-URL / Inbound ja|nein)
- Verwandt (zurückstellen): Plan Gateway Management Hostname/IP

## Aufräumen Etappen (Review 2026-07-21)

### Etappe 1 — Korrektheit + kleine Diät (erledigt 2026-07-21)

- Typecheck Manager grün
- Proxy-Ownership nur bei `proxyServer.enabled`
- Network `show()` Generation gegen stale `fetchSetupNetwork`
- Scanner-Totcode, ungenutztes CSS, `NetworkController.clearError` entfernt

### Etappe 2 — Netzwerk-Ablauf (Review-Fixes 2026-07-21)

- „Einstellungen übernehmen und prüfen“; Probe nur gegen `deviceUrls.appBaseUrl`
- `NetworkOperation` statt busy/probeBusy; `verifyActiveConfiguration(savedUrl)`
- `ProxySettings` + `ProxyRecoveryAction`; IT-freundlichere Texte
- P1: Probe-Reject → `failed` (nicht hängen auf „Prüfe …“)
- P1: Restart/Repair mit `composeRestarted: false` immer Fehler (auch Stack vorher gestoppt)
- P2: Verify-Button bei gestopptem Stack deaktiviert + Hinweis Status starten
- P2: LAN-Kulanz (~5s) nach erstem lokalen Erfolg bei `requireLan: false`
- P2: Wizard-Totcode `testReachability` / `reachabilityProbe*` entfernt
- Copy: Wiederherstellen-Hinweis ohne „Diagnose“

### Etappe 3 — State vereinfachen (offen, Scope 2026-07-21)

Ziel: drei Wahrheiten — `configSnapshot` / `runtimeSnapshot` / `networkDraft` (+ lokales UI: phase/notice/networkSnapshot). Keine Runtime→Config-Kopien.

**Review-Punkt 1 — Shell-Vertrag (erledigt 2026-07-21)**

- Shell: `configSnapshot` / `runtimeSnapshot`; `applyConfigSnapshot` / `applyRuntimeSnapshot`
- Runtime→Config-Merge entfernt; Selektoren in `host-snapshot-selectors.ts`
- Sessions: `NetworkSession` / `MaintenanceSession` nur `{ generation }`
- Maintenance minimal: Init aus config, Live-Compose aus runtime
- Status-Seite liest Config; HealthHeader/MainNav nutzen Runtime bzw. Selektoren
- Nachzug: Full-Refresh Config/Runtime entkoppelt (`allSettled`); Fehler `statusError` vs `runtimeError`; StatusView blankt nicht bei Health-Fehler; `effectiveProxyContainer` — Runtime-`proxyServer: null` schlägt Config
- Tests: Selektoren, Navigation, MainNav-Runtime-Unlock, Partial-Refresh; typecheck grün

**Review-Punkt 2 — Network-State (bereit zum Commit)**

- Draft / Phase / Notice; Controller ohne Config-/Runtime-Kopien
- Hydration: Draft-Baseline, `saveSubmittedDraft` (bleibt nach Env-Write auch bei Restartfehler), Pending-Flush
- Dirty-Split, `discardDraft` + Button „Änderungen verwerfen“, gestoppter Stack → Notice `warning`
- Ein Lifecycle-Effekt; MainNav braucht `configSnapshot`
- Tests inkl. Restartfehler+Hydration; typecheck grün

**Nicht enthalten:** voller Maintenance-Umbau, Wizard-Architektur, Backend-DTOs, Gateway-Migration, `host-state.ts`-Split. Wizard nur Rename/Typen/gemeinsame Draft-Helfer.

### Etappe 4 — Backend + Legacy (offen)

- Gateway-Migration explizit; API bereinigen; `host-state.ts` aufteilen

## Netzwerk-Tab Layout (2026-07-21)

- Expander-Reihenfolge: Host/LAN → Proxy → Erreichbarkeit → Übernehmen → Prüfungen → Erläuterung
- Prüfungen: gateway.\* ausgeblendet; offen bei Fehlern
- Proxy-UI → `NetworkProxyPanel`; View-Model-Subtitles/Defaults
- Accordion-Titel: „Browserzugriff (Port 80)“ (statt Gerätezugriff) — Network + Wizard
- Offen/Refactor: Wizard-Zugang mit NetworkProxyPanel sync; `auditNetworkBindings` gateway-Branch entfernen nach GATEWAY\_\*-Cleanup; `app.port`-Detailtext bei Proxy

## Proxy wiederherstellen (2026-07-21)

- Netzwerk: wenn Proxy enabled aber Container nicht running → Hinweis + Button „Proxy wiederherstellen“
- Backend `repairProxy`: Image sicherstellen + Compose up (auch wenn Stack vorher gestoppt)
- Alternative: Proxy abschalten und übernehmen

## Health-Pills / Ampeln (2026-07-21)

- Ampel App/Sandbox: Compose running + Docker-Health
- Mit Proxy: App = nur Stack; Einstieg (Canonical-Probe) an Proxy-Ampel
  - Proxy rot = Container fehlt; gelb = Proxy up, App dahinter nicht; grün = Einstieg ok
- Ohne Proxy: Einstieg an App-Ampel (gleiche Semantik)
- Lokal/LAN-Pills entfernt
- ClamAV-Pill: rot nur `not started` (Engine); gelb `update failed` / `Signatures missing` / `outdated`; färbt Sandbox-Ampel nicht

## Fix: Manager-Headline bei Proxy/LAN (2026-07-21)

- „Einrichtung unvollständig“ war irreführend bei LAN-Probe-Fail / fehlendem Proxy-Container
- Neu: „Proxy-Server fehlt“ bzw. „LAN nicht erreichbar“
- Header-Kachel Proxy auch wenn Proxy enabled aber Image fehlt (vorher nur mit Image)

## Wizard-Reihenfolge + Zugang-Platzhalter (2026-07-18)

- Neu: 1 Voraussetzungen → 2 Praxis → 3 Import/Export → 4 Netzwerk → 5 Zugang → 6 Vorschau → 7 Abschluss
- Praxis-Basis (Name, Routing, Ordner) vor Netz; Netz basic → komplex
- Schritt 5: Info „Vendor-Auswahl folgt“ — noch kein Dropdown

## Aufräumen WLAN-Grenze — erledigt (2026-07-18)

- Doku: `integrations.md`, `architecture.md`, README; openNDS = Lab (`gateway-captive-portal.md`)
- Manager: Wizard 6 Schritte; Gateway-Draft-Felder weg; Plan/Save `gateway: { enabled: false }`
- Topology **neu**: Portal mit Praxis-IT-Captive (empfohlen) vs. nur Praxis-intern — kein openNDS-Mini-PC
- Release: `images.gateway` optional (Default ohne; Lab `--with-gateway`)
- Offen: Wizard-Schritt „WLAN-Freigabe“ + Vendor-Dropdown — später, neuer State (nicht GatewayPanel)

## Plan: Gateway Management Hostname/IP (2026-07-17)

- Review-Plan: `docs/plan-gateway-management-host.md` — **Zurückgestellt** (Produktgrenze WLAN)
- Noch nicht umgesetzt

## Fix: Gast-WLAN Management-IP host.docker.internal (2026-07-17)

- Legacy `GATEWAY_AUTH_BRIDGE_URL=http://host.docker.internal:9100` wurde als Feldwert geladen → IPv4-Fehler
- Sanitize: nur IPv4 (bzw. 0.0.0.0) in UI; beim Aktivieren ungültige Hostnamen leeren

## Smoke: standalone Proxy (2026-07-17)

- `npm run smoke:proxy` — Caddy-Image + echte `proxy/Caddyfile`, Mock-Upstream Alias `app`
- `--keep` / `--cleanup` zum manuellen Ausprobieren; nicht in `smoke:all` (braucht Docker)

## Chore: Prettier repo-clean (2026-07-17)

- Restliche Format-Warnungen (docs, flow-core, gateway-bridge) mitgezogen; `format:check` + lint grün

## UI: Header-Kachel Proxy-Server (2026-07-17)

- Nur wenn Offline-Image vorhanden und Proxy schon genutzt (enabled und/oder Container)
- Label „Proxy-Server“; keine Roh-Service-Kachel `proxy`

## UI: Proxy Enable erst beim Speichern (2026-07-17)

- Checkbox ändert nur Draft; Start bei „Netzwerk-Einstellungen übernehmen“ + Stack-Neustart
- Vor Compose-Up: Proxy-Image prüfen/pullen; Spinner-Texte für Proxy-Start; Status-Hinweise

## UI: Proxy-Server Label + Netzwerk-Settings (2026-07-17)

- Status: Label „Proxy-Server“ (nicht „Proxy“)
- Netzwerk-Tab: eigener Block „Proxy-Server (optional)“ unter Netzwerk-Einstellungen; Toggle nicht nur im Wizard

## Fix: Manager weißer Screen — gateway-bridge Barrel-Import (2026-07-17)

- Ursache: Renderer (`wizard-state`, `host-network-panels`) importierte `@praxis-flow/server-shared` Barrel → `node:crypto` via pfupdate/pfbackup
- Fix: Subpath `@praxis-flow/server-shared/gateway-bridge` + Export in package.json

## Erledigt: P2c – optionale Release-Verpackung Proxy (2026-07-17)

- `caddy:2.11.4` in `release:images` und `.pfupdate` (docker save); Runtime weiter default off
- pfupdate v1: optional `images.proxy` + Proxy-Templates; alte Pakete ohne Proxy bleiben gültig
- Install/Update setzt `PRAXIS_FLOW_PROXY_IMAGE`; Caddyfile nur wenn fehlend (nie überschreiben)
- Backup/Restore: `PRAXIS_FLOW_PROXY_IMAGE` in `STACK_IMAGE_ENV_KEYS` (aktuelles Image bleibt)
- Größe: ~85 MB Image / ~22 MB `docker save|gzip` (lokal gemessen); dokumentiert in `docs/delivery.md`
- Nachzug: Caddyfile-Rollback bei fehlgeschlagenem Update; `release:images` nutzt Shared-Konstante; Erstinstall-Test für PROXY_IMAGE

## Erledigt: P2b P1-Cutover-Fixes (2026-07-17)

- Apply ohne `proxy`: PROXY\_\* / APP_BIND bleiben erhalten (`writeProxyEnv === false`)
- `PRAXIS_FLOW_PROXY_IMAGE` immer bewahren (nicht im Wire-Payload)
- Apply mit `proxy`: Runtime-Keys überschreibbar; Image bleibt
- Enable: Port-Preflight mit `composePs(..., withProxy: true)` vor Env-Write
- Disable: `composeRemoveServices` ok=false → Abort vor Env-Änderung (apply + saveHostNetwork)

## Erledigt: P2b-Randfälle – Proxy-Env-Validierung + Canonical-Restore (2026-07-17)

- `PROXY_ENABLED=treu` (und andere unbekannte Tokens) → `ProxyConfigError`, kein stilles Disable
- `PROXY_MODE=http` ohne `PROXY_ENABLED=true` → Reject (nicht still als off)
- API-Disable ohne Wire-`canonicalBaseUrl`: Custom-Hostname bekommt wieder `:8080` (nicht nur LAN-IP)

## Erledigt: P2b – Proxy über Network-/Plan-/Apply (2026-07-17)

- Shared: optional `proxy?: ProxyConfigInput` auf Plan/Apply/Network
- Absent → PROXY\_\* unverändert; present → enable/disable inkl. Canonical/Bind
- Manager: Checkbox in Erreichbarkeit + Statuszeilen Zugriff/Proxy
- Kein neuer Endpoint; bestehende Probes; kein TLS / .pfupdate (→ P2c)

## Erledigt: P2a – HTTP-Proxy Runtime (2026-07-17)

Entscheidungen:

- Bootstrap: Proxy-Compose + `proxy/Caddyfile` in DEV/DELIVERY; nested `mkdir`; nicht überschreiben
- Packaged resources: Delivery-Proxy-Dateien mitnehmen (kein Caddy-Image/.pfupdate)
- Apply setzt Canonical atomar aus Host + Proxy-Port (Port 80 weglassen)
- `HostStatus.proxy` immer gesetzt (`off` ist regulärer Zustand)

Umgesetzt:

- Shared: `ProxyMode` / `ProxyStatus`, `HostStatus.proxy`
- `setup/src/proxy.ts` + Tests
- `resolveComposeFiles` zentral (Proxy-/Gateway-Overlays)
- Compose: `APP_BIND_ADDRESS`, Overlays, Caddyfile `:80 → app:8080` (caddy:2.11.4)
- Apply/saveHostNetwork schreibt Proxy-Companion-Keys + Canonical
- Bootstrap + `prepare-packaged-resources.mjs`

Review-Nachzug:

- Ungültige Proxy-Env (unbekannter Modus, enabled+off) → `ProxyConfigError` / 400
- Disable: `compose rm -sf proxy` mit erzwungenem Overlay **vor** Env-Write, dann Up ohne Overlay
- `compose ps --all` für gestoppte Proxy-Container
- Tests: enabled→disabled, unbekannter Modus, gestoppter Proxy, planProxyComposeActions

## Erledigt: Gateway Auth-Bridge an Management-IP (2026-07-15)

- App + Gateway getrennte Hosts: keine `172.17.0.1` / `host.docker.internal`-Defaults mehr
- Manager Schritt 4: Feld **Praxis-/Management-IP des Gateway-PCs** → `GATEWAY_AUTH_BRIDGE_URL` + `GATEWAY_AUTH_BRIDGE_BIND`
- Validierung: Pflicht bei Gateway an; Block wenn Gast-IP / Gast-NIC; Warnung bei `0.0.0.0`
- Shared: `packages/server-shared/src/gateway-bridge.ts`
- Keine Erreichbarkeitsprüfung zum Gateway-PC (kommt meist später) — Hinweis im Wizard/Status, Anpassung unter Netzwerk

## Erledigt: VisitPatch-Semantik vereinheitlicht (2026-07-15)

- `VisitPatch` in flow-core: fehlender Key → preserve, `null` → DB clear, kein `undefined`-Löschsignal
- `updateVisit`: `journeyTemplateId` aus generischem UPDATE entfernt; `staffNote` per Presence-Semantik
- Redirect: Parser/Patch/Events mit Dreiwert-Semantik (`queueId`, `targetLocationId`, `staffNote`)
- Journey-Patches an `VisitPatch` angebunden; Cast in `visit-service` entfernt
- Tests: `visit-repository.test.ts`, `parseRedirectBody`-Presence, Redirect-Fix
- Review-Nachzug: `INVALID_VISIT_PATCH` bei explizitem `undefined`; Journey-Typen wieder fachlich eng; Redirect-E2E preserve/clear; `updateVisit` nicht öffentlich exportiert
- Actor-Vertrag Transitionen: `actorSurfaceId` aus Parser/Service entfernt; `actorId` nur Host-Kontext; Contract-Tests HTTP vs Runtime
- Supersede-Migration: `ensureVisitSupersedeColumns` in `openDb`; nicht mehr in `supersede()`; Migrationstest alte visits-Tabelle
- Check-in SQL → `insertCheckInAggregate`; `visitRecordById` + `toVisitView` im Repository
- Katalog-Snapshot: transition/redirect/cancel/reassign/supersede — ein `loadCatalog()` pro Transaktion, Events aus Patch-Werten
- Actor-Vertrag Redirect: `actorId` aus Body-Typ; `RedirectContext` Host-only; Contract-Tests

## Erledigt: Dockerfile syntax-Zeile entfernt (2026-07-14)

- `app/sandbox/gateway/Dockerfile`: `# syntax=docker/dockerfile:1` entfernt — BuildKit nutzt eingebauten Parser, kein Pull von Docker Hub nötig

## Erledigt: MFA PIN-Modal schließt nach Speichern (2026-07-14)

- `mfa/settings/operations`: Nach erfolgreichem MFA-/Panel-PIN-Wechsel Modal schließen (`resetPinDialog` statt `closePinDialog` während `pinBusyTarget` gesetzt)

## Erledigt: Room-Panel PIN-Hinweis entfernt (2026-07-14)

- `RoomPanelPinLogin.svelte`: Hinweis „Standard-PIN nach Einrichtung: 0000 …“ aus PIN-Dialog entfernt
- `de-DE.ts`: ungenutzter `pinDefaultHint`-Key entfernt

## Erledigt: JourneyTemplateSetting OpenAPI-Kommentare (2026-07-14)

- `topicId` / `active`: Beschreibungen in `openapi/ops.yaml` + `journey-admin-helpers.ts` — kein Legacy/removable mehr; Rolle vs. `journeyTemplateId` dokumentiert

## Erledigt: Legacy-Cleanup Deploy-Nachzügler (2026-07-14)

- Entfernt: `pf_staff_session` Cookie-Clear beim Login (`clearLegacyStaffSessionCookie`, `LEGACY_STAFF_SESSION_COOKIE`); Negativ-Tests bleiben
- Entfernt: `rooms_json.panel` DB-Lese-Guard (nur noch `panels`; alte DB-Zeilen ignorieren `panel`)
- Entfernt: `VITE_PRACTICE_*` aus Compose + Env-Fallbacks (`practice-profile`, `host-state`)
- OpenAPI: Beschreibungen ticket → visit; `RuntimeResetPreviewResponse.visitCount` konsistent (Backend + UI)
- OpenAPI/Schemas neu generiert (`npm run generate:api`)

## Erledigt: Legacy-Cleanup mfa-assist + ungenutzte Aliases (2026-07-14)

- Entfernt: `POST /api/v1/checkins/mfa-assist`, `legacyCutover` aus `TerminalAssistPressed`, ACL-Regel, Legacy-Test
- Entfernt: `BusinessDayTicketStats`, `BusinessDayOpenTicket` (Backend + UI), `MarkAwayTicket` (UI)
- Entfernt: `SETTINGS_EXPORT_ENV_EXCLUDED_KEYS`, `PfbackupValidationResult` aus server-shared
- OpenAPI/Schemas neu generiert (`npm run generate:api`)

## Erledigt: Code-Diät queue-routes Transition-Engine (2026-07-14)

- Extrakt: `app/src/routes/queue/queue-visit-transitions.ts` — Staff Handler-Map + shared `runVisitTransition`
- HTTP-Adapter: `queue-routes.ts` 802→343 Zeilen (nur Registration + Nebenrouten)
- P0: Room-Panel → Policy-Gates + shared `runCallTransition` / `runCheckInRoomTransition` / `runCheckOutRoomTransition` (kein Clone mehr)
- P1: `runQueueMutation` für callback-phone / identity-ref / supersede (`queue/queue-mutations.ts`)
- Tests unverändert, 21/21 grün (`queue-routes.test.ts`)
- Offen/optional: `mark-absence` Error-Pfad vereinheitlichen; Message-Defaults zentralisieren

## Erledigt: Umbau-Hilfstests bereinigt (2026-07-13)

- Gelöscht: `app/.../room-panel-login.test.ts`, `canonicalize-birth-date.test.ts` (Domain-Duplikate)
- Getrimmt: `database-ops-settings` Re-Export-Case; `normalize-last-name` Domain-Charset-Case
- UI: `room-default-call-target.test.ts` nur noch `defaultCallRoom`
- Verschoben: Sandbox-Tests `content-disposition-inline` / `sandbox-log` von `app/` → `sandbox/src/`
- Runde 2: `room-panel-policy.test.ts` nur Session-Resolve; `terminal-input-validation` nur Phone; i18n ohne APP_LOCALES-Tautologie; topic-guard unit+integration behalten

## Code-Diät: Deprecated-Kandidaten (Audit 2026-07-13)

| Kandidat                                                                                                                          | Status       | Evidenz                                                                                                           |
| --------------------------------------------------------------------------------------------------------------------------------- | ------------ | ----------------------------------------------------------------------------------------------------------------- |
| Domain Single-Panel (`RoomPanelSettings`, `DEFAULT_ROOM_PANEL_SETTINGS`, `normalizeRoomPanelSettings`, `applyRoomPanelPlacement`) | **entfernt** | Domain-Cluster + Tests bereinigt; `db-types.ts` Alias entfernt.                                                   |
| `EnvBackupInfo` / `EnvBackupResult`                                                                                               | **entfernt** | Re-Exports aus `setup-api`/`index`/`host-status` entfernt. `SaveEnvBackupResult` ebenfalls entfernt (2026-07-23). |
| `app/src/http/domain-error.ts` Shim                                                                                               | **entfernt** | Imports → `shared/errors/domain-error.js`; Datei gelöscht.                                                        |
| `setup/src/urls.ts` `buildDeviceUrls`                                                                                             | **entfernt** | Tests auf `buildDeviceUrlsFromBaseUrl` umgestellt.                                                                |
| UI `createMfaAssistCheckin`                                                                                                       | **entfernt** | Server `POST /mfa-assist` ebenfalls entfernt (2026-07-14).                                                        |

- **Auth-Routen Überblick:** Staff/Device unter `/api/v1/auth/*` in `app/src/routes/auth-routes.ts` (OpenAPI `openapi/auth.yaml`); Guard via `registerClientAuth` + `route-access-rules.ts`; Cookie-Sessions (kein JWT/OAuth)

## Erledigt: Auth-UI-State Cleanup (2026-07-14)

- UI: `staffAuthSlots` (mfa/ops getrennt) statt globalem `authSession`; `probingAlternateSlot`-Hack entfernt
- `markAuthUnauthorized(role)` slot-scoped; `mfaAuthFetch`/`opsAuthFetch` rufen nur eigenen Slot
- Fetch: `terminalAuthFetch` / `roomPanelAuthFetch`; MFA-/Ops-Wrapper in `staff-auth-fetch.ts`; Slot-State ohne zyklische Runtime-Abhängigkeit
- Typen: `StaffAuthRole` zentral in `session-client.ts`; `AuthSessionUser.role` statt `roles[]`
- Backend: toter Export `getLegacyStaffSessionCookieName()` entfernt (`pf_staff_session`-Clear beim Login bleibt)

## Erledigt: Auth Session-Slots + MFA-Recovery (Phase 1–3, 2026-07-14)

- Cookie-Split: `pf_mfa_session` / `pf_ops_session` (Breaking — `pf_staff_session` wird nicht gelesen, nur gecleart)
- Scoped idempotenter Logout via `X-Client-Role` (Panel produktiv; Pattern generisch für alle Slots)
- Guard: Cookie-Auth braucht `X-Client-Role` wenn Session-Cookies mitgesendet; Bearer + Local-TV-Bypass unverändert
- UI: `mfaAuthFetch` / `opsAuthFetch`; SSE Streams mit `clientRole: mfa`; `loadAuthSession(role)`
- OpenAPI: mfa/ops Session-Schemes; Logout Header + 400; `StaffLoginRequest.role` required
- Smoke: `applyAuthHeaders` setzt `x-client-role` für session/device
- Manuell: MFA-Tab + Room-Panel Logout → MFA bleibt; nach Deploy einmal neu anmelden
- Manuell (2026-07-14): MFA + Ops parallel im gleichen Browser — verifiziert
- Review-Nachzug (2026-07-14): documents.yaml → mfaSessionCookie; identity/checkin/queue/ops OpenAPI (ACL-korrekte Security + X-Client-Role in common.yaml); Guard AUTH_ENABLED=false vor Header-Check; shouldLoadAuthSession für MFA↔Ops-Tabwechsel; openapi-contract-lib x-client-role; Regressionstests (Koexistenz, Panel-Logout, Legacy-Cookie, 400 Header)
- Fix: /auth/me Endlosschleife — shouldLoadAuthSession nicht bei anonymous; Cross-Slot-401 behält andere Session
- Phase 3 (2026-07-14): Hard-Reload entfernt — `handleMfaBackendRecovered` schließt transiente Zustände und remountet nur die aktive MFA-Route; Queue-Revision wird beim Host-Mount zurückgesetzt; Unit-Test `mfa-backend-recovery.test.ts`
- Optional offen: messungsgetriebenes Multi-Tab-SSE-Connection-Budget; Entscheidungsreihenfolge
  und Sicherheitsregeln siehe [`docs/plan-auth-session-slots.md`](docs/plan-auth-session-slots.md#5-optionale-nächste-phase--multi-tab-connection-budget)

- **Fix:** Raum-Expander — `$state.snapshot()`; Basics-Layout kompakter; CSS konsolidiert; Raum-Panel-Leerlauf nutzt konfigurierten Ankunfts-Hinweis statt hardcoded `noTickets`
- Lint/Verify: **grün** (`npm run verify`) — ESLint-Fixes, Test-Fixtures (`minimalHostStatus`, `freshInstallHostStatus`, `testSetupContext`), Auth-Regeln für Snapshot-Routen; 10 Manager-Tests nach Fixture-Konsolidierung korrigiert
- Wizard Abschluss: eine Footer-Zeile mit kleinen Buttons „Zum Status“ + „IT-Einstellungen“ (ohne Abbrechen)
- Wizard Abschluss: Health-Header — Polling läuft auch im Wizard; nach Apply zusätzlich sofortiger Refresh (`onHostMutated`)
- Schritt 3: .env-Hinweis entfernt, Routing-Überschrift kompakt, Intro gekürzt

## Erledigt: Wizard Schritt 2 UX (2026-07-13)

- Schritt 2: zwei Blöcke (Host / Geräte-URL), Gast-WLAN-Hinweis → Schritt 4, Reverse-Proxy → Vorschau Schritt 6

## Erledigt: Manager Wizard-Autostart (2026-07-13)

- Ohne `.env` (`envExists: false`): nach erstem Status-Load → Wizard fullscreen (ohne Tabs), wie vor Svelte-Shell
- Abbruch vom Wizard → Status mit Setup-Entry (kein erneuter Autostart in derselben Session)
- Dev-Hinweis: Repo-Modus mit vorhandener `.env` startet bewusst auf Status

## Release-Test 2026.07.0 (2026-07-13)

- `npm run release:images -- --version 2026.07.0` — OK (~67s)
- Artefakte: `dist/releases/praxis-flow-2026.07.0/` (95 MB `.tar.gz` + manifest + SHA256)
- Images lokal: `praxis-flow/app:2026.07.0`, `praxis-flow/sandbox:2026.07.0`
- Nächster Schritt: Manager → Release-Paket laden → Erstinstallation testen

## Erledigt: Manager weißer Screen (2026-07-13)

- Ursache: Renderer importierte `@praxis-flow/server-shared` Barrel → `node:crypto` in Browser-Kontext → Modul-Ladefehler, Svelte mountet nicht
- Fix: Browser-sichere Subpath-Exports (`env-backup`, `backup-path-labels`, `setup-api`); Label-Helper nach `backup-path-labels.ts` extrahiert

## Erledigt: Docker-Build flow-core (2026-07-13)

- `app/Dockerfile`: `packages/flow-core/tsconfig.base.json` fehlte im COPY — `tsc` fiel auf Default-CompilerOptions zurück (Kaskadenfehler)

## Erledigt: Delivery-Doku konsolidiert (2026-07-13)

- Neu: [`docs/delivery.md`](docs/delivery.md) — Build, Erstinstallation, Update, Versionierung (eine Stelle)
- Entfernt: `docs/release-packaging.md` (Inhalt migriert)
- Bereinigt: `deployment-docker.md` (nur Runtime), `manager/README.md` (kein Build-Duplikat)
- Kaputte Links gefixt: `plan-setup-wizard.md`, `plan-praxis-flow-manager.md` → `delivery.md` / `manager/README.md`

## Erledigt: App-Typecheck-Fixes (2026-07-13)

- `visit-queue-bridge.ts`: fehlender `TriageLevel`-Import
- `settings-snapshot-import.ts`: `panels` via `normalizeRoomPanelsSettings` statt loose cast
- `patient-documents-routes.ts`: `templateVersion` als positive Integer geparst
- `AuthPinTarget`: Single Source in `auth-openapi-types.ts`; App re-exportiert nur noch

## Erledigt: Room-Panel/Domain Cleanup (2026-07-13)

- Device-IDs (`WAITING_ROOM_DEVICE_ID`, `TERMINAL_DEVICE_ID`, `roomPanelDeviceId`) → `packages/domain/src/device-ids.ts`; App/UI re-exporten nur noch
- Domain: `applyRoomPanelPlacement` + `DEFAULT_ROOM_PANEL_SETTINGS` aus Public API (`index.ts`) entfernt — nur noch intern/Test-Import aus `room-panel-settings.ts`
- Room-Panel-Styles: `+layout.svelte` (493→10 Zeilen) → `ui/src/lib/styles/room-panel.css` (wie `tv.css`/`terminal.css`)
- **Offen:** `+page.svelte` Session-Controller-Split (`room-panel-session.svelte.ts`) — bewusst zurückgestellt (kein User-Gain, JSDoc-Trigger)

## Erledigt: Auth OpenAPI vollständig (2026-07-13)

- UI: `session-client.ts`, `device-pairing-client.ts` → `$lib/auth/openapi-types`
- App: `auth-openapi.d.ts` + `auth-openapi-types.ts`; `auth-routes.ts` ohne Hand-Body-Typen

## Erledigt: Auth OpenAPI → UI-Typen (2026-07-13)

- `openapi/auth.yaml` in `generate-openapi-types` + `check-openapi-types-sync` aufgenommen
- `ui/src/lib/auth/openapi-types.ts` + generiertes `auth-openapi.d.ts`
- `room-panel-api.ts`: `RoomPanelRoom` / `RoomPanelRoomsResponse` / `RoomPanelSessionResponse` aus OpenAPI statt Hand-Duplikat
- ~~Offen: `session-client.ts`, `device-pairing-client.ts` (weitere Auth-Duplikate); App-Seite `auth-openapi.d.ts` für Handler-Typen~~

## Erledigt: Room-Panel Snapshot-Doku (2026-07-13)

- Filter-Pipeline in `room-panel-queue-snapshot.ts` kommentiert (Scope → Visibility → row.status)
- `flows.md`: Raum-Panel-PIN vs. MFA/Ops-PIN korrigiert

## Erledigt: Room-Panel Raum-Scope vereinheitlicht (2026-07-13)

- `visitTargetsRoom` prüft nur noch `VisitView.targetLocationId` (Flow-Core-Wahrheit)
- `resolveVisitTargetRoomId`, `RoomPanelCallVisitInput`, `roomPanelCallVisitScopeInput` entfernt
- Snapshot-Items, callCandidates und Transition-Guard nutzen denselben Scope-Helper
- Item-Eligibility weiter über `row.status` (Absent-Overlay); Raum-Scope über `visit`

## Erledigt: Fresh-DB-Settings-Cutover extrahiert (2026-07-12)

- `setup/src/settings-snapshot-db-verify.ts`: `dbSnapshotsEquivalent`, `buildExpectedDbSnapshotAfterImport` (inkl. `skipProviderCredentials`)
- `setup/src/fresh-db-settings-cutover.ts`: `runFreshDbSettingsCutover` — moveDbAside → App-Start → Maintenance → Import → Re-Export-Vergleich → Full Stack → Health
- Restore/Update behalten eigene Vorphasen + Rollback; Cutover liefert nur `{ ok, failedPhase, errors }` bzw. Erfolgs-Metadaten
- Update nutzt `prepareImport`-Hook (Pre-Update-Backup lesen, validieren, ENV mergen) nach Maintenance-Ready
- Tests: 4 Unit-Tests verify + 5 Cutover-Tests; bestehende Restore/Update-Tests unverändert grün (143 setup tests)
- Doku: `.env`-Restore-Vertrag präzisiert (`docs/settings-backup-classification.md`) — Merge statt Blind-Replace
- Manager Restore-Wizard: Credential-Skip-Checkbox auch in Failed-Ansicht; `shouldOfferCredentialSkip` wired; Auto-Vorauswahl bei Credential/PIN-Fehler

## Erledigt: Maintenance-Port für Manager-API (2026-07-12)

- App: zweiter Listener auf `:8082` — Snapshot, Validate, Capabilities, Routing-PATCH nur dort (nicht auf `:8080`)
- `:8080` unverändert für LAN (Terminal/MFA/TV/Ops); `x-praxis-manager-local` + Host-Header-Auth entfernt
- Setup/Backup/Routing-Mode rufen `LOCAL_MAINTENANCE_APP_BASE_URL` (`http://127.0.0.1:8082`) auf
- Compose: `127.0.0.1:8082:8082` (nicht LAN-erreichbar) + `MAINTENANCE_HOST=0.0.0.0` im Container; intra-Compose-Zugriff möglich
- Packaged Manager: `prepare-packaged-resources.mjs` kopiert `docker-compose.delivery.yml` aus Repo-Root

## Type-Cast-Audit (2026-07-12)

- ✅ Bereinigt: `room-panel-transition.ts` (Result.error direkt); `I18nManager.ts` (AppDict statt Doppel-Cast); `Button`/`MfaActionButton` → `resolvedHref()` (ein `as any` in `kit-paths.ts`); `setup/server.ts` + `setup-api-normalize.ts` (unknown an Grenze); `redirect-flow.ts`; `database.ts`/`queue-routes.ts` (`QueueDisplayStatus`/`TriageLevel` statt OpenAPI-Casts); `visit-service.ts` (`JourneyProgressionPatch`); `patient-documents-routes.ts` (Body-Validierung)
- ✅ `flow-core/tsconfig.json`: extends lokales `tsconfig.base.json` mit `"types": ["node"]` — behebt IDE-TS2591 für `node:sqlite` (Root-TS 6.0)
- ⏭️ Bewusst gelassen: SQLite-Row-Mapper; iconv `csv-encoding.ts`; SSE `data as RoomPanelSnapshot`; sessionStorage JSON.parse; Test-Mocks `as unknown as CoreDatabase`

## SQLite Stack — Upgrade-/Backup-Vertrag (2026-07-12)

**Entscheidung:** Keine In-place-Migration wegwerfbarer Runtime-Daten (`patient_sessions`, `documents`, Visits, Queue, Outbox). Langlebig sind nur Settings + Deployment-Kontext. Upgrade = Fresh DB + Settings-Export/Import via Manager-Cutover.

**Nicht zuerst:** gesamte DB-Finding-Liste (Indizes, Enum-Checks, Legacy-Rebuilds, Migrations-Engine).

- ↩️ S2-Rebuild-Patch (atomare Portal-Rebuilds, ~700 Zeilen) **reverted** — falsche Investition für diesen Vertrag
- ⏭️ Bestehende einfache `ensure*`-Funktionen bleiben **Übergang** (Release A), werden **nicht weiter ausgebaut**

### Marker-Rollen (keine Doppel-Systeme)

| Marker                    | Bedeutung                                                                                                            |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `PRAGMA user_version`     | DB-Schema-**Generation** (z. B. `1` = vollständig aus aktuellem Fresh-Schema erzeugt) — **keine** Migrationshistorie |
| `settingsFormatVersion`   | nur im Settings-**Export-Snapshot** (z. B. `1`)                                                                      |
| `app_metadata` (optional) | zur Laufzeit: `schema_generation`, ggf. gespiegelte `settings_format_version` — **nicht** pro Feature                |

### Release-Schnitt

| Release          | Inhalt                                                                               |
| ---------------- | ------------------------------------------------------------------------------------ |
| **A (Übergang)** | Schritte 1–5; einfache `ensure*` bleiben; Settings-Export + Manager-Backup           |
| **B (Cutover)**  | Schritte 6–8 stabil; Fresh DB + Import; historische `ensure*`-Rebuilds **entfernen** |

### Empfohlene Reihenfolge

**1. Langlebige Settings exakt festlegen** — ✅ [`docs/settings-backup-classification.md`](docs/settings-backup-classification.md) (schlank: Klartext-Stack-Backup; nur SMS-Credentials at-rest in DB; Restore optional ohne Provider)

**2. `ops_settings` verbindlich zur Catalog-Wahrheit machen** — ✅ [`docs/catalog-source-of-truth.md`](docs/catalog-source-of-truth.md) · Guard-Test `catalog-write-guard.test.ts` · Resync-Test in `sync-catalog-from-ops-settings.test.ts`

**3. Settings-Export und -Import in der App** — ✅ Kern + Maintenance-HTTP (`GET snapshot`, `POST validate`, `POST import`) · gemeinsame `prepareSettingsSnapshotImport` für Validate/Import · Credential-Skip deaktiviert externe Provider

**4. Kanonisches Fresh-Schema + DB-Startup minimal absichern** — ✅ Kern: `app/src/shared/db/create-current-schema.ts` · `createCurrentSchema` / `runTransitionSchemaEnsures` · `SCHEMA_GENERATION = 1` · Startup in `database.ts` (fresh → canonical, legacy 0 → ensures, >1 → `SchemaGenerationUnsupportedError`) · `PRAGMA busy_timeout = 5000` · FK-Check nach Fresh-Build · Tests `create-current-schema.test.ts`

`createCurrentSchema(db)` — eine kanonische Quelle für leere aktuelle DB (App-Core, flow-core, Portal-FKs, Host-State, Terminal-Assist, Indizes, Trigger, Singletons); Baseline sofort endgültig (z. B. `patient_sessions`/`documents` mit Visit-FK)

Startup: DB fehlt → Schema erzeugen · bekannte Generation → starten · unbekannte/alte → **nicht reparieren**, klaren Upgrade-/Restore-Hinweis

Quick-Wins (offen): `parseAllowedSurfaceIds()` strikt · `visit_events`-Insert mit expliziter Spaltenliste

**5. Manager-Backup auf Settings-Export** — ✅ `.pfbackup` · voller Stack in `settings.env` (inkl. Image-Tags) · `gatewayImage` in manager-state · Inspect-Vorschau

App-Export aufrufen · Setup-API sammelt Settings + `.env` + `manager-state.json` · `.pfbackup` mit Manifest/Checksummen · direkt wieder einlesen/validieren · Electron Speichern-Dialog · zuerst „Backup prüfen“, noch kein Auto-Restore

**6. Restore gegen frische DB** — ✅ Orchestrierung + Manager-Wizard · Fix: Restore-Timeout 10 min · Rollback-Fehler blockiert Retry/Skip · Escape während Restore · Credential-Skip nur manuell · Dateidialog-Abbruch → zurück zur Auswahl

**7. Release-Bundle `.pfupdate`** — ✅ Review-Fixes (2026-07-12)

- ✅ `packages/server-shared/src/pfupdate.ts` — Format v1, Manifest-Parser, Checksummen, Kompatibilität
- ✅ `scripts/build-pfupdate.mjs` — App/Sandbox/Gateway → `images/praxis-flow-images.tar` + Compose-Templates + `.env.example` → eine `.pfupdate`-Datei, Roundtrip-Validierung
- ✅ Setup: `pfupdate-package.ts` (verbose Tar-Listing: Pfade + Entry-Typen, `lstatSync`) + `settings-backup-update.ts` + `pfupdate-inspect.ts` (try/finally)
- ✅ Setup-API: `POST /api/setup/host/update/inspect` + `POST /api/setup/host/update/apply`
- ✅ Manager: Update-Wizard (Datei → Inspect/Preview → Bestätigen → Apply), analog Restore
- ✅ `settingsFormatVersion` aus `HostStatus` / Maintenance-App (nicht hardcoded im Manager)
- ✅ Optional: `PFUPDATE_DOCKER_SMOKE=1 npm run test -w @praxis-flow/setup -- pfupdate-docker-smoke`
- ✅ Doku: [`docs/delivery.md`](docs/delivery.md) (Build, Release, Installation, Update) · Runtime in `deployment-docker.md` · Manager in `manager/README.md`

**8. Update-Orchestrator** — ✅ Setup `/update/apply` (2026-07-12)

Release + Kompatibilität prüfen · offene Visits prüfen · Backup erstellen/verifizieren · Images laden · Stack stoppen · neue Version · frische DB · Settings restore · Healthchecks · bei Fehler Rollback (alte DB + alte Images)

**9. Performance- und Schema-Findings nachziehen**

Rest der DB-Liste: fehlende Indizes, Status-Enum-Checks, `visit_topics`-Unique, Supersede-FKs, Prepared-Statement-Konsolidierung, `SELECT *`, Outbox-Lease, Legacy-Namensbereinigung

Ausnahme — jederzeit als Quick Win: `idx_visits_day_status_checkin`, `idx_visit_events_visit_created`

## Raum-Panel v2 (abgeschlossen 2026-07-12)

- ✅ Dual-Placement (`outside` / `inside`): Domain, API, Auth, Snapshot, MFA-Settings-Accordion, Live-UI
- ✅ Doku: [`flows.md`](docs/flows.md) § Flow 5, [`apis.md`](docs/apis.md) § Raum-Panel
- Plan-Datei entfernt — Inhalt in Kerndokumenten
- ✅ Review-Cleanup (2026-07-12): Call-Scope dedup (`resolveRoomPanelCallCandidateScope`); URL-Helper (`findRequestedRoomEntry`, `buildRoomPanelPath`/`Url` via `VITE_API_BASE`); tot Preview-CSS; deprecated Domain-Exports (`roomPanelMayCallVisit`, `roomPanelVisitTargetsRoom`, `normalizeRoomPanelSettings` aus Public API); shared `emptyFlowCoreRuntimeForMocks`; callCandidates dedup gegen items (kein Doppel-Listing); Home-Links mit Placement
- Controller-Split bewusst zurückgestellt — JSDoc in `ui/src/routes/room-panel/+page.svelte` (Trigger + `tv-display`-Pattern)
- ✅ TV-offline Aufruf-Gate (2026-07-12): `capabilities.callAnnouncementReachable` im Snapshot (Server-Presence); UI disabled+Tooltip; `disabledReason` aus OpenAPI entfernt
- ✅ Kleinkram+i18n (2026-07-12): `updateRoomPanelPlacementConfig`→Domain; `room-panel-login.ts`+`room-panel-settings.ts` entfernt; Snapshot-Presets statt DE-Hardcode; `room-panel-text.ts` + `roomPanel.*` i18n
- 🔍 Quality-Audit (2026-07-12): ESLint+Stylelint+Prettier grün; `format:check` in `verify`; tote CSS entfernt; `flow-core` lint; ESLint+`eslint-plugin-svelte` für `.svelte` (ui/manager); QueueEntry a11y (`<button>`); kein GitHub/CI — lokal `npm run verify`
- 🔧 ESLint-Svelte-Reaktivierung (2026-07-12): deaktivierte Regeln weitgehend zurück — `require-each-key`, `no-navigation-without-resolve`, `no-useless-children-snippet`, `no-dom-manipulating` wieder `error`; `prefer-svelte-reactivity` nur file-disable für interne Map/Set; `kit-paths.ts`; Navigation `resolve()`; `npm run lint` + `ui check` + `npm run verify` grün

## Hinweis: RoutingMode-Guard vs. offene Wartenummern (2026-07-10)

- ✅ Guard umgestellt: Wechsel blockiert bei offenen Wartenummern (`status NOT IN terminal`), beide Richtungen.
- Alter Journey-Guard (`journey_state = active`) entfernt/obsolet.
- Capabilities liefern `openVisitCount`; Manager Wartung disabled + eine adaptive Footnote.
- Fehlercode bleibt `ROUTING_MODE_CHANGE_BLOCKED`, Details: `openVisitCount`.
- Fix: Journey-Step-IDs via `randomId()` (LAN-HTTP ohne `crypto.randomUUID`).
- Fix: Check-in/Bon `destinationRoomLabel` nur aus Visit-Ziel (kein Topic-Default-Fallback).
- ✅ MFA Active-Zone Primary-Button (2026-07-11): `startedAt` + `start_treatment`/`continue_journey`; Resolver Starten/Weiter/Entlassen; Simple+Complex angeglichen.
- Journey-Admin: Standard-Thema + Aktiv + Warteliste-Dropdown ausgeblendet (2026-07-12); Steps default `pf_general_queue`; Aktivierung bleibt am Topic.
- ✅ TV Wayfinding (2026-07-11): QueueStatus `directed`; Visibility `directed`/`pickup`+`visible`; TV-Spalte „Bitte weiter zu“ (+ Pickup-Copy „Sie werden abgeholt“).
- ✅ Room-Panel self_go (2026-07-11): Snapshot zeigt `directed` wenn Ziel = Panel-Raum; Quittieren („Ich bin da“/Angekommen) = `arrive` aus directed; OpenAPI RoomPanelItem.status + Preview/Live-UI.
- ✅ Room-Panel leerer Zustand (2026-07-12): Grauer Platzhalter-Strich (`room-panel-preview__empty`) entfernt; Status nur noch im Lead-Bereich.
- ✅ MFA Journey-Designer Polish (2026-07-12): Enum-i18n, Preview-i18n, Save-Vorvalidierung; ausgeblendete Felder dokumentiert in `journey-admin-helpers.ts`; tote CSS/i18n-Keys entfernt.
- ✅ MFA Journey-Designer UI (2026-07-12): Mock-inspiriert — Timeline, Raum-Badge, Segmented Controls (Weg/WZ-TV), Feld-Hints, kompakteres 2-Spalten-Grid; ohne Drag/Reorder.
- ✅ MFA Journey-Designer Feinschliff (2026-07-12): Kompakter Meta-Bereich, größere Timeline-Kreise, Segment-Groups fit-content + Kontrast, Label „Wartezimmer Verhalten“; Save/Löschen in Meta, „Neue Journey“ im Page-Header.
- ✅ Journey `instructionText` (2026-07-12): Routing-Hinweis-Feld in Admin-UI ausgeblendet; Modell/API bleiben, Doku in `journey-admin-helpers.ts`.
- ✅ MFA Call-Gate + Löschen (2026-07-11): Aufrufen disabled+Tooltip (directed/pickup); Trash danger-Style; Modal → `cancelled`.
- ✅ MFA Card-Marken (2026-07-11): pickup = blaues Users-Mark; directed = Navigation (teal). Away-Löschen in einer Zeile mit Rückkehr-Countdown.

### MFA Primary-Button — fixierter Plan (2026-07-11)

**Umgesetzt:** Queue `startedAt` + Transitions `start_treatment` / `continue_journey`; Resolver `resolveMfaInRoomPrimaryAction`; MFA Buttons Starten/Weiter/Entlassen. Room-Panel unverändert (Arrive/Done, Auto-Start bei Checkout).

**Regeln:**

- Angekommen = Anwesenheit; Starten = Behandlung beginnt; Weiter = Routing anwenden; Entlassen = Visit-Ende.
- Simple bekommt sichtbares **Starten** (nicht mehr still beim Entlassen) — an Core/`in_progress` und Complex angeglichen.
- Signal: `in_room` + `startedAt` / `journeyStepCompletedAt` (Status bleibt `in_room` für Zone/Capacity).
- Weiter nur bei Folgeschritt `call`/`pickup` (self_go schon beim Complete → kein Flag).
- Kein Folgeschritt (auch letzter Hop = Empfang) → Entlassen.
- Kein bedienbares Panel → MFA zeigt alle nötigen Primary-Actions.

| Situation                                      | Simple     | Complex       |
| ---------------------------------------------- | ---------- | ------------- |
| waiting                                        | Aufrufen   | Aufrufen      |
| called                                         | Angekommen | Angekommen    |
| arrived (im Raum, noch nicht gestartet)        | Starten    | Starten       |
| in_progress + Flag, nächster call/pickup       | —          | Weiter        |
| in_progress + Flag, nächster self_go           | —          | (kein Weiter) |
| in_progress, kein Folgeschritt / kein Template | Entlassen  | Entlassen     |

## Heute: UI↔BE Drift-Aufräumen (Runde 1)

1. **Call-Announcement** — ✅ SSE nur noch UX-Hinweis (Button enabled + title/aria); Commands blocken nicht mehr; Server Presence bleibt autoritativ (`CALL_ANNOUNCEMENT_OFFLINE` Toast via API)
2. **Terminal-Validation** — ✅ Phone/DOB/LastName-Regeln in `@praxis-flow/domain` (`terminal-phone`, `birth-date`, `terminal-last-name`); App-Asserts thin; UI nur Format/i18n-Mapping + Locale-Keyboard
3. **Room-Guards** — ✅ RoomsEditor speichert optimistic (keine Queue-Prechecks); Server autoritativ; `roomGuardErrorMessage` inkl. disable-Context; **kein Topic-Auto-Remap** — Remove/Rename mit Topic-Bezug → Toast `roomRemoveBlockedTopics` + Abort
4. **Settings-Normalize / Icon-Allowlist** — ✅ `TOPIC_ICON_IDS` + Room-Panel Konstanten/`normalizeRoomPanelSettings` in `@praxis-flow/domain`; UI Catalog/Lucide lokal; DB Legacy-Wrapper bleibt

## Heute: MFA Dashboard P0-Refactor (erledigt)

1. **P0.1 Topic-Validierung** — `MFA_ASSIST_LANE_CODE` / `isReservedLaneCode` / `isValidLaneCode` kanonisch in `@praxis-flow/domain` (`lane-code.ts`); flow-core, app, UI re-exporten/importieren; Client-Checks als UX-only kommentiert
2. **P0.3 Topic-Catalog** — Layout-Bootstrap entfernt; `applyMfaPracticeTopics` als Schreibstelle; Catalog als Adapter-Cache; Check-in-Modal nutzt Practice-Context (Fetch nur Fallback); Label/Accent tracken `practiceTopics`
3. **P0.2 Queue-Actions** — Split in `mfa-queue-modals` + `mfa-queue-commands`; Phone-Flows über `phoneCorrectionVisit.purpose` + `confirmMfaPhoneCorrection`; Barrel `mfa-queue-actions` bleibt Public API

### Review (manuell, 2026-07-10)

- **OK:** Lane-Kanon, Actions-Split/Barrel, Phone-Unify, Catalog-Schreibstelle, Domain-Tests grün
- **Medium:** Check-in-Verfügbarkeit bleibt Server (`terminalTopicsForUi` via `/api/v1/checkins/topics`); UI-Spiegel (`filterTopicsForCheckinUi` / Practice-Open im Context) wieder entfernt — Catalog nur Display
- **Low:** `busyVisitId` lebt in Modal-State; `setPracticeTopicCatalog` noch öffentlich; `void practiceTopics`-Subscribe-Hack; `entry-copy` ohne Reactive-Track
- **Audit UI↔BE (2026-07-10):** Top-Risiken — Call-Announcement-Signal (SSE vs Presence), Room-Guards in RoomsEditor, Terminal Phone/DOB/Name-Validierung, Settings-Normalize/Icon-Allowlist; Capacity/Recall-Gates = OK als UX auf Snapshot

## Zuvor: MFA-Dashboard Refactoring-Check (vor weiteren Features)

**Verdict:** kein Big-Bang nötig, aber 3 Hotspots vor Topic-Wechsel / neuen Queue-Actions angehen.

### P0 — vor Topic-Wechsel / neuen Queue-Actions

1. **Topic-Validierung FE/BE driftet** — ✅ erledigt (siehe oben)
2. **`mfa-queue-actions.svelte.ts` (~400)** — ✅ erledigt (Split + Phone-Unify)
3. **Topic-Catalog 3× geladen** — ✅ erledigt (ein Bootstrap + Settings-Update)

### P1 — wenn man die Dateien sowieso anfasst

- `+page.svelte` Orchestrator (20+ Imports / Callbacks) → Controller bündeln
- `QueueEntry.svelte` (~386) — UI + Inline-Edit + DnD + Actions mischen
- Settings-Boilerplate Topics/Rooms (load/persist copy-paste)
- `queue-routes.ts` — Transition-Engine extrahiert (2026-07-14); optional Nebenrouten weiter splitten

### Schon ok

- `mfa-dashboard.svelte.ts` dünn; `MfaOpsStreamHost`; `queue-actions.ts` getrennt von MFA-Orchestrierung; Domain-Paket teilweise genutzt

### Nächster Schritt

- Produktregeln Topic-Wechsel klären, dann Feature bauen

## Heute: MFA — Topic-Supersede (umgesetzt)

### Fachlich

- Generischer Topic-Wechsel per Supersede-Kette; Policy v1 weit (`waiting`|`directed`, Ziel ≠ Quelle, aktiv); `arrivedAt`/`checkedInAt` behalten.
- UI: Doppelklick Lane-Badge+Nummer → Modal → neue Nummer + Bon. DnD bleibt.
- **Fix Drag vs Supersede:** DnD-Handle nur noch am Grip (nicht Ticket); Ticket bleibt klickbar für Topic-Wechsel (wie Name-Edit außerhalb der Drag-Zone).
- **Fix Supersede-Modal:** Shared `Modal`+`Button` wie Check-in; 3 Actions Abbrechen / Umbuchen / Umbuchen & Bon.
- **Fix Topic-Pflicht:** UI kein Auto-Select mehr (Placeholder); Backend-Guard gleiches Topic bleibt (`assertSupersedeAllowed` + Core `SUPERSEDE_SAME_TOPIC`).
- **DnD → Abwesend:** Drop aus Wartezimmer auf gelbe Zone öffnet dasselbe Mark-Away-Modal wie Palm-Button (nur `waiting`→`away`).
- **Warteliste Filter/Suche (lokal):** `waiting-list-filter.ts` + `WaitingListFilters.svelte` in Quicksettings; Suche XOR Lane; global über waiting/away/active; QS-Reihenfolge Lock → Terminal → TV → Trenner → Anmelden → Suche → Lanes (~4–5/Zeile in 12.5rem).
- **Card-Actions:** Aufrufen/Außer Haus/Ankommen/Entlassen/Raum/Zurück erst bei Card-Hover (`focus-within` + Touch immer sichtbar); Triage + Docs bleiben.
- Docs umhängen alt→neu nur im Supersede-Paar; MFA-Checkin unverändert.

### Implementiert

- flow-core: `runtime.supersede()`, Link-Spalten via `ensureVisitSupersedeColumns`, Tests
- Host: Policy, Bridge, Doc-Rebind, Outbox `VisitSuperseded`, `POST /api/v1/queue/:visitId/supersede`
- UI: `MfaSupersedeModal`, QueueEntry Doppelklick
- **Review-Fixes:** Check-in named INSERT (37-Spalten-kompatibel); Policy auf Core-`waiting`|`directed` + Absent-Guard; Doc-Rebind nur bei Successor-Link; Policy/Rebind-Tests
- **Review-Nachzug:** Host-E2E (State/Docs/Session/Wartezeit-Sort), Route-Smoke supersede, Core-Actor default `system` (Host `mfa`), Link-Spalten in `schema.sql`, Lane-Badge Keyboard Enter/Space

## Zuvor: Branch `reverse_proxy` — P0 URL-Modell vor Proxy

- **Reihenfolge:** erst URL-Autorität (Setup-Kern), danach Manager/Wizard-UI (Schritt 2), danach Proxy-Compose
- **Produktmodell:** `CANONICAL_BASE_URL` = Wahrheit für Menschen-/Geräte-URLs (nicht Proxy-Konfig)
- **URL-Klassen (nicht vermischen):**
  - User/Geräte: Terminal, TV, MFA, Ops, Portal → aus `CANONICAL_BASE_URL`
  - Setup-local: `http://127.0.0.1:8080` Probes über Docker-Publish ok
  - Intern: `SANDBOX_BASE_URL=http://sandbox:8081` bleibt intern
  - Gateway/Captive: Sonderfall (`portalAppIp` / später ggf. `PORTAL_PUBLIC_BASE_URL`)
  - Same-origin UI: `window.location.origin` oft korrekt
- **LAN-Erreichbarkeit:** Hostname = Komfortpfad; IP = zuverlässiger Fallback (UI-Probe = Schritt 2)
- **P0 erledigt (Setup-Kern):**
  - `buildDeviceUrlsFromBaseUrl` + `resolveCanonicalBaseUrl` in `setup/src/urls.ts`
  - HostStatus / SetupPlan / Apply / saveHostNetwork / Probes auf Resolver
  - `.env` schreibt `CANONICAL_BASE_URL`; Custom-Hostname bleibt bei LAN-Wechsel
  - Fallback ohne Env unverändert `http://<lan-ip>:8080`
  - Review-Nachzug: Plan/Apply/saveHostNetwork teilen `resolveCanonicalBaseUrlForLanPlan`; nur http(s) Origin; Rewrite nur Exact-Match `http://<old-ip>:8080`; CLI nutzt `result.deviceUrls`
  - Gateway/Captive bleibt Sonderfall (`portalAppIp` ≠ Canonical) — in Schritt-2-UI explizit halten

- **Schritt 2 — Manager/Wizard UI (in Arbeit):**
  - Netzwerk-Tab: Akkordeon **Erreichbarkeit im Praxisnetz** (LAN-IP / Hostname / eigene URL + Probe)
  - API: `configuredCanonicalBaseUrl`, `canonicalBaseUrl` auf saveHostNetwork, `machineHostname`, Runtime `appBaseUrl`
  - Review-Reste: setup-probes / wizard-copy / health-header auf Canonical
  - Custom-Modus: Hostname/Domain only → intern `http://<name>:8080` (kein Port im UI)
  - Proxy/TLS weiter später

- **Erledigt: Netzwerkvoraussetzungen-Preflight (Setup/Wizard)** — 2026-07-09
  - Wizard Schritt 1: Checkliste **„Netzwerkvoraussetzungen prüfen / ok“**; Gate in `canLeaveWizardStep1`
  - Setup: `auditNetworkPrerequisites` → `HostStatus.networkPrerequisites` (8080; +9100 wenn Gateway in `.env`)
  - „Unser Port“ nur wenn Compose-Service den Host-Port wirklich published (`Publishers` aus `compose ps`)
  - Belegt sonst → Blocker; Owner nur best effort via `lsof` (Copy: Prozesshinweis, kein Container-Name)
  - Leere/fehlende Checks: Wizard-Fallback „konnten noch nicht geprüft werden“
  - Keine zweite Absicherung vor Apply; Status-Pills lokal/LAN unverändert
  - Später mit Proxy: 80/443 in denselben generischen Check

## Zuvor: Manager Gateway-UI / Konfigurationstexte

- Fokus: Electron Manager → Netzwerk → Gateway (optional) + Wizard Gast-WLAN
- Ziel: UI-Texte und Konfiguration für Host-`.env` (technisch) vs. Praxis Flow `portalEnabled` (fachlich)
- Einstieg: `GatewayPanel.svelte`, `NetworkView.svelte`, `docs/gateway-captive-portal.md`
- **Erledigt:** Topology-Betriebsarten — Szenario 1: dediziertes Gast-Netz + Firewall + Risiko-Hinweis; Szenario 2: Portal-Kasten durchgestrichen (nicht produktiv)
- Accordion-Subtitle: „Betrieb mit oder ohne Patientenportal“; Intro-Text feature-orientiert
- **Erledigt:** Netzwerk-UI-Texte IT-freundlicher (Prüfungen, LAN, Gast-WLAN, Binding-Messages) — Layout unverändert
- Noch offen: ggf. Reihenfolge Checks nach unten; weitere UX-Feinschliffe

---

Stand zuvor: 2026-07-07 (Release **0.2.0** — Journey/Routing, non-breaking API/DB)

## Erledigt

- **Paket 1** – `routingMode` in OpsSettings modelliert (simple default, complex optional)
- **Paket 2** – Capabilities-Resolver + API `GET /api/v1/ops/settings/capabilities` + UI-Client `fetchRoutingCapabilities()`
- **Paket 3** – Surface/Location/Queue-Guards in flow-core (committed)
- **Paket 4** – Simple Routing explizit benennen (committed)
- **Paket 5** – Complex Routing Config ohne UI (committed)
- **Paket 6** – Topic UI RoutingMode-Schnitt (committed)
- **Paket 7** – Journey Admin UI + Ops-Settings-API (committed `d03485a`): Review-Fix: `terminalWlanPromoEnabled` in MfaPatch, Journeys-Nav capability-gated

## Erledigt (Fortsetzung)

- **MFA Settings UI** – Branch `feat/mfa-settings-sidebar` nach `master` gemerged (2026-07-09, FF → `df8f9da`)

- **TV Aufrufe-Pagination** (2026-07-08): Rechte Spalte paginiert; Refactor zu `TvPaginatedPanel` + `tv-panel-layout.svelte.ts` (shared, Svelte-5-Snippets)
- **return_to_waiting Aufrufziel** (2026-07-08): Simple behält `targetLocationId`; Complex rehydriert aus aktivem Journey-Step (`resolveReturnToWaitingTargetLocationId`)
- **MFA Day-Start-Banner nach Sleep** (2026-07-08): `totalVisits`/`openVisits` statt falscher Ticket-Feldnamen; Banner bei `backendUnreachable` ausblenden; `dayLifecycle` leeren/reload bei Queue-Reconnect
- **MFA i18n `entryCalled`** (2026-07-08): fehlende Übersetzung „Aufgerufen“ für Status `called` im Dashboard
- **Paket 8 – Manager Routing Mode** (2026-07-07): Setup-API `GET|POST /routing-mode`, Manager-Trust-Header, `complexRoutingLicensed` in Capabilities, Wizard Schritt 3 + Wartung-UI, Lizenz-Guard-Stub
- **Production artifact hygiene**: `strip-production-artifacts.mjs` — Docker/Manager ohne `src/`, `.d.ts`, `.d.ts.map`; Runtime-COPY nur `dist`+`package.json`
- **Fix Wizard Abschluss Unauthorized**: App vertraut Manager-Header bei `Host: 127.0.0.1` (Docker-Publish); Setup-API DB-Fallback bei 401
- **Wizard Routing-Erklärung** (Variante B): Einleitung, erweiterte Optionstexte, Fußnote IT-Einstellungen
- **Manager Shell-Navigation** (2026-07-08): Health-Header + Haupt-Tabs (Status/Netzwerk/Wartung/Assistent); Wartung als Akkordeon; Routing-Cards; Ersteinrichtung fullscreen ohne Tabs
- **Manager Chrome-Trennung** (2026-07-08): Header weiß, Nav dunkelgrün volle Breite, dezenter Hover, aktiver Tab grau mit Accent-Underline
- **Docker File-Sharing-Hinweis** (2026-07-08): Wizard Schritt 5 + Wartung — nur Sonderfälle (andere Laufwerke), nicht mehr als Pflichtschritt
- **Manager Svelte 5 Wiring** (2026-07-08): Vite-Plugin + minimale `App.svelte`; Legacy-UI bleibt in `index.html` / `mountLegacyManager()`
- **Manager Shell → Svelte** (2026-07-08): `App.svelte` + `HealthHeader`/`MainNav`; Shell-State in `manager-shell-state.svelte.ts`; Legacy-Views in `LegacyViewContainers.svelte`
- **Manager State/Adapter-Schicht** (2026-07-08): `manager-app-controller.ts` kapselt Legacy-Wiring; `status-view-model.ts` für Status-Texte/Zeilen; `defaultWizardPresentation` + `buildRoutingModeOptions` exportiert
- **Manager StatusView → Svelte** (2026-07-08): `StatusView.svelte` + Subkomponenten; `statusError` im Shell-State; Legacy-DOM-Renderer `status-view.ts` entfernt
- **Manager Maintenance ViewModel** (2026-07-08): `maintenance-view-model.ts` — reine Labels/Warnings/Disabled/Status-Texte; `maintenance-view.ts` nutzt Helper; Tests
- **Manager Maintenance Controller** (2026-07-08): `maintenance-controller.ts` — State/Actions/Confirm-Flows; `maintenance-view.ts` nur DOM-Wrapper; API unverändert
- **Manager MaintenanceView → Svelte** (2026-07-08): `MaintenanceView.svelte` + Panels; Shared `ConfirmDialog`/`LoadingOverlay`/`FolderPathField`/`IconButton`; `maintenance-view-adapter.ts`; Legacy-HTML + `maintenance-view.ts` + `maintenance-accordion.ts` entfernt; Stack-Toggle-Fix (wantRunning vor checked-Reset)
- **Manager NetworkView → Svelte** (2026-07-08): `NetworkView.svelte` + `LanIpPanel`/`GatewayPanel`/`NetworkTopologyDiagram`/`NetworkBindingChecks`; `network-controller.ts` + `network-view-model.ts` + `network-view-adapter.ts`; Legacy-HTML + `network-view.ts` + `network-binding-checks.ts` entfernt
- **Manager WizardView → Svelte** (2026-07-08): `WizardView.svelte` + `WizardSteps`/`WizardStepIndicator`/`WizardRoutingModePanel`; `wizard-controller.ts` + `wizard-view-model.ts` + `wizard-view-adapter.ts`; `LegacyViewContainers.svelte` + `wizard-view.ts` + `folder-path-field.ts` entfernt; `LanIpPanel`/`GatewayPanel` um Wizard-Varianten erweitert
- **Manager Legacy-DOM-Cleanup** (2026-07-08): tote `renderLanIpPanel`/`renderGatewayPanel`/`renderRoutingModePanel` entfernt; `view-loading.ts` + `dom.ts` gelöscht (ersetzt durch Svelte `LoadingOverlay` / Shell-State)
- **Manager NetworkView Layout** (2026-07-09): LAN + Gateway in eine „Host-Konfiguration“-Karte; Button „Netzwerk-Einstellungen übernehmen“ unten für beides; Netzwerk-Tab bietet manuelle LAN-IP immer an

## Geplant

- _(keine offenen Routing-Mode-Pakete)_

## Erledigt: Manager CSS-Konsolidierung (2026-07-09)

- Tote Selektoren entfernt: `.actions`, `.wizard-url-list*`, `.wizard-advanced`
- Shared Primitives: `.hint`, `.actions-row` (+ `--footer`/`--dialog`), `.checklist`/`checklist-mark`, `.panel-section`
- Topology-CSS ausgelagert nach `network-topology.css` (~279 Zeilen); `styles.css` ~1402 Zeilen
- Markup in Wizard/Wartung/Netzwerk/Setup auf neue Klassen umgestellt

**Review-Fokus (visuell prüfen):**

1. Hint-Abstände (Wizard-Schritte, Netzwerk-Hinweise, Wartung-Texte) — früher `.wizard-hint` ohne Margin vs `.maintenance-hint` mit Margin, jetzt einheitlich `.hint`
2. Checklisten Setup-Entry + Wizard Schritt 1/Abschluss — Mark-Größe/Gewicht leicht vereinheitlicht
3. Wizard-Footer (Zurück/Weiter/Abbrechen) + Completion-Buttons
4. Wartung Action-Rows + Confirm-Dialog Buttons
5. Netzwerk „Host-Konfiguration“-Überschrift + Panel-Abstände
6. Topology-Diagramm (nur Datei-Split, sollte pixelgleich sein)

## Manager Svelte-5 Review (2026-07-09)

Review-Canvas: `~/.cursor/projects/.../canvases/manager-svelte5-review.canvas.tsx`

**Top-Funde (noch offen):**

- Snapshot-Shallow-Copy statt reaktiver Controller-State — Svelte-5-Migrationsmuster
- Topology-Diagramm remountet bei jedem Keystroke
- Tote Flächen: `getComposeStatus`, `maintenance.subscribe`, `setButtonIcon`
- Routing-Panel-Markup doppelt (Wizard vs Wartung); `wizard-state` von Network mitgenutzt

## Erledigt: Adapter-Singletons entfernt (2026-07-09)

- Shell: `viewLoading` + `maintenanceSession` / `networkSession` / `wizardSession` (monotone `generation`)
- Navigation/App-Controller schreiben Sessions statt Adapter; Callbacks als Props
- Views: `$effect` auf Session/`hostStatus`/`runtimeHealth`; lokale Controller behalten
- `*-view-adapter.ts` gelöscht; Race-Tests auf Session-API umgestellt
- `createManagerAppController().start()` nach `mount(App)` — keine Init-Navigation mehr im Factory-Konstruktor

## Erledigt: Routing-Mode Hydrate ohne Fake-Default (2026-07-09)

- Wizard + Wartung: `routingMode`/`routingModeSaved` starten als `null` bis `getRoutingMode()` fertig
- Kein sichtbares Fake-`simple`; Next/Save geblockt bis hydrated
- Konvention für async Extra-Settings: Wert `T | null` bis ready, UI disabled/Loading

## Erledigt: Manager Hygiene F9/F12/F13 (2026-07-09)

- F9: Runtime-Poll merged live Felder (compose/probes/docker/…) in `hostStatus`
- F12: `compilerOptions.runes: true` in `svelte.config.js`
- F13: `manager/README.md` an Shell/Svelte, Wizard-Schritte, 12s-Poll angepasst

## Erledigt: Netzwerk Topology in Expander (2026-07-09)

- Betriebsarten-Diagramm unter „Erläuterung zu den Betriebsarten“ (default zu)

## Erledigt: Unused-CSS Lint (2026-07-09)

- Stylelint (`stylelint-config-recommended`) für Manager/UI-CSS
- `scripts/check-unused-css.mjs` (PurgeCSS) erkennt tote Selektoren in globalen Sheets
- `npm run lint:css` in Root-`lint` eingehängt
- UI-Baseline aufgeräumt: 31 tote Selektoren entfernt (app-header/nav, modal-form-journey, MFA/Terminal/Ops/Staff-Reste, Utilities)
- `scripts/unused-css-allowlist.json` wieder leer

## Erledigt: Wartung Logs UX (2026-07-09)

- Hinweis „Neueste Einträge unten“, Auto-Scroll nach unten bei Refresh
- Blinkender Cursor am Log-Ende (ohne bei leerem Platzhalter; reduced-motion: statisch)

## Erledigt: Praxis-Einstellungen Trennung (2026-07-09)

- Routing-Modus als `h2` wie Import/Export; Trennlinie dazwischen

## Erledigt: checkin-topic-settings Normalizer-Diät (2026-07-14)

- Feld-Primitive (`readNonEmptyString`, `readNullableTimeField`, …) statt Inline-Ternaries in `normalizeSingleTopic`
- `database-ops-settings` nutzt `readPartialNullable*` für gleiche Tri-State-Logik

## Erledigt: Wizard Docker-Compose Label (2026-07-09)

- Checkliste: „Docker Compose verfügbar“ (Produktname, nicht CLI-Schreibweise)

## Hinweis: Simple vs Complex State-Mapping (2026-07-13)

- Gleiche Core-Statuskette; Complex verdoppelt Hop per Journey-Step (`→ Weiter`).
- Queue-UI: `arrived`+`in_progress` → `in_room`; MFA: Starten / Weiter / Entlassen.

## Fix: Room-Panel Sektions-Alignment (2026-07-13)

- „Aufrufen“ vs „Im Raum“: gleicher linker Text-Einzug (`section-pad` + Border).

## Offen: MFA „Starten“ hängt bei vielen SSE-Tabs (2026-07-13)

- Container-Check `praxis-flow-app`: L-001 war `arrived` / `in_room`, `startedAt: null` — **kein** `start_treatment` im Browser-Log
- Nur 2 Transitions vom Client: Aufruf + Ankommen (200); Starten-POST kam nie an
- API `start_treatment` funktioniert (manuell im Container getestet → L-001 jetzt `in_progress`)
- Verdacht: Browser-Connection-Pool voll durch viele parallele `/api/v1/queue/stream` + `/api/v1/ops/stream` (MFA + Raum-Panel-Tabs) → POST blockiert, `busyVisitId` wirkt „hängend“
- Nächster Schritt (optional): Connection-Budget/Polling-Fallback oder HTTP/2; Start-Button `loading={busy}`

## Referenzen

- `docs/flow-routing-modes-working-doc.md`
- `docs/flow-routing-work-packages.md`
