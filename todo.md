# Routing Modes – Arbeitsstand

Stand: 2026-07-07 (Release **0.2.0** — Journey/Routing, non-breaking API/DB)

## Erledigt

- **Paket 1** – `routingMode` in OpsSettings modelliert (simple default, complex optional)
- **Paket 2** – Capabilities-Resolver + API `GET /api/v1/ops/settings/capabilities` + UI-Client `fetchRoutingCapabilities()`
- **Paket 3** – Surface/Location/Queue-Guards in flow-core (committed)
- **Paket 4** – Simple Routing explizit benennen (committed)
- **Paket 5** – Complex Routing Config ohne UI (committed)
- **Paket 6** – Topic UI RoutingMode-Schnitt (committed)
- **Paket 7** – Journey Admin UI + Ops-Settings-API (committed `d03485a`): Review-Fix: `terminalWlanPromoEnabled` in MfaPatch, Journeys-Nav capability-gated

## In Arbeit / Review

- **MFA Settings UI** – Branch `feat/mfa-settings-sidebar`: Sidebar, Topics/Journeys-Routen

## Erledigt (Fortsetzung)

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

## Manager Svelte-5 Review (2026-07-09)

Review-Canvas: `~/.cursor/projects/.../canvases/manager-svelte5-review.canvas.tsx`

**Top-Funde (noch offen):**
- Wizard Routing-Default-Race (`simple` bis async Capabilities) — Bug-Risiko bei Re-Run
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

## Referenzen

- `docs/flow-routing-modes-working-doc.md`
- `docs/flow-routing-work-packages.md`
