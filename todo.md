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

## Geplant

- _(keine offenen Routing-Mode-Pakete)_

## Referenzen

- `docs/flow-routing-modes-working-doc.md`
- `docs/flow-routing-work-packages.md`
