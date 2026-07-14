# Plan: Auth-Session-Slots (Rolle ↔ Cookie)

Stand: 2026-07-13  
Status: **Implementiert** (Phase 1+2, 2026-07-14) — Phase 3 (MFA-Realtime) offen.

Dieses Dokument klärt Ausgangslage, Zielmodell, Blast Radius und einen **gestrafften**
Phasenplan, bevor Cookie- und Session-Handling umgebaut werden.

**Breaking Change ist bewusst akzeptabel.** Keine Kompatibilitäts-/Migrationsschicht
für alte Staff-Cookies oder headerlose geschützte Requests (Details §8).

Verwandt: [`apis.md`](apis.md), [`realtime-streams.md`](realtime-streams.md),
Vertrag `openapi/auth.yaml`, Implementierung `app/src/routes/auth-routes.ts`,
`app/src/auth/*`.

---

## 1. Problem

Staff-, Room-Panel- und Geräte-Sessions sind organisch unter `/api/v1/auth/*` gewachsen.
Funktional (PIN → opaque Cookie → Role-Guard) ist das konsistent; strukturell und im
Cookie-Handling stoßen Sessions sich:

1. **MFA und Ops teilen ein Cookie** (`pf_staff_session`) — Login überschreibt den Slot;
   parallele Tabs mit beiden Rollen sind unmöglich.
2. **Logout ist grob** — `POST /auth/logout` widerruft Staff **und** Room-Panel und
   versucht beide Cookies zu löschen. Room-Panel-Logout im gleichen Browser beendet MFA/Ops
   (Cross-Kill).
3. **Resolver ohne Header** priorisiert `staff ?? device ?? room-panel` — mehrere Cookies
   im Browser können sich in die Quere kommen.
4. **`X-Client-Role` halb vorhanden** — gilt heute nur für `terminal` | `tv` | `room-panel`,
   nicht für Staff; Room-Panel sendet den Header beim Logout, der Server ignoriert ihn dort.
5. **Zwei Auth-Welten** — Staff/Geräte = Cookies unter `/auth`; Patient/Captive = Bearer
   unter `/sessions`. Das bleibt so; dieses Dokument betrifft nur Cookie-Sessions.

Device-Pairing (TV/Terminal) ist bereits näher am Zielmodell (eigene Cookies + Header
als Selektor) und bleibt ein mehrstufiger Ablauf, kein PIN-Login.

---

## 2. Ist-Zustand

### 2.1 Cookie- und Rollenmodell

| Cookie | Kind | Erzeugung | Selektion heute |
| ------ | ---- | --------- | ---------------- |
| `pf_staff_session` | MFA **oder** Ops (Rolle nur in der Session) | `POST /api/v1/auth/login` | Cookie allein; **kein** Staff-`X-Client-Role` |
| `pf_room_panel_session` | room-panel | `POST /api/v1/auth/room-panel/login` | `X-Client-Role: room-panel` (ohne Header gewinnt Staff) |
| `pf_tv_device_session` | tv | Pairing-Poll `GET …/tv/pairing/:id` | `X-Client-Role: tv` |
| `pf_terminal_device_session` | terminal | Pairing-Poll | `X-Client-Role: terminal` |

Sessions: in-memory opaque Tokens (`StaffSessionManager`), Cookie hält Roh-Token,
Store keyed by `sha256(token)`. Kein JWT, kein Refresh-Token-Endpoint.

**Wichtig — Room-Panel-Koexistenz ist eingeschränkt:**

- `pf_room_panel_session` kann mit Staff-Cookies (und Geräte-Cookies) im gleichen Browser
  **nebeneinander** liegen.
- **Mehrere Raum-Panels können nicht parallel koexistieren:** Sie teilen denselben
  Cookie-Slot. Ein neuer Panel-Login widerruft die vorherige Panel-Session und
  überschreibt das Cookie. Isolation hier bedeutet „Panel vs. Staff/Geräte“, nicht
  „mehrere Panels gleichzeitig“.

