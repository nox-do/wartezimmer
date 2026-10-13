# API — Rollen & Regeln

**Vertrag (maschinenlesbar):** `openapi/*.yaml` · Bundle `openapi/bundle.json` · Swagger `/api/docs` · `npm run generate:api`

**Scope:** Rollen, Least Privilege, fachliche Regeln, Nicht-Offensichtliches — **keine** Endpoint-Liste.  
Nicht: Domäne → [`domain.md`](domain.md) · SSE-Detail → [`realtime.md`](realtime.md) · Flows → [`../flows.md`](../flows.md)

## 1. Prinzipien

- OpenAPI-first: Schema vor Implementierung
- Least Privilege pro Client-Rolle (`ROUTE_ACCESS_RULES`)
- Kritische Felder nur in MFA-Kontexten
- TV: reduzierte Queue-Payload; MFA: volle Daten inkl. `documentCount`

Auth-Mechanismen:

| Mechanismus                             | Wer                                                                                |
| --------------------------------------- | ---------------------------------------------------------------------------------- |
| Staff-Session-Cookie + `x-client-role`  | `mfa`, `ops` (Idle-/Absolute-TTL)                                                  |
| Gerätefreigabe-Cookie + `x-client-role` | `terminal`, `tv`, `room-panel` (Hash in `device_authorizations`, kein Staff-TTL)   |
| Bearer = `AUTH_KEY_CAPTIVE`             | Rolle `captive` (Captive-Adapter-Hook; S2S)                                        |
| Bearer = Patient-Session-Token          | Portal (`session-auth`); ACL oft `public: true`, Ownership im Handler              |
| Loopback Maintenance `:8082`            | Snapshot/Import — nicht LAN ([`../operations/backup.md`](../operations/backup.md)) |

SoT der ACL: `app/src/auth/route-access-rules.ts` (nicht diese Datei).

### Auth-Slots und Login-Verhalten

#### Cookie-Slots

Eine Cookie-Rolle besitzt genau einen Slot. Der Header `X-Client-Role` wählt diesen Slot,
verleiht aber keine Rolle; maßgeblich bleibt die serverseitige Session.

| Rolle        | Cookie                       | Erzeugung        |
| ------------ | ---------------------------- | ---------------- |
| `mfa`        | `pf_mfa_session`             | Staff-PIN-Login  |
| `ops`        | `pf_ops_session`             | Staff-PIN-Login  |
| `room-panel` | `pf_room_panel_session`      | Room-Panel-Login |
| `tv`         | `pf_tv_device_session`       | Device-Pairing   |
| `terminal`   | `pf_terminal_device_session` | Device-Pairing   |

`pf_staff_session` ist ein nicht mehr akzeptierter Legacy-Name; der Resolver liest ihn nicht
(`401 AUTH_UNAUTHORIZED`).

Room-Panel, MFA, Ops, TV und Terminal können mit ihren getrennten Slots im selben Browser
koexistieren. Mehrere Room-Panel-Sessions im selben Browser bleiben bewusst ausgeschlossen,
weil sie weiterhin einen gemeinsamen Slot verwenden.

#### Guard

Die Auflösungsreihenfolge ist fest:

1. Gültigen Captive-Bearer auswerten; Cookies und Rollenheader werden dann ignoriert.
2. Unveränderten Local-TV-Bypass prüfen.
3. Bei Cookie-Authentifizierung den ausschließlich durch `X-Client-Role` gewählten Slot lesen.
4. Session-Art und serverseitige Rolle gegen den gewählten Slot und die Route prüfen.

| Fall                                                                        | Ergebnis                  |
| --------------------------------------------------------------------------- | ------------------------- |
| Geschützte Route mit Session-Cookie, aber ohne/mit unbekanntem Rollenheader | `400 INVALID_ARGUMENT`    |
| Bekannter Slot ohne gültige passende Session                                | `401 AUTH_UNAUTHORIZED`   |
| Gültige Session, aber Rolle für Route nicht zugelassen                      | `403 AUTH_FORBIDDEN`      |
| Gültiger Captive-Bearer ohne Rollenheader                                   | unverändert zugelassen    |
| `AUTH_ENABLED=false`                                                        | kein Cookie-/Header-Check |

