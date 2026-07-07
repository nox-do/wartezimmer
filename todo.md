# Routing Modes – Arbeitsstand

Stand: 2026-07-07

## Erledigt

- **Paket 1** – `routingMode` in OpsSettings modelliert (simple default, complex optional)
- **Paket 2** – Capabilities-Resolver + API `GET /api/v1/ops/settings/capabilities` + UI-Client `fetchRoutingCapabilities()`

## In Arbeit / Review

- Paket 2 committed; `mfa-assist` Auth-Regel nachgezogen

## Nächste Schritte

- Paket 3 – Surface/Location/Queue-Guards fertigziehen (`packages/flow-core/src/shared/surface-guard.ts` begonnen)

## Referenzen

- `docs/flow-routing-modes-working-doc.md`
- `docs/flow-routing-work-packages.md`