### 2.2 Auth-HTTP-Oberfläche heute

| Method | Path | Zugang | Zweck |
| ------ | ---- | ------ | ----- |
| `POST` | `/api/v1/auth/login` | public | Staff PIN (`role`: `mfa`\|`ops`) → `pf_staff_session` |
| `GET` | `/api/v1/auth/me` | `mfa`, `ops` | aktuelle Staff-Session |
| `POST` | `/api/v1/auth/logout` | public | widerruft Staff **und** Room-Panel; versucht beide Cookies zu clearen |
| `GET` | `/api/v1/auth/room-panel/rooms` | public | enabled Panels |
| `POST` | `/api/v1/auth/room-panel/login` | public | Panel-Login → `pf_room_panel_session` |
| `POST` | `/api/v1/auth/pin/change` | `mfa`, `ops` | PIN-Wechsel (Ziel abhängig von Session) |
| `POST/GET` | `/api/v1/auth/{tv\|terminal}/pairing/*` | start/poll public; confirm `mfa` | Device-Pairing |

Hinweis: OpenAPI beschreibt Logout eher als „Staff-Cookie“; die Implementierung löscht
zusätzlich das Room-Panel. Zwei sequenzielle `Set-Cookie`-Clears in einer Response können
einander überschreiben — nach **gescoptem** Logout irrelevant (nur noch ein Clear);
nur prüfen, nicht vorsorglich „reparieren“.

### 2.3 Guard

- Global: `registerClientAuth` → `ROUTE_ACCESS_RULES` (method + path).
- Bearer Captive-Key schlägt Cookies.
- `X-Client-Role`: **Cookie-Selektor**, keine Autorität — Rolle kommt aus der Server-Session.
- Unsafe Methods mit Cookie: Origin-Check.

### 2.4 UI / Manager heute

| Client | Session-Verhalten |
| ------ | ----------------- |
| MFA / Ops UI | `session-client.ts`: Login mit `role` (optional, Default `mfa`); `/me` **ohne** Role-Header; **kein** Logout-Client |
| Session-State | `authSession` hält genau **eine** geladene Rolle; lädt neu nur bei Status `idle` |
| `cookieAuthFetch` | Credentials + Origin; **kein** `X-Client-Role` für Staff |
| Room-Panel | eigene Login-Route; Logout → `/auth/logout` + `X-Client-Role: room-panel` (Header bereits gesendet) |
| Terminal / TV | Pairing; API/SSE mit `X-Client-Role` |
| MFA-Dashboard Streams | konsumiert u. a. `/api/v1/ops/stream` — fachlich **MFA**, nicht Ops-IT |
| Manager | **keine** `pf_*`-Cookies; nur PIN-Reset über Setup/Maintenance |

---

## 3. Zielmodell

### 3.1 Prinzip

**Eine Rolle ↔ genau ein Cookie-Slot.**  
Logout (und nach Phase 2 auch Me/geschützte Requests) operieren immer auf **einem** Slot.
Kein generisches „lösche alles, was der Browser mitsendet“.

**`X-Client-Role` wählt den Slot, verleiht keine Rolle.**  
`X-Client-Role: ops` ist nur Ops, wenn eine gültige `pf_ops_session` existiert.

HTTP-Semantik behalten — **kein** RPC `{ action: "login" | "logout" | "me" }`.

Staff-Login behält `{ role, pin }`. Room-Panel-Login bleibt eine **eigene** Route
(andere Payload, Rate-Limits, Raumprüfung) — keine Login-Union.

### 3.2 Cookie-Matrix (Ziel, ab Phase 2)

| Rolle | Cookie |
| ----- | ------ |
| `mfa` | `pf_mfa_session` |
| `ops` | `pf_ops_session` |
| `room-panel` | `pf_room_panel_session` *(unverändert; ein Slot für alle Panels)* |
| `tv` | `pf_tv_device_session` *(unverändert)* |
| `terminal` | `pf_terminal_device_session` *(unverändert)* |

