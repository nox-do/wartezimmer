# Routing Modes – Arbeitsstand

Stand: 2026-07-07

## Erledigt

- **Paket 1** – `routingMode` in OpsSettings modelliert (simple default, complex optional)
- **Paket 2** – Capabilities-Resolver + API `GET /api/v1/ops/settings/capabilities` + UI-Client `fetchRoutingCapabilities()`
- **Paket 3** – Surface/Location/Queue-Guards in flow-core (committed)
- **Paket 4** – Simple Routing explizit benennen (committed)
- **Paket 5** – Complex Routing Config ohne UI (committed)

## In Arbeit / Review

- **Paket 6** – Topic UI mit RoutingMode-Schnitt
- **MFA Settings UI** – Branch `feat/mfa-settings-sidebar`: Sidebar, Topics-Route, i18n/CSS-Leichen entfernt

## Referenzen

- `docs/flow-routing-modes-working-doc.md`
- `docs/flow-routing-work-packages.md`
