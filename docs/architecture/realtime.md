# Echtzeit — SSE & Outbox

Stand: 2026-09-01 · Ist (`ops-event-hub`, `queue-stream-hub`, `outbox-worker`, MFA `queue-stream.ts`)

**Scope:** Push-Kanäle, Presence ≠ Pairing, Connection-Budget, Outbox als Audit.  
Nicht: Rollenmatrix → [`apis.md`](apis.md) · Fachflows → [`../flows.md`](../flows.md) · TLS-Ops → [`../operations/tls.md`](../operations/tls.md)

## 1. Grundsatz

| Kanal    | Zweck                                              |
| -------- | -------------------------------------------------- |
| **SSE**  | Beobachten — schnell sichtbar                      |
| **REST** | Tun — Mutations, Login, Pairing bestätigen, Export |

Beispiel: Terminal `POST /ops/emergency/raise` → Hub → MFA über Ops-SSE.

In-Memory-Pub/Sub, Single-Praxis — **kein** Redis/Broker.

## 2. Streams

| Stream | Endpoint                        | Consumer                  | Inhalt                                                                          |
| ------ | ------------------------------- | ------------------------- | ------------------------------------------------------------------------------- |
| Queue  | `GET /api/v1/queue/stream`      | `mfa`, `tv`, `room-panel` | Snapshots (`event: snapshot`); TV/Panel bei Grant-Revoke auch `session-revoked` |
| Ops    | `GET /api/v1/ops/stream`        | `mfa`                     | `emergency`, `device.presence`, `device.pairing`                                |
| Device | `GET /api/v1/ops/device/stream` | `terminal` (und ggf. TV)  | Liveness-SSE; **gekoppeltes TV** nutzt typisch Queue-SSE als Device-Liveness    |

Queue bleibt **separat** (hohe Frequenz). Ops-Events: eigener `event:`-Name je State — nie vermischen.

Hubs: `app/src/shared/ops/ops-event-hub.ts`, `app/src/shared/queue/queue-stream-hub.ts`.

### Connection-Budget (wichtig)

| Client               | typ. langlebige SSE pro Tab/Gerät      |
| -------------------- | -------------------------------------- |
| MFA                  | **2**: `/ops/stream` + `/queue/stream` |
| TV (gekoppelt)       | **1**: `/queue/stream` (= Liveness)    |
| Terminal (gekoppelt) | **1**: `/ops/device/stream`            |
| Room-Panel           | **1**: `/queue/stream`                 |

Mehrere MFA-Tabs = Vielfaches von 2. Unter **HTTP/1.1** (Direkt `:8080` oder HTTP-only-Proxy) kann das browserseitige Per-Origin-Limit REST verzögern, während SSE offen bleibt.