### 3.3 HTTP nach Phasen

**Phase 1 — nur Logout scoped (idempotent):**

```http
POST /api/v1/auth/logout
X-Client-Role: room-panel
→ 200 { ok: true }
→ widerruft (falls Session da) und lässt nur pf_room_panel_session ablaufen
```

Auch ohne / mit abgelaufenem / bereits widerrufenem Cookie: weiterhin **200**
(siehe §3.6). `/auth/me`, Login und übrige Auth-Auflösung bleiben unverändert.

**Phase 2 — Staff-Slots + verpflichtender Header:**

```http
POST /api/v1/auth/login
{ "role": "mfa", "pin": "1234" }
→ Set-Cookie: pf_mfa_session=…   (nur dieser Slot; clear pf_staff_session)

GET /api/v1/auth/me
X-Client-Role: mfa
→ liest nur pf_mfa_session

POST /api/v1/auth/logout
X-Client-Role: mfa
→ widerruft und löscht nur pf_mfa_session
  (optional: clear altes Cookie-Namensrelikt `pf_staff_session`)
```

### 3.4 Pairing bleibt separat

TV-/Terminal-Pairing: `start → confirm → poll`. Eigene Routen bleiben.

### 3.5 `X-Client-Role`-Politik

**Gilt nur bei Cookie-Authentifizierung.** Captive/Gateway mit gültigem Bearer braucht
keinen Rollenheader. Guard-Reihenfolge bleibt:

1. Gültiger Bearer auswerten (z. B. captive) → Cookies und Role-Header ignorieren.
2. Sonst Cookie-Slot-Selektion über `X-Client-Role`.

Keine Ausnahme „wenn genau ein Slot belegt ist“.

| Situation | Verhalten |
| --------- | --------- |
| Cookie-geschützte Route **ohne** / mit unbekanntem `X-Client-Role` | **400** `INVALID_ARGUMENT` |
| Mit bekannter Rolle → ausschließlich passenden Cookie-Slot lesen | Session vorhanden → Rolle aus Session |
| Cookie fehlt / abgelaufen / role mismatch auf **fachlicher** Route | **401** `AUTH_UNAUTHORIZED` |
| Fallback zwischen Rollen | **kein** |
| Öffentliche Login-/Pairing-/Profil-Routen | kein Role-Header nötig |
| Bearer-Pfad (captive) | kein Role-Header nötig |

Phase 1: Header-Regeln gelten nur für **Logout** (siehe §3.6). Übrige Routen unverändert
bis Phase 2.

### 3.6 Logout: idempotent + feste Statuscodes

Logout ist **kein** fachlicher Auth-Check. Es räumt einen Slot auf.

| Fall | Response |
| ---- | -------- |
| Fehlender oder unbekannter `X-Client-Role` | **400** `INVALID_ARGUMENT` |
| Bekannte Rolle, Session fehlt / abgelaufen / schon widerrufen | **200** `{ ok: true }` + Cookie des Slots trotzdem ablaufen lassen |
| Bekannte Rolle, gültige Session | **200** `{ ok: true }` + revoke + Cookie clear |

Raum-Panel-Recovery ruft Logout oft **nach** einem Sessionfehler auf. Wenn Logout dann
selbst 401 liefert, bricht die Recovery unnötig. Deshalb: nur der Header entscheidet
über Fehler; fehlende Session ist Erfolg.

**Statuscodes festgezogen** (nicht bis zur Implementierung offen):

- Logout Header-Fehler → **400** `INVALID_ARGUMENT`
- Fachroute ohne gültige Cookie-Session (bzw. ohne erforderlichen Header ab Phase 2) → **401** `AUTH_UNAUTHORIZED`

---

## 4. Was bewusst nicht Ziel ist

