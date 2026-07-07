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

- **Paket 8 – Manager Routing Mode** (2026-07-07): Setup-API `GET|POST /routing-mode`, Manager-Trust-Header, `complexRoutingLicensed` in Capabilities, Wizard Schritt 3 + Wartung-UI, Lizenz-Guard-Stub
- **Production artifact hygiene**: `strip-production-artifacts.mjs` — Docker/Manager ohne `src/`, `.d.ts`, `.d.ts.map`; Runtime-COPY nur `dist`+`package.json`

## Geplant

- _(keine offenen Routing-Mode-Pakete)_

## Referenzen

- `docs/flow-routing-modes-working-doc.md`
- `docs/flow-routing-work-packages.md`