**LAN-TLS:** Browser ↔ Proxy oft **HTTP/2** (Caddy `protocols h1 h2`) — multiplexed die Browser-Seite; Hop Proxy → App bleibt HTTP/1.1 ([`../operations/tls.md`](../operations/tls.md)). Ohne TLS/h2 gilt weiter das HTTP/1.1-Bild. Multi-Tab-Budget-Optimierung (BroadcastChannel o. ä.) ist **optional**, messungsgetrieben — [offene technische Folgeentscheidungen](../open-items.md#ui--und-technische-folgeentscheidungen-keine-release-zusage).

### Ops Wire-Format

```
event: emergency
data: {"revision":…,"active":true,…}

event: device.presence
data: {"revision":…,"deviceId":"waiting-room","kind":"tv","status":"online","streamConnected":true,…}

event: device.pairing
data: {"revision":…,"phase":"pending","kind":"tv",…}
```

Ping ca. alle 25s (`: ping`). Beim Connect: Initial-Snapshot **pro Event-Typ**. Solange MFA am Ops-Stream: 5s-Tick (`refreshKnownDevicePresence`, `pruneExpiredPairings`); Pairing-Ablauf primär per Timer.

## 3. Presence ≠ Pairing ≠ Emergency

| Event             | Frage                  | Kernfelder                                                             |
| ----------------- | ---------------------- | ---------------------------------------------------------------------- |
| `device.presence` | Gerät erreichbar?      | `status` online\|stale\|offline, `streamConnected`, `deviceId`, `kind` |
| `device.pairing`  | Code für MFA sichtbar? | `phase` pending\|none, `expiresAt`, `kind`, `deviceId`                 |
| `emergency`       | Notfall aktiv?         | `active`, `emergencyId`, Zeiten                                        |

**Liveness-Kanäle:** TV gekoppelt → Queue-SSE; Terminal gekoppelt → Device-SSE. Room-Panel: online nur solange Queue-SSE offen (`streamConnected`).

**Presence TV/Terminal (gekoppelt):** Solange der Liveness-SSE offen ist → `status: online` und `streamConnected: true`. Bei Disconnect: `streamConnected: false` **sofort**, aber `status` bleibt oft noch `online`, bis `lastSeenAt` altert — stale ab **5s**, offline ab **10s** (`PRESENCE_STALE_AFTER_MS` / `PRESENCE_OFFLINE_AFTER_MS` in `stream-constants.ts`). Nicht „SSE zu → sofort offline“.

**Während Pairing** (kein Device-SSE): Heartbeat über Pairing-Poll (&lt;5s online, ≥5s stale, ≥10s offline).

**Pairing (TV/Terminal):** `pending` → `none` bei Confirm (Ops-Snapshot blendet confirmed aus), unbestätigtem TTL, oder Poll-Grace (~60s) ohne Geräte-Poll. Presence und Liveness-SSE-Disconnect löschen **kein** Pairing und **keine** Freigabe. Confirm schreibt keine Tabellenzeile; der erste erfolgreiche Poll insertet die Freigabe und ersetzt denselben Slot. MFA-Code nur aus `device.pairing`.

**Freigabe ≠ Presence:** Widerruf (MFA oder Group-Revoke) wirkt am nächsten SSE-Ping (`revoked_at`); Stream zu, Reconnect **401** → neu koppeln/enrollen. 5xx/Netzwerk behalten Cookie/Freigabe.

Queue-Updates: `publishTvQueueUpdate` → **Queue-Stream**, nicht Ops.

## 4. Was REST bleibt

| REST                                      | Rolle                                                           |
| ----------------------------------------- | --------------------------------------------------------------- |
| `POST/GET …/pairing/start\|{id}\|confirm` | Start; MFA bestätigt nur Registry; Gerät pollt → Cookie + Grant |
| `POST /ops/device/presence`               | ergänzende Liveness                                             |
| `GET /ops/heartbeat`                      | Terminal-Betriebsflags — **nicht** Primär-Liveness              |
| `POST /ops/emergency/raise\|ack`          | auslösen / quittieren                                           |
| Queue-/Ops-Mutationen                     | Aktionen                                                        |

Device-Cookie aus Pairing-GET — deshalb Poll am Gerät; MFA-Prompt ist Push.

## 5. MFA-Client

- **Ops:** eine SSE-Verbindung, getrennte Handler/Stores (`emergency` / `presence` / `pairing`). Quicksettings liest dieselben Stores — kein REST-Poll für Devices/Pairing-Prompt.
- **Queue:** eigener SSE (`connectMfaQueueStream`). Zusätzlich **Stale-Fallback:** alle 3s prüft der Client, ob seit dem letzten Snapshot zu lange Stille herrscht — sichtbar **25s**, Tab hidden **5s** — dann `GET /api/v1/queue` (`ui/src/lib/mfa/queue-stream.ts`). Das ist Sicherheitsnetz neben dem Stream, kein Ersatz für Ops-Stores.

### Wiederanlauf nach Backend-Unterbrechung

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

## 6. Outbox (Audit, nicht Push)

SQLite-Outbox in derselben TX wie die Fachänderung; Worker setzt `published_at` — **audit-only** (`AUDIT_ONLY_EVENT_TYPES` in `outbox-worker.ts`).

Typen u. a.: `CheckinCreated`, `VisitSuperseded`, `QueueStatusChanged`, `EmergencyRaised`/`EmergencyAcknowledged`, `PatientSessionClosed`, `DocumentIntakeReceived`, `DocumentPreviewRequested`, `DocumentLifecycleChanged`, `DocumentRenamed`, `DayCloseStarted`, `BusinessDayReset`, `OpsRuntimeReset`.

**Nicht Outbox:** Recall-SMS und Dateisystem-Export synchron in der Route; Queue-/Ops-SSE direkt über Hubs.

Payloads: Referenzen, keine medizinischen Freitexte / Dokumentinhalte. Neues audit-only Event: Typ in `AUDIT_ONLY_EVENT_TYPES` + Emitter im selben PR.

## 7. Abgrenzung

| Nicht                                  | Ersatz / Stand                                                        |
| -------------------------------------- | --------------------------------------------------------------------- |
| Separater Emergency-Stream             | Ops `event: emergency`                                                |
| MFA REST-Poll Devices / pairing-prompt | Ops-Stream                                                            |
| Horizontale SSE-Skalierung / Redis     | bewusst Single-Host                                                   |
| Async SMS über Outbox                  | inline Versand                                                        |
| „TLS macht Connection-Budget egal“     | h2 hilft Browser↔Proxy; ohne TLS/h2 und bei vielen Tabs weiter messen |
