# API — Rollen & Regeln

Stand: 2026-09-01 · Ist (`app/src/auth/route-access-rules.ts`, Grant-/Session-Guards)

**Vertrag (maschinenlesbar):** `openapi/*.yaml` · Bundle `openapi/bundle.json` · Swagger `/api/docs` · `npm run generate:api`

**Scope:** Rollen, Least Privilege, fachliche Regeln, Nicht-Offensichtliches — **keine** Endpoint-Liste.  
Nicht: Domäne → [`domain.md`](domain.md) · SSE-Detail → [`realtime.md`](realtime.md) · Flows → [`../flows.md`](../flows.md)

## 1. Prinzipien

- OpenAPI-first: Schema vor Implementierung
- Least Privilege pro Client-Rolle (`ROUTE_ACCESS_RULES`)
- Kritische Felder nur in MFA-Kontexten
- TV: reduzierte Queue-Payload; MFA: volle Daten inkl. `documentCount`

Auth-Mechanismen:

| Mechanismus | Wer |
| --- | --- |
| Staff-Session-Cookie + `x-client-role` | `mfa`, `ops` (Idle-/Absolute-TTL) |
| Gerätefreigabe-Cookie + `x-client-role` | `terminal`, `tv`, `room-panel` (Hash in `device_authorizations`, kein Staff-TTL) |
| Bearer = `AUTH_KEY_CAPTIVE` | Rolle `captive` |
| Bearer = Patient-Session-Token | Portal (`session-auth`); ACL oft `public: true`, Ownership im Handler |
| Loopback Maintenance `:8082` | Snapshot/Import — nicht LAN ([`../operations/backup.md`](../operations/backup.md)) |

SoT der ACL: `app/src/auth/route-access-rules.ts` (nicht diese Datei).

## 2. Codegen (nach OpenAPI-Änderung)

**Source of Truth:** `openapi/*.yaml` (nicht die generierten Dateien handeditieren).

```bash
npm run generate:api
```

Das orchestriert:

| Schritt | Script | Output |
| --- | --- | --- |
| Bundle | `bundle:openapi` | `openapi/bundle.json` |
| Fastify-Schemas | `generate:api-schemas` | `app/src/api/generated/*.fastify-schemas.ts` |
| App-Typen | `generate:app-openapi-types` | `app/src/api/*-openapi-types.ts` |
| UI-Typen | `generate:openapi-types` | `ui/src/lib/**/openapi-types.ts` |

Zwei Zielgruppen, **kein** gemeinsames Generated-Package. Swagger UI: `/api/docs` (typisch non-production; Override `OPENAPI_DOCS_ENABLED`).

**Drift-Checks** (Teil von `npm run typecheck` / `check:drift`): Bundle, Fastify-Schemas, App-/UI-Typen, Route-Sync, Auth-Route-Rules — bei Drift erneut `generate:api` (bzw. den genannten Teilschritt). Contract-Smoke gegen Bundle: `npm run smoke:openapi-contract`.

Neue/geänderte Routen: YAML → `generate:api` → Handler an Schema/Typen → ACL in `route-access-rules.ts` mitziehen.

## 3. Rollenmatrix

| Rolle | Client | typ. API-Bereiche |
| --- | --- | --- |
| `terminal` | Check-in | `checkins`, `checkins/assist/*`, `ops/heartbeat`, `ops/device/presence`/`stream`, `ops/emergency/raise` |
| `mfa` | MFA | `queue` (+ SSE), `identity`, `documents`, `ops` (Stream, Day-Lifecycle, Settings-Subset, Pairing-confirm) |
| `tv` | Wartezimmer | `GET /queue`, `GET /queue/stream`, `ops/device/presence`/`stream` |
| `room-panel` | Raum-Tablet | Auth room-panel, `GET /queue` (+ SSE), Transitions eingeschränkt |
| `captive` | Gateway-Bridge (Lab/Adapter) | `sessions/verify-ticket-code` |
| `ops` | IT-Settings | Settings-Subset (CSV/SMS/Profil/Routing), Messaging, Maintenance, Outbox |
| Portal | Patienten-Web | `sessions/*`, `patient-documents/*` — Session-Bearer, kein `ClientRole`-Eintrag |

**Harte Regeln:**