- Kein OAuth/OIDC, kein JWT-Layer in v1.
- Kein Zusammenlegen mit Patient-`/sessions/*`.
- Kein Falten von Room-Panel-Login in eine große Login-Union (kaum Produktnutzen).
- Keine Cookie-/Header-Migration und kein Dual-Read von `pf_staff_session` (siehe §8).
- Kein „Logout löscht alle Geräte-Cookies“, außer explizit `X-Client-Role: tv|terminal`.
- Kein Manager-Session-Modell.
- Keine parallelen Room-Panel-Sessions im gleichen Browser (ein Cookie-Slot bleibt).
- Keine implizite Globalrolle in `cookieAuthFetch` (Importzyklus Session-State ↔ Fetch);
  stattdessen rollenfeste Wrapper `mfaAuthFetch` / `opsAuthFetch` (siehe §5.3).

---

## 5. Blast Radius

### 5.1 Übersicht

| Bereich | Phase 1 | Phase 2 | Anmerkung |
| ------- | ------- | ------- | --------- |
| Manager | — | — | keine Cookie-Sessions |
| `POST /auth/logout` | ● | ● | scoped, idempotent, Header → 400 sonst |
| `/auth/me`, Staff-Guard, OpenAPI | — | ● | Cookie-Auth → Header Pflicht |
| UI Room-Panel | △ | — | Header schon da; Recovery braucht idempotenten Logout |
| UI MFA/Ops Module | — | ● | alle Cookie-Calls via `mfaAuthFetch` / `opsAuthFetch` |
| MFA SSE inkl. `/ops/stream` | — | ● | immer `X-Client-Role: mfa` |
| TV/Terminal | — | △ | Header schon; Guard strenger bei Cookie |
| Captive Bearer | — | — | **kein** Role-Header |
| Smoke / Contract / inject-Tests | ● Logout | ● | siehe §5.5 |
| Docs | ● | ● | |

### 5.2 Server-Touchpoints

| Datei | Phase |
| ----- | ----- |
| `app/src/routes/auth-routes.ts` (Logout) | 1 |
| `app/src/auth/staff-session-cookies.ts` | 1 / 2 |
| `app/src/auth/client-auth.ts` | 2 (Cookie → Header Pflicht; Bearer zuerst) |
| OpenAPI siehe §5.6 | 1 Logout; 2 Split + Header |
| Generated API types | bei OpenAPI-Änderung |

### 5.3 UI-Touchpoints (Phase 2) — größer als nur Layout/SSE

`selectedRole` + `loadAuthSession(role)` bleiben. **Alle** geschützten Cookie-Aufrufe
müssen die Rolle senden — nicht nur Layout und Streams.

**Kein** implizites Auslesen der Rolle aus dem Session-State in `cookieAuthFetch`
(verschärft Importzyklen `session-state` ↔ `session-client` ↔ Fetch). Stattdessen
**rollenfeste Wrapper**:

```ts
mfaAuthFetch(...)  // setzt X-Client-Role: mfa
opsAuthFetch(...)  // setzt X-Client-Role: ops
```

Fachmodule importieren den passenden Wrapper. Komponenten setzen den Header nicht
an 30 Stellen von Hand. `cookieAuthFetch` bleibt low-level (Credentials/401-Hook);
optional nimmt es weiterhin einen expliziten `clientRole`-Parameter für Geräte/Panel.

**Mind. umzustellende Gruppen (Cookie → MFA, sofern MFA-UI):**

| Gruppe | Beispiele |
| ------ | --------- |
| Session | `/auth/me`, PIN-Wechsel |
| Queue-Aktionen | Transitions, callback-phone, identity-ref, … |
| Dokumente | Liste, preview, discard, rename, export |
| Identity / MFA-Check-in | mfa-lookup, phone-dob, checkins |
| Emergency | ack (MFA) |
| Ops-Settings aus MFA-/Ops-UI | settings, messaging, … — Wrapper je nach Oberfläche |
| Device-Pairing-Confirm | `device-pairing-client.ts` → `confirmDevicePairing` (heute `cookieAuthFetch` ohne Header) |
| Staff-SSE | Queue-Stream, `/ops/stream` (**mfa**), ggf. weitere |

