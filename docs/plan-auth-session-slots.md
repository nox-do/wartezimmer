# Auth-Session-Slots und MFA-Recovery

Stand: 2026-07-14

Status: **Phase 1–3 abgeschlossen.** Offen ist nur eine optionale, messungsgetriebene
Folgephase für das Multi-Tab-SSE-Connection-Budget.

Verwandt: [`apis.md`](apis.md), [`realtime-streams.md`](realtime-streams.md),
`openapi/auth.yaml`, `app/src/auth/*`, `app/src/routes/auth-routes.ts`.

---

## 1. Ergebnis und geltender Vertrag

### 1.1 Cookie-Slots

Eine Cookie-Rolle besitzt genau einen Slot. Der Header `X-Client-Role` wählt diesen Slot,
verleiht aber keine Rolle; maßgeblich bleibt die serverseitige Session.

| Rolle        | Cookie                       | Erzeugung        |
| ------------ | ---------------------------- | ---------------- |
| `mfa`        | `pf_mfa_session`             | Staff-PIN-Login  |
| `ops`        | `pf_ops_session`             | Staff-PIN-Login  |
| `room-panel` | `pf_room_panel_session`      | Room-Panel-Login |
| `tv`         | `pf_tv_device_session`       | Device-Pairing   |
| `terminal`   | `pf_terminal_device_session` | Device-Pairing   |

`pf_staff_session` ist ein nicht mehr akzeptierter Legacy-Name. Login darf ihn löschen,
der Resolver liest ihn nicht. Nach dem Rollout ist deshalb einmaliges Neuanmelden nötig.

Room-Panel, MFA, Ops, TV und Terminal können mit ihren getrennten Slots im selben Browser
koexistieren. Mehrere Room-Panel-Sessions im selben Browser bleiben bewusst ausgeschlossen,
weil sie weiterhin einen gemeinsamen Slot verwenden.

### 1.2 Guard

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

### 1.3 Login und Logout

Staff-Login verlangt `{ role: "mfa" | "ops", pin }` und schreibt ausschließlich den
passenden Slot.

`POST /api/v1/auth/logout` ist scoped und idempotent:

- `X-Client-Role` ist erforderlich; fehlend oder unbekannt ergibt `400 INVALID_ARGUMENT`.
- Nur der gewählte Slot wird widerrufen und dessen Cookie gelöscht.
- Fehlende, abgelaufene oder bereits widerrufene Sessions ergeben weiterhin `200 { ok: true }`.
- Room-Panel-Logout beendet dadurch keine MFA-/Ops-Session mehr.

### 1.4 UI und OpenAPI

- MFA-Module verwenden `mfaAuthFetch`, Ops-Module `opsAuthFetch`.
- Geräte und Room-Panel senden ihre feste Rolle weiterhin explizit.
- `/queue/stream` und `/ops/stream` im MFA-Dashboard senden `X-Client-Role: mfa`.
- `loadAuthSession(role)` prüft den angeforderten Slot auch beim Wechsel zwischen MFA und Ops.
- Ein Cross-Slot-`401` verwirft nicht die gültige Session der anderen Oberfläche.
- OpenAPI beschreibt Cookie-Scheme, Rollenheader und tatsächliche ACL pro Operation;
  Documents verwendet für MFA keinen alten API-Key-Bearer mehr.

---

## 2. Umgesetzte Phasen

### Phase 1 — Scoped Logout

- Cross-Kill zwischen Room-Panel und Staff entfernt.
- Logout ohne aktive Session bleibt erfolgreich und räumt den Slot auf.
- Header- und Statuscode-Vertrag in OpenAPI und Tests festgezogen.

### Phase 2 — MFA/Ops-Slottrennung

- `pf_staff_session` durch `pf_mfa_session` und `pf_ops_session` ersetzt.
- Cookie-Guard auf explizite Slot-Selektion umgestellt; Bearer und Local-TV bleiben vorrangig.
- Alle MFA-/Ops-REST- und SSE-Aufrufe rollenfest gemacht.
- OpenAPI, generierte Typen, Smoke-Helper und Regressionstests nachgezogen.
- MFA und Ops parallel sowie Room-Panel-Logout neben MFA manuell verifiziert.

### Phase 3 — MFA-Recovery ohne Full-Reload

`MfaOpsStreamHost` behält zwei getrennte SSE-Kanäle bei:

- `/queue/stream` für Queue-Snapshots,
- `/ops/stream` für Emergency, Device-Presence und Pairing.

Die Server-Hubs und Stores bleiben getrennt; nur ihr Client-Lifecycle wird gemeinsam im Host
koordiniert.

Nach einer vorübergehenden Backend-Unterbrechung:

1. reconnecten beide SSE-Clients weiterhin selbstständig,
2. schließt `handleMfaBackendRecovered` transiente Queue-/Dokumentzustände,
3. wird nur der aktive MFA-Routeninhalt remountet,
4. laufen dadurch dessen vorhandene Loader erneut,
5. bleiben Stream-Verbindungen, Emergency- und Assist-Host außerhalb des Remounts bestehen.

Bei einem vollständigen Host-Mount wird `mfaQueueDisplay` einschließlich lokaler Revision
zurückgesetzt. Damit werden nach Backend-Neustart und erneutem SPA-Login auch Snapshots mit
einer wieder bei null beginnenden Server-Revision akzeptiert.