- `identity/*` nie für `terminal`, `tv`, `captive`
- Dokument-Aktionen (`preview`, `discard`, `export-filesystem`) nur `mfa`
- `PATCH /ops/settings`: `mfa` = Themen/Räume/Betrieb/Terminal-Flags; `ops` = CSV-Lookup, `smsProvider`, `practiceProfile`, `routingMode` — fremde Keys → 403 (`ops-settings-patch-by-role.ts`)
- `topics` und `rooms` ersetzen jeweils die **gesamte** Liste (kein partielles Merge)
- `triageLevel`: nur MFA (`cycle_triage`); TV sieht keinen Triage-Status
- `identityRef`: MFA `PATCH …/identity-ref` (Namenshinweis CSV/eGK/manuell)

## 4. Raum-Panel

Vertrag: `openapi/auth.yaml`, `openapi/queue.yaml`. Enrollment einmalig mit der **gemeinsamen Raum-Panel-PIN** (außen und innen). Danach PIN-frei bis Widerruf (Cookie 365d, gleitendes Max-Age). Mehrere aktive Freigaben pro Raum+Placement.

| Endpoint | Zugang | Zweck |
| --- | --- | --- |
| `GET /auth/room-panel/rooms` | öffentlich | Placements zum Enrollment (`requiresPin` immer true) |
| `POST /auth/room-panel/login` | öffentlich | Cookie; Body `roomId`, `placement`, **PIN Pflicht** |
| `GET /queue` | `room-panel` | Snapshot inkl. `capabilities` / Actions |
| `GET /queue/stream` | `room-panel` | SSE `snapshot` + `session-revoked` |
| `POST /queue/:visitId/transition` | `room-panel` | nur `check_in_room`, `check_out_room`, `call` |

UI-Buttons aus Snapshot-Actions (`canArrive`, `canCheckOut`, `canCall`); Server bleibt autoritativ. `capabilities.callAnnouncementReachable` steuert Aufruf bei offline WZ-TV. MFA listet und entkoppelt Freigaben über `GET/POST /ops/device-authorizations`.

Fehler: Transition **403** = Capability/Scope (Snapshot refresh) · **409** = TV offline / Capacity / Race · Queue **401/403** = Enrollment (Raum/Placement aus oder Grant weg). Netzwerk/5xx kein Re-Enrollment.

Group-Revoke: Raum aus → alle Panels des Raums; Placement aus → dieses Placement; gemeinsame PIN geändert → alle Panels; Relogin-Hotspot → nur diese Freigabe.

Details: [`../flows.md`](../flows.md) § Flow 5 · Raum-Scope [`domain.md`](domain.md) §3.

## 5. Patient-Portal-Session

- `POST /sessions/resolve-ticket`: Wartenummer reicht — **kein** zweiter Faktor (bewusste Entscheidung)
- Eine aktive Session pro Ticket; Token-Ownership auf Portal-Endpunkten
- Formular (`POST /patient-documents/forms`): Session danach serverseitig geschlossen
- Upload: Session endet per TTL (`SESSION_TTL_MINUTES`, Default 30), nicht nach jedem Upload

Details: [`../flows.md`](../flows.md) § Portal-Session-Lebensdauer.

## 6. Check-in-Guards

- MFA steuert Betrieb über Terminal-Sperre / Empfang (keine globale Zeitsteuerung als Workflow)
- Thema deaktiviert / außerhalb Zeitfenster → `409 TOPIC_DISABLED` / `TOPIC_CLOSED`
- Nummernkreis: `laneCode` — [`domain.md`](domain.md)

## 7. Echtzeit (Kurz)

SSE beobachten, REST mutieren — [`realtime.md`](realtime.md).

| Kanal | Rollen | Inhalt |
| --- | --- | --- |
| `GET /queue/stream` | `mfa`, `tv`, `room-panel` | Queue live (View je Rolle) |
| `GET /ops/stream` | `mfa` | Notfall, `device.presence`, `device.pairing` |
| `GET /ops/device/stream` | `tv`, `terminal` | Device-Liveness |

**Presence ≠ Pairing.** Outbox = Audit, kein Push-Bus — ebenfalls [`realtime.md`](realtime.md).

## 8. Abgrenzung / Discovery

| Thema | Stand |
| --- | --- |
| `POST /identity/egk-lookup` | skizziert in OpenAPI-Doku — kein produktiver Endpoint ([`../operations/integrations.md`](../operations/integrations.md)) |
| Internet-Portal / Captive-Produkt | nicht Produkt; LAN-TLS schon — [`../operations/tls.md`](../operations/tls.md) |