Ops-UI: durchgängig `opsAuthFetch`. Room-Panel/Terminal/TV behalten bestehende
rollenfeste Header (analog zu Wrappern).

### 5.4 Same-Origin

| Kombination | Heute | Nach Phase 1 | Nach Phase 2 |
| ----------- | ----- | ------------ | ------------ |
| MFA + Ops | ein Cookie, Überschreiben | unverändert | parallele Cookies + Header |
| MFA/Ops + Room-Panel | Panel-Logout killt Staff | scoped, idempotenter Logout | + Cookie-Header-Pflicht |
| Mehrere Room-Panels | ein Slot, Login ersetzt | unverändert | unverändert |
| MFA + TV/Terminal | Header-Selektion | unverändert | Cookie → Header überall |
| Captive Bearer | kein Role-Header | unverändert | unverändert |

### 5.5 Smoke-, Contract- und App-Tests

Nicht nur Produktiv-UI. Phase 2 trifft zentral:

| Artefakt | Arbeit |
| -------- | ------ |
| `scripts/smoke-helpers.mjs` | `applyAuthHeaders`: bei `auth.kind === 'session' \|\| auth.kind === 'device'` → `headers['x-client-role'] = auth.role`; Captive/Bearer ohne Role-Header |
| `scripts/smoke-ops-stream.mjs` | eigene Stream-Fetches prüfen / Header setzen |
| OpenAPI-Contract-Smoke | Security + Header-Parameter |
| `app` inject-Tests | grob **>50** Cookie-Requests; viele brauchen nach Phase 2 einen Header |

Phase-1-Tests mindestens: scoped Room-Panel-Logout; Logout ohne Header → 400;
Logout mit Header aber ohne Session → 200.

### 5.6 OpenAPI (konkret, mehr als `auth.yaml`)

Mindestens betroffen:

- `openapi/auth.yaml`
- `openapi/checkin.yaml`
- `openapi/identity.yaml`
- `openapi/queue.yaml`
- `openapi/ops.yaml`
- geschützte MFA-Operationen in `openapi/documents.yaml`

Phase 2:

- `pf_staff_session` → getrennte Schemes `pf_mfa_session` / `pf_ops_session`.
- MFA-/Ops-gemeinsame Operationen: Security-Schemes als **Alternativen**.
- Erforderlicher Header `X-Client-Role` im Vertrag (Parameter/Header-Komponente).
- `StaffLoginRequest.role` wird **required** (kein Default auf `mfa` — widerspricht
  dem expliziten Slotmodell).

Phase 1: Logout-Doku (Header Pflicht, idempotent, 400 vs 200).

---

## 6. Entscheidungen (festgezogen)

| # | Entscheidung | Status |
| - | ------------ | ------ |
| 1 | MFA + Ops parallel (Phase 2) | **ja** |
| 2 | Bei **Cookie-Auth**: `X-Client-Role` Pflicht; kein Rollen-Fallback; Bearer zuerst, ohne Role-Header | **ja** |
| 3 | Phase 1 = **nur** Logout; `/auth/me` unverändert | **ja** |
| 4 | Room-Panel-Login-Union | **gestrichen** |
| 5 | `pf_staff_session` | **Breaking** — nicht lesen; höchstens clearen |
| 6 | Set-Cookie-Append | nur prüfen; nach scoped Logout irrelevant |
| 7 | `/ops/stream` MFA-Dashboard | immer `X-Client-Role: mfa` |
| 8 | Logout idempotent; Header-Fehler **400** `INVALID_ARGUMENT`; fehlende Session → **200** | **ja** |
| 9 | Fachroute ohne Session → **401** `AUTH_UNAUTHORIZED` | **ja** |
| 10 | UI: `mfaAuthFetch` / `opsAuthFetch`, keine implizite Globalrolle in `cookieAuthFetch` | **ja** |
| 11 | `StaffLoginRequest.role` in Phase 2 **required** | **ja** |