Unsafe Cookie-Mutationen behalten den Origin-Check. Es gibt keinen Fallback auf einen anderen
Cookie-Slot und keine implizite Auswahl, wenn nur ein Cookie vorhanden ist.

#### Login und Logout

Staff-Login verlangt `{ role: "mfa" | "ops", pin }` und schreibt ausschließlich den
passenden Slot.

`POST /api/v1/auth/logout` ist scoped und idempotent:

- `X-Client-Role` ist erforderlich; fehlend oder unbekannt ergibt `400 INVALID_ARGUMENT`.
- Nur der gewählte Slot wird widerrufen und dessen Cookie gelöscht.
- Fehlende, abgelaufene oder bereits widerrufene Sessions ergeben weiterhin `200 { ok: true }`.
- Room-Panel-Logout beendet dadurch keine MFA-/Ops-Session mehr.

#### UI und OpenAPI

- `staffAuthSlots.mfa` und `staffAuthSlots.ops` halten den UI-Auth-State unabhängig.
- MFA-Module verwenden `mfaAuthFetch`, Ops-Module `opsAuthFetch`; ein `401` setzt nur
  den zugehörigen Slot auf anonym.
- Geräte und Room-Panel senden ihre feste Rolle weiterhin explizit.
- `/queue/stream` und `/ops/stream` im MFA-Dashboard senden `X-Client-Role: mfa`.
- `loadAuthSession(role)` prüft den angeforderten Slot auch beim Wechsel zwischen MFA und Ops.
- OpenAPI beschreibt Cookie-Scheme, Rollenheader und tatsächliche ACL pro Operation;
  Documents verwendet für MFA keinen alten API-Key-Bearer mehr.

## 2. Codegen (nach OpenAPI-Änderung)

**Source of Truth:** `openapi/*.yaml` (nicht die generierten Dateien handeditieren).

```bash
npm run generate:api
```

Das orchestriert:

| Schritt         | Script                       | Output                                       |
| --------------- | ---------------------------- | -------------------------------------------- |
| Bundle          | `bundle:openapi`             | `openapi/bundle.json`                        |
| Fastify-Schemas | `generate:api-schemas`       | `app/src/api/generated/*.fastify-schemas.ts` |
| App-Typen       | `generate:app-openapi-types` | `app/src/api/*-openapi-types.ts`             |
| UI-Typen        | `generate:openapi-types`     | `ui/src/lib/**/openapi-types.ts`             |

Zwei Zielgruppen, **kein** gemeinsames Generated-Package. Swagger UI: `/api/docs` nur Dev/local (Override `OPENAPI_DOCS_ENABLED`); Production-Image ohne `openapi/bundle.json` und ohne Swagger-Deps.

**Drift-Checks** (Teil von `npm run typecheck` / `check:drift`): Bundle, Fastify-Schemas, App-/UI-Typen, Route-Sync, Auth-Route-Rules — bei Drift erneut `generate:api` (bzw. den genannten Teilschritt). Contract-Smoke gegen Bundle: `npm run smoke:openapi-contract`.

Neue/geänderte Routen: YAML → `generate:api` → Handler an Schema/Typen → ACL in `route-access-rules.ts` mitziehen.

## 3. Rollenmatrix

