# Plan: Auth-Session-Slots (Rolle ↔ Cookie)

Stand: 2026-07-13  
Status: **Planung** — Arbeitsdokument, noch keine Implementierung.

Dieses Dokument klärt Ausgangslage, Zielmodell, Blast Radius und einen **gestrafften**
Phasenplan, bevor Cookie- und Session-Handling umgebaut werden.

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

**Phase 1 — nur Logout scoped:**

```http
POST /api/v1/auth/logout
X-Client-Role: room-panel
→ widerruft und löscht nur pf_room_panel_session
```

`/auth/me`, Login und übrige Auth-Auflösung bleiben unverändert.

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
→ widerruft und löscht nur pf_mfa_session (+ clear Legacy-Name)
```

### 3.4 Pairing bleibt separat

TV-/Terminal-Pairing: `start → confirm → poll`. Eigene Routen bleiben.

### 3.5 `X-Client-Role`-Politik (ab Phase 2 zwingend)

Keine Ausnahme „wenn genau ein Slot belegt ist“. Sonst hängt das Request-Verhalten
unsichtbar davon ab, welche weiteren Cookies zufällig im Browser liegen.

| Situation | Verhalten |
| --------- | --------- |
| Geschützte Cookie-Route **ohne** `X-Client-Role` | **401 oder 400** (kontrolliert fehlschlagen) |
| Mit `X-Client-Role` | ausschließlich passenden Cookie-Slot lesen |
| Header gesetzt, Cookie fehlt / Session.role mismatch | unauthenticated |
| Fallback zwischen Rollen | **kein** |

**Ausnahmen** (kein Role-Header nötig): öffentliche Login-, Pairing- und Profil-Routen
sowie explizit öffentliche Endpoints laut `ROUTE_ACCESS_RULES`.

Phase 1 gilt die Pflicht nur für **Logout** (Fehlender Header → kontrolliert fehlschlagen).
Übrige geschützte Routen behalten vorerst das heutige Verhalten, bis Phase 2.

---

## 4. Was bewusst nicht Ziel ist

- Kein OAuth/OIDC, kein JWT-Layer in v1.
- Kein Zusammenlegen mit Patient-`/sessions/*`.
- Kein Falten von Room-Panel-Login in eine große Login-Union (kaum Produktnutzen).
- Kein dauerhaftes Dual-Read von `pf_staff_session` (siehe §8).
- Kein „Logout löscht alle Geräte-Cookies“, außer explizit `X-Client-Role: tv|terminal`.
- Kein Manager-Session-Modell.
- Keine parallelen Room-Panel-Sessions im gleichen Browser (ein Cookie-Slot bleibt).
- Keine große Map paralleler Session-States in der UI (Tabs = getrennte JS-Kontexte).

---

## 5. Blast Radius

### 5.1 Übersicht

| Bereich | Phase 1 | Phase 2 | Anmerkung |
| ------- | ------- | ------- | --------- |
| Manager | — | — | keine Cookie-Sessions |
| `POST /auth/logout` | ● | ● | scoped + Header Pflicht |
| `/auth/me`, Staff-Guard, OpenAPI cookies | — | ● | |
| UI Room-Panel | △ (Header schon da) | — | Server muss Header achten |
| UI MFA/Ops (`cookieAuthFetch`, Session-State) | — | ● | `selectedRole` + Header |
| MFA SSE inkl. `/ops/stream` | — | ● | immer `X-Client-Role: mfa` |
| TV/Terminal | — | △ | Muster schon da; Guard strenger |
| Tests / Docs | ● Logout | ● | |

### 5.2 Server-Touchpoints

| Datei | Phase |
| ----- | ----- |
| `app/src/routes/auth-routes.ts` (Logout) | 1 |
| `app/src/auth/staff-session-cookies.ts` (clear nur gewählter Slot; später Split) | 1 / 2 |
| `app/src/auth/client-auth.ts` | 2 (Header-Pflicht, `mfa`\|`ops`) |
| `openapi/auth.yaml` (+ Sibling cookie schemes) | 1 Logout-Doku; 2 Split |
| Generated API types | bei OpenAPI-Änderung |

### 5.3 UI-Touchpoints (Phase 2)

| Pfad | Änderung |
| ---- | -------- |
| `session-state.svelte.ts` | `selectedRole: 'mfa' \| 'ops' \| null`; `loadAuthSession(role)` lädt neu, wenn angeforderte Rolle ≠ aktuell geladener |
| `session-client.ts` | `/me` (+ Logout) mit Role-Header |
| `cookieAuthFetch` | `clientRole` → `X-Client-Role` |
| MFA/Ops Layouts / `AuthGate` | Role an Fetches und SSE binden |
| MFA-Streams | `/api/v1/ops/stream` mit **`X-Client-Role: mfa`**, nicht `ops` |
| `room-panel-api.ts` | Phase 1: unverändert (Header schon gesetzt) |

Nur Header an `cookieAuthFetch` zu hängen reicht nicht: der globale State muss die
gewählte Rolle kennen, sonst bleibt `/me`/AuthGate rollenlos und cached die falsche
Session beim Wechsel MFA ↔ Ops im **gleichen** Tab. Eine Multi-Session-Map ist nicht nötig.

### 5.4 Same-Origin

| Kombination | Heute | Nach Phase 1 | Nach Phase 2 |
| ----------- | ----- | ------------ | ------------ |
| MFA + Ops | ein Cookie, Überschreiben | unverändert | parallele Cookies + Header |
| MFA/Ops + Room-Panel | Panel-Logout killt Staff | scoped Logout | + Header-Pflicht |
| Mehrere Room-Panels | ein Slot, Login ersetzt | unverändert | unverändert |
| MFA + TV/Terminal | Header-Selektion | unverändert | Header überall Pflicht |

---

## 6. Entscheidungen (festgezogen)

| # | Entscheidung | Status |
| - | ------------ | ------ |
| 1 | MFA + Ops parallel (Phase 2) | **ja** (Ziel) |
| 2 | Geschützte Cookie-Routen: `X-Client-Role` immer Pflicht; kein Single-Slot-Fallback | **ja** (ab Phase 2; Logout schon Phase 1) |
| 3 | Phase 1 = **nur** Logout; `/auth/me` unverändert | **ja** |
| 4 | Room-Panel-Login-Union | **gestrichen** (kein Phase-Gegenstand) |
| 5 | Legacy `pf_staff_session` | nur clearen, **kein** Dual-Read |
| 6 | Set-Cookie-Append | nur prüfen; nach scoped Logout kein Mehrfach-Clear mehr nötig |
| 7 | `/ops/stream` für MFA-Dashboard | immer `X-Client-Role: mfa` |

---

## 7. Phasenplan

### Phase 1 — Cross-Kill beheben

Ziel: Room-Panel-Logout beendet Staff nicht mehr.

1. `POST /auth/logout` wertet `X-Client-Role` aus.
2. `room-panel` → widerruft und löscht **ausschließlich** `pf_room_panel_session`.
3. Entsprechend für andere Rollen, sobald Logout sie anspricht (z. B. Staff über
   `pf_staff_session`, solange Phase 2 noch nicht live ist) — immer **ein** Slot.
4. Fehlender / unbekannter Header → kontrolliert fehlschlagen (401/400).
5. `/auth/me`, Login und übrige Auth-Auflösung bleiben **unverändert**.
6. Room-Panel-Client: keine Änderung nötig (sendet Header bereits).
7. Set-Cookie-Append: nicht separat „fixen“; durch einen Clear pro Response entfällt
   das konkrete Mehrfach-Problem auf diesem Pfad.
8. Tests: Room-Panel weg, Staff-Session weiterhin gültig; fehlender Header schlägt fehl.
9. OpenAPI: Logout-Verhalten + erforderlicher Header dokumentieren.

### Phase 2 — MFA und Ops parallel ermöglichen

Ziel: getrennte Staff-Cookies + verpflichtende Rollenbindung in Client und Guard.

1. `pf_mfa_session` und `pf_ops_session` einführen.
2. Staff-Login schreibt ausschließlich den zur `role` gehörenden Slot.
3. Login und Logout **löschen** vorsichtshalber alte `pf_staff_session` (kein Lesen).
4. `X-Client-Role` um `mfa` und `ops` erweitern.
5. Geschützte Cookie-Routen, `/auth/me`, Logout und SSE: Header Pflicht; nur passender Slot.
6. Keine headerlosen Cookie-Fallbacks mehr zwischen Rollen.
7. UI: `selectedRole` + `loadAuthSession(role)`; `cookieAuthFetch` / SSE mit Role.
8. MFA-Realtime-Clients: Queue-Stream und **`/api/v1/ops/stream`** mit
   `X-Client-Role: mfa` (nicht `ops`).
9. OpenAPI cookie schemes + codegen; Docs anpassen.
10. Tests: MFA+Ops-Cookies koexistieren; Header-Selektion; Request ohne Header → 401/400;
    Legacy-Cookie wird nicht akzeptiert.

Benutzer melden sich nach Deployment einmal neu an (In-Memory-Sessions + kein Legacy-Read).

### Phase 3 — MFA-Realtime (separater Folge-Schnitt)

**Nicht** Auth-Kosmetik / Login-Union. Eigener Schnitt nach stabilem Session-Slot-Modell:

1. MFA-Streams konsolidieren.
2. Hard-Reload nach Reconnect entfernen.
3. Interne Queue-/Ops-Stores und Hubs getrennt lassen.
4. Rollenbindung der Streams aus Phase 2 beibehalten (`mfa` für Dashboard-Streams).

---

## 8. Legacy `pf_staff_session` — bewusst schlank

Sessions liegen im Speicher. Nach Backend-Restart sind alte Tokens ohnehin ungültig.
Deshalb **kein** Dual-Read, kein Migrationsfenster mit Sondercode.

Beim Rollout (Phase 2):

1. Neue Logins schreiben nur `pf_mfa_session` oder `pf_ops_session`.
2. Login und Logout clearen vorsichtshalber `pf_staff_session`.
3. Resolver liest Legacy **nicht**.
4. Benutzer einmal neu anmelden.

Device-/Panel-Cookies brauchen keine Rename-Migration.

---

## 9. Testplan (Minimum)

| Phase | Fall | Erwartung |
| ----- | ---- | --------- |
| 1 | Logout `X-Client-Role: room-panel` | nur Panel weg; Staff weiter gültig |
| 1 | Logout ohne Header | 401/400 |
| 2 | Login `role: mfa` dann `role: ops` | beide Cookies; MFA bleibt |
| 2 | Logout `X-Client-Role: mfa` | nur MFA-Slot weg |
| 2 | Geschützte Route ohne Header | 401/400 |
| 2 | `/me` + `X-Client-Role: ops` | Ops-Session |
| 2 | MFA-Request an `/ops/stream` mit Header `mfa` | ok |
| 2 | Altes `pf_staff_session` allein | nicht akzeptiert |
| 2 | Pairing TV + MFA-Tab | Header jeweils korrekt |

Manuell Phase 1: MFA-Tab offen → Room-Panel Login/Logout → MFA weiter nutzbar.  
Verify: `npm run verify`.

---

## 10. Implementierungs-Checkliste

- [ ] Phase 1: scoped Logout + Header-Pflicht + Tests + OpenAPI-Logout
- [ ] Phase 2: Cookie-Split mfa/ops; Legacy nur clearen
- [ ] Phase 2: Guard — Header Pflicht, kein Rollen-Fallback
- [ ] Phase 2: UI `selectedRole` / `loadAuthSession(role)` + `cookieAuthFetch`
- [ ] Phase 2: MFA-Streams inkl. `/ops/stream` → `X-Client-Role: mfa`
- [ ] Phase 2: OpenAPI schemes + codegen + Docs
- [ ] Phase 3 (später): MFA-Realtime-Konsolidierung (eigenes Ticket)
- [ ] Status dieses Dokuments aktualisieren

---

## 11. Kurzfazit

Sofort-Fix, Session-Isolation und späteres Realtime sind getrennt:

1. **Phase 1** — nur Logout scoped → Cross-Kill weg; `/me` unangetastet.  
2. **Phase 2** — Cookie-Split + `X-Client-Role` immer Pflicht + schlanker UI-Role-State;
   Legacy nur clearen.  
3. **Phase 3** — MFA-Realtime (Streams/Reconnect), keine Login-Union.

Room-Panel teilt weiter einen Cookie-Slot (keine Multi-Panel-Parallelität). Der
„Ops-Stream“ am MFA-Dashboard bleibt rollentechnisch **mfa**.