---

## 7. Phasenplan

### Phase 1 — Cross-Kill beheben

Ziel: Room-Panel-Logout beendet Staff nicht mehr.

Nur Logout — schmaler Schnitt:

1. `POST /auth/logout` wertet `X-Client-Role` aus.
2. `room-panel` → widerruft (falls vorhanden) und lässt **ausschließlich**
   `pf_room_panel_session` ablaufen.
3. Andere am Logout angesprochene Rollen ebenfalls nur **ihren** Slot.
4. Fehlender / unbekannter Header → **400** `INVALID_ARGUMENT`.
5. Bekannte Rolle ohne / mit toter Session → **200** `{ ok: true }` + Cookie clear
   (idempotent; Room-Panel-Recovery).
6. `/auth/me`, Login und übrige Auth-Auflösung bleiben **unverändert**.
7. Room-Panel-Client: keine Änderung nötig (sendet Header bereits).
8. Set-Cookie-Append: nicht separat fixen.
9. Tests: Panel weg / Staff bleibt; ohne Header → 400; mit Header ohne Cookie → 200.
10. OpenAPI: Logout Header + Idempotenz + Statuscodes.

### Phase 2 — MFA und Ops parallel ermöglichen

Ziel: getrennte Staff-Cookies + verpflichtende Rollenbindung in Client und Guard.

**Breaking Change** (kein Compat-Pfad) — siehe §8.

1. `pf_mfa_session` / `pf_ops_session`; `pf_staff_session` wird nicht gelesen.
2. Staff-Login schreibt nur den Slot der `role`; `StaffLoginRequest.role` **required**.
3. Altes `pf_staff_session` höchstens clearen, nie lesen.
4. `X-Client-Role` um `mfa`/`ops` erweitern.
5. **Cookie-Auth**: Header Pflicht, nur passender Slot; **Bearer zuerst**, captive ohne Header.
6. Keine headerlosen Cookie-Fallbacks.
7. UI: `selectedRole` + `loadAuthSession(role)` + **`mfaAuthFetch` / `opsAuthFetch`**
   über alle MFA-/Ops-Cookie-Module (Queue, Docs, Identity, Pairing-Confirm, PIN, SSE, …).
8. MFA-Streams inkl. `/ops/stream` → `X-Client-Role: mfa`.
9. OpenAPI: alle betroffenen YAMLs (§5.6), Security-Alternativen, Header-Parameter, codegen.
10. Smoke: `smoke-helpers.mjs` setzt `x-client-role` aus `auth.role`; Stream-/Contract-Smokes;
    inject-Tests (>50 Cookie-Requests) nachziehen.
11. Tests: Koexistenz; ohne Header auf Cookie-Route → 400; ohne Session → 401;
    alleiniges `pf_staff_session` → abgelehnt.

Nach Deploy: einmal neu anmelden.

### Phase 3 — MFA-Realtime (separater Folge-Schnitt)

**Nicht** Auth-Kosmetik / Login-Union. Eigener Schnitt nach stabilem Session-Slot-Modell:

1. MFA-Streams konsolidieren.
2. Hard-Reload nach Reconnect entfernen.
3. Interne Queue-/Ops-Stores und Hubs getrennt lassen.
4. Rollenbindung der Streams aus Phase 2 beibehalten (`mfa` für Dashboard-Streams).

---

## 8. Breaking Change — keine Migration

Wir brauchen **keine** Migrationsschicht. Ein harter Schnitt ist ok.

Begründung:

- Sessions liegen nur im Speicher; nach Backend-Restart sind Tokens ohnehin ungültig.
- Dual-Read / Compat-Fenster erzeugen Auth-Sondercode ohne echten Nutzen.
- Header-Pflicht und Cookie-Split sind sowieso ein Client-Sync-Punkt.