| Rolle        | Client                     | typ. API-Bereiche                                                                                         |
| ------------ | -------------------------- | --------------------------------------------------------------------------------------------------------- |
| `terminal`   | Check-in                   | `checkins`, `checkins/assist/*`, `ops/heartbeat`, `ops/device/presence`/`stream`, `ops/emergency/raise`   |
| `mfa`        | MFA                        | `queue` (+ SSE), `identity`, `documents`, `ops` (Stream, Day-Lifecycle, Settings-Subset, Pairing-confirm) |
| `tv`         | Wartezimmer                | `GET /queue`, `GET /queue/stream`, `ops/device/presence`/`stream`                                         |
| `room-panel` | Raum-Tablet                | Auth room-panel, `GET /queue` (+ SSE), Transitions eingeschränkt                                          |
| `captive`    | Captive-Adapter (S2S-Hook) | `sessions/verify-ticket-code` (noch kein Vendor; Key trotzdem Pflicht bei Auth)                           |
| `ops`        | IT-Settings                | Settings-Subset (CSV/SMS/Profil/Routing), Messaging, Maintenance, Outbox                                  |
| Portal       | Patienten-Web              | `sessions/*`, `patient-documents/*` — Session-Bearer, kein `ClientRole`-Eintrag                           |

**Harte Regeln:**

- `identity/*` nie für `terminal`, `tv`, `captive`
- Dokument-Aktionen (`preview`, `discard`, `export-filesystem`) nur `mfa`
- `PATCH /ops/settings`: `mfa` = Themen/Räume/Betrieb/Terminal-Flags/`journeySettings`; `ops` = CSV-Lookup, `smsProvider`, `practiceProfile`, `routingMode` — fremde Keys → 403 (`ops-settings-patch-by-role.ts`). Routing-Modi/Journeys: [`routing.md`](routing.md)
- `topics` und `rooms` ersetzen jeweils die **gesamte** Liste (kein partielles Merge)
- `triageLevel`: nur MFA (`cycle_triage`); TV sieht keinen Triage-Status
- `identityRef`: MFA `PATCH …/identity-ref` (Namenshinweis CSV/eGK/manuell)

## 4. Raum-Panel

Vertrag: `openapi/auth.yaml`, `openapi/queue.yaml`. Enrollment einmalig: **innen** mit gemeinsamer Raum-Panel-PIN, **außen** ohne PIN. Danach PIN-frei bis Widerruf (Cookie 365d, gleitendes Max-Age). Mehrere aktive Freigaben pro Raum+Placement.

| Endpoint                          | Zugang       | Zweck                                                    |
| --------------------------------- | ------------ | -------------------------------------------------------- |
| `GET /auth/room-panel/rooms`      | öffentlich   | Placements zum Enrollment (`requiresPin` laut Placement) |
| `POST /auth/room-panel/login`     | öffentlich   | Cookie; Body `roomId`, `placement`; **PIN nur innen**    |
| `GET /queue`                      | `room-panel` | Snapshot inkl. `capabilities` / Actions                  |
| `GET /queue/stream`               | `room-panel` | SSE `snapshot` + `session-revoked`                       |
| `POST /queue/:visitId/transition` | `room-panel` | nur `check_in_room`, `check_out_room`, `call`            |

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

| Kanal                    | Rollen                    | Inhalt                                       |
| ------------------------ | ------------------------- | -------------------------------------------- |
| `GET /queue/stream`      | `mfa`, `tv`, `room-panel` | Queue live (View je Rolle)                   |
| `GET /ops/stream`        | `mfa`                     | Notfall, `device.presence`, `device.pairing` |
| `GET /ops/device/stream` | `tv`, `terminal`          | Device-Liveness                              |

**Presence ≠ Pairing.** Outbox = Audit, kein Push-Bus — ebenfalls [`realtime.md`](realtime.md).

## 8. Abgrenzung / Discovery

| Thema                             | Stand                                                                                                                    |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `POST /identity/egk-lookup`       | skizziert in OpenAPI-Doku — kein produktiver Endpoint ([`../operations/integrations.md`](../operations/integrations.md)) |
| Internet-Portal / Captive-Produkt | nicht Produkt; LAN-TLS schon — [`../operations/tls.md`](../operations/tls.md)                                            |
