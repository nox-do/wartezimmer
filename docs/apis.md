# API — Rollen & Regeln

**Vertrag (maschinenlesbar):** `openapi/*.yaml` · Bundle: `openapi/bundle.json` · Swagger: `/api/docs` · Codegen: `npm run generate:api`

Diese Datei ergänzt OpenAPI um **Rollen**, **fachliche Regeln** und **Nicht-Offensichtliches** — keine Endpoint-Liste (steht im Vertrag).

## Prinzipien

- OpenAPI-first: Schema vor Implementierung
- Least privilege pro Client-Rolle
- Kritische Felder nur in autorisierten MFA-Kontexten
- TV bekommt reduzierte Queue-Payload; MFA volle Daten inkl. `documentCount`

## Rollenmatrix (v1)

| Rolle                 | Client         | API-Bereiche                                                                                              |
| --------------------- | -------------- | --------------------------------------------------------------------------------------------------------- |
| `terminal`            | Check-in       | `checkins`, `checkins/assist/*`, `ops/heartbeat`, `ops/device/presence`, optional `ops/emergency/raise` |
| `mfa`                 | MFA-Dashboard  | `queue` (+ SSE), `identity`, `documents`, `ops` (+ Stream, Day-Lifecycle, Check-in-Lock)                  |
| `tv`                  | Wartezimmer    | `GET /queue`, `GET /queue/stream`, `ops/device/presence`                                                  |
| `captive`             | Gateway-Bridge | `sessions/verify-ticket-code`                                                                             |
| `patient-web-session` | Portal         | `sessions/*`, `patient-documents/*` (Bearer-Token)                                                        |
| `ops`                 | IT-Settings    | Settings (CSV/SMS-Subset), Messaging, Maintenance, Outbox-Status                                          |

**Regeln:**

- `identity/*` nie für `terminal`, `tv`, `captive`
- Dokument-Aktionen (`preview`, `discard`, `export-filesystem`) nur `mfa`
- `PATCH /ops/settings`: `mfa` = Themen/Räume/Betrieb; `ops` = Kontakt-CSV + `smsProvider` (403 bei falschen Feldern)
- **`topics` und `rooms` ersetzen jeweils die gesamte Liste** (kein partielles Merge)
- **`triageLevel`** am Queue-Eintrag: nur MFA (`POST …/transition` mit `type: cycle_triage`); TV sieht keinen Triage-Status
- **`identityRef`**: MFA schreibt manuellen Anzeigenamen per `PATCH …/identity-ref` (technisches Feld fuer Namenshinweis aus CSV/eGK)

## Patient-Portal-Session (v1)

- `POST /sessions/resolve-ticket`: Wartenummer reicht — **kein zweiter Faktor** (bewusste v1-Entscheidung)
- Eine aktive Session pro Ticket; Token-Ownership auf allen Portal-Endpunkten
- **Formular** (`POST /patient-documents/forms`): Session danach serverseitig geschlossen
- **Upload**: Session endet per TTL (`SESSION_TTL_MINUTES`, Default 30), nicht nach jedem Upload

Details: [`flows.md`](flows.md) § Portal-Session-Lebensdauer

## Check-in-Guards

- Globale Zeitsteuerung ist kein v1-Workflow; die MFA steuert den Betrieb über Terminal-Sperre und Empfang.
- Thema deaktiviert / außerhalb Zeitfenster → `409 TOPIC_DISABLED` / `TOPIC_CLOSED`
- Nummernkreis pro Thema: `laneCode` (A–Z), mehrere Themen dürfen denselben Buchstaben teilen

## Echtzeit

SSE für Beobachtung, REST für Mutationen. Leitdokument: [`realtime-streams.md`](realtime-streams.md)

| Kanal                    | Rolle            | Inhalt                                       |
| ------------------------ | ---------------- | -------------------------------------------- |
| `GET /queue/stream`      | `mfa`, `tv`      | Warteschlange live                           |
| `GET /ops/stream`        | `mfa`            | Notfall, `device.presence`, `device.pairing` |
| `GET /ops/device/stream` | `tv`, `terminal` | Device-Liveness                              |

**Presence ≠ Pairing** — getrennte States, nicht vermischen.

## Interne Events

Outbox für Audit/async Nacharbeit: [`events.md`](events.md)

## Geplant (nicht in v1)

- `POST /identity/egk-lookup`
- Portal HTTPS / Reverse-Proxy — [`plan-proxy-container.md`](plan-proxy-container.md) (P6: nur Portal extern)