Beim Rollout (Phase 2):

1. Neue Logins schreiben nur `pf_mfa_session` oder `pf_ops_session`.
2. Resolver akzeptiert `pf_staff_session` **nicht**.
3. Login/Logout dürfen den alten Cookie-Namen höchstens **löschen** (Hygiene gegen
   hängende Browser-Cookies) — das ist kein Lesen und keine Compat-API.
4. Clients müssen `X-Client-Role` senden; headerlose geschützte Requests schlagen fehl.
5. Benutzer melden sich einmal neu an.

Device-/Panel-Cookies bleiben; kein Rename dort.

---

## 9. Testplan (Minimum)

| Phase | Fall | Erwartung |
| ----- | ---- | --------- |
| 1 | Logout `X-Client-Role: room-panel` mit gültiger Session | nur Panel weg; Staff bleibt; **200** |
| 1 | Logout `room-panel`, Cookie fehlt / tot | **200** `{ ok: true }` + Panel-Cookie clear |
| 1 | Logout ohne / unbekanntem Header | **400** `INVALID_ARGUMENT` |
| 2 | Login `role: mfa` dann `role: ops` | beide Cookies; MFA bleibt |
| 2 | Logout `X-Client-Role: mfa` | nur MFA-Slot weg |
| 2 | Cookie-Route ohne Header | **400** |
| 2 | Cookie-Route mit Header, ohne Session | **401** `AUTH_UNAUTHORIZED` |
| 2 | Captive Bearer ohne Role-Header | weiterhin ok |
| 2 | `/me` + `X-Client-Role: ops` | Ops-Session |
| 2 | MFA `/ops/stream` mit Header `mfa` | ok |
| 2 | `pf_staff_session` allein | Breaking: abgelehnt |
| 2 | Pairing-Confirm (MFA) mit Header | ok |
| 2 | Smoke-Helper setzt `x-client-role` | session/device ja; captive nein |

Manuell Phase 1: MFA-Tab offen → Room-Panel Login/Logout → MFA weiter nutzbar.  
Verify: `npm run verify`.

---

## 10. Implementierungs-Checkliste

- [x] Phase 1: scoped, **idempotenter** Logout; Header → 400; ohne Session → 200; Tests + OpenAPI
- [x] Phase 2: Cookie-Split; `pf_staff_session` nicht lesen (Breaking); `role` required
- [x] Phase 2: Guard — Cookie → Header Pflicht; Bearer zuerst ohne Header
- [x] Phase 2: UI `selectedRole` + `mfaAuthFetch` / `opsAuthFetch` in allen Cookie-Modulen
- [x] Phase 2: MFA-Streams inkl. `/ops/stream` → `mfa`; Pairing-Confirm MFA
- [x] Phase 2: OpenAPI auth/checkin/identity/queue/ops/documents + Header + codegen
- [x] Phase 2: Smoke-Helpers / Stream-Smokes / Contract / inject-Tests
- [ ] Phase 3 (später): MFA-Realtime-Konsolidierung
- [x] Status dieses Dokuments aktualisieren

---

## 11. Kurzfazit

Sofort-Fix, Session-Isolation und späteres Realtime sind getrennt:

1. **Phase 1** — scoped, **idempotenter** Logout; `/me` unangetastet.  
2. **Phase 2** — Cookie-Split + Cookie-Header-Pflicht + `mfaAuthFetch`/`opsAuthFetch`;
   Bearer ausgenommen; **Breaking Change**, keine Migration.  
3. **Phase 3** — MFA-Realtime (Streams/Reconnect), keine Login-Union.

Room-Panel: ein Cookie-Slot. `/ops/stream` am MFA-Dashboard: Rolle **mfa**.
Statuscodes: Logout-Header **400**, fachlich ohne Session **401**.