---

## 3. Verifikation und Rollout

Automatisiert abgedeckt sind insbesondere:

- MFA-/Ops-Koexistenz und Slotbindung,
- scoped/idempotenter Logout,
- Legacy-Cookie-Ablehnung,
- Headerfehler `400`, fehlende Session `401`, falsche Rolle `403`,
- Captive-Bearer ohne Rollenheader,
- Pairing-Confirm mit MFA-Rolle,
- OpenAPI-Security und Rollenheader,
- kleiner Orchestrierungstest für MFA-Backend-Recovery.

Manuell verifiziert:

- MFA-Tab offen, Room-Panel an-/abmelden, MFA bleibt nutzbar,
- MFA und Ops parallel im selben Browser,
- Recovery-Verhalten bleibt bewusst ein manueller Browsercheck.

Rollout-Hinweis: Bestehende `pf_staff_session`-Benutzer melden sich einmal neu an. Es gibt
absichtlich kein Dual-Read- oder Migrationsfenster, da Sessions nur im Speicher liegen.

---

## 4. Bewusste Nicht-Ziele

- Kein OAuth/OIDC/JWT-Layer.
- Kein Zusammenlegen mit Patient-`/sessions/*`.
- Keine Login-Union für Staff, Room-Panel und Geräte.
- Kein globales „Logout aller Cookies“.
- Kein Manager-Session-Modell.
- Keine parallelen Room-Panel-Sessions im selben Browser.
- Kein Zusammenlegen der internen Queue- und Ops-Event-Hubs.
- Keine Ops-SSE für die Ops-IT-Oberfläche.

---

## 5. Optionale nächste Phase — Multi-Tab Connection-Budget

### 5.1 Anlass

Jeder MFA-Tab hält zwei langlebige SSE-Verbindungen; TV, Terminal und Room-Panel besitzen
weitere Streams. Unter HTTP/1.1 kann das browserseitige Per-Origin-Verbindungslimit REST-Aufrufe
verzögern. Unter HTTP/2 ist die Engstelle typischerweise anders gelagert. Deshalb darf die
nächste Phase nicht allein aus der beobachteten Anzahl offener Streams abgeleitet werden.

### 5.2 Vor einer Implementierung messen

Zuerst in der realen Deployment-Topologie erfassen:

- tatsächlich ausgehandeltes Protokoll am Browser/Reverse-Proxy (`h1` oder `h2`),
- offene SSE-Verbindungen pro Origin und Client-Rolle,
- REST-Latenz mit einem, zwei und mehreren MFA-/Panel-Tabs,
- Reconnect-Rate und gleichzeitige Verbindungsaufbauten nach Backend-Ausfall,
- Proxy-/Server-Limits und Timeouts für langlebige Responses.

Nur wenn ein reproduzierbarer Zusammenhang zwischen Stream-Anzahl und REST-Blockade besteht,
wird eine weitere Architekturphase gestartet.

### 5.3 Bevorzugte Reihenfolge

1. **Transport/Proxy korrigieren**, falls HTTP/2 verfügbar sein sollte, aber nicht genutzt wird.
2. **Verbindungsaufbau entzerren**, falls vor allem Reconnect-Bursts das Problem sind
   (Jitter/Backoff, begrenzte gleichzeitige Connects).
3. **Tab-Koordination nur für identische Stream-Identitäten** prüfen: ein MFA-Leader pro
   Origin/Rolle hält SSE, weitere MFA-Tabs erhalten Snapshots über `BroadcastChannel`.
4. Erst wenn zwei Streams pro führendem Tab selbst das Problem sind, einen gemeinsamen
   clientseitigen Transport-Endpunkt erwägen; die internen Queue-/Ops-Hubs bleiben dabei getrennt.

Für Leader-Election bevorzugt `Web Locks` mit Heartbeat/Fallback verwenden. Bei fehlender
Browser-Unterstützung muss jeder Tab weiterhin direkt verbinden können. Auth-Tokens oder Cookies
werden nie über `BroadcastChannel` übertragen, nur bereits autorisierte Snapshots/Events.

### 5.4 Sicherheits- und Korrektheitsregeln

- Keine Koordination zwischen verschiedenen Rollen oder Cookie-Slots.
- Neuer Leader lädt vor dem Broadcast einen kanonischen Snapshot.
- Nachrichten tragen Stream-Identität, Generation und Revision; Revisionen dürfen nach einem
  Backend-Neustart wieder kleiner sein.
- Leader-Ausfall darf höchstens eine begrenzte Update-Lücke verursachen und keinen manuellen
  Reload erfordern.
- Hintergrund-/Visibility-Status allein bestimmt nicht den Leader.
- Room-Panel-Snapshots werden wegen ihres Session-/Raumkontexts nicht mit MFA geteilt.

### 5.5 Exit-Kriterien

Die optionale Phase ist abgeschlossen, wenn:

- die gemessene REST-Blockade mit realistischer Tab-Zahl nicht mehr reproduzierbar ist,
- Leader-Wechsel und Backend-Recovery ohne Full-Reload funktionieren,
- Rollen- und Session-Isolation unverändert bleiben,
- ein Fallback ohne `BroadcastChannel`/`Web Locks` vorhanden ist,
- die Lösung unter der tatsächlich ausgelieferten Proxy-/Protokollkonfiguration geprüft wurde.
