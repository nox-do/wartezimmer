# Echtzeit-Streams (Pub/Sub) — Zielbild

> **Leitdokument für alle Echtzeit-Themen in Praxis Flow.**  
> Nachfolgende Chats und Implementierungen orientieren sich an diesem Dokument, nicht an REST-Polling oder vermischten UI-States.

Stand: 2026-06-09 · Status: **Implementiert (Server + MFA-Client)**

---

## Grundsatz

| Kanal          | Zweck                                                                        |
| -------------- | ---------------------------------------------------------------------------- |
| **SSE (Push)** | Alles, was **schnell sichtbar** sein muss — Beobachten, Status, Live-Updates |
| **REST**       | Alles, was **getan** wird — Mutations, Login, Pairing bestätigen, Export     |

**Regel:** REST ist nicht der Primärweg für „ist etwas passiert?“. Das ist SSE.

Referenz, die bereits funktioniert: **Notfall** — Terminal `POST /ops/emergency/raise` → Hub → Push → MFA empfängt sofort über SSE. Kein Zufall, kein Poll.

---

## Streams (getrennt nach Domäne)

Wir nutzen **mehrere SSE-Verbindungen**, wenn Frequenz oder Consumer unterschiedlich sind — aber **nie vermischte States in einem Event**.

| Stream | Endpoint                        | Consumer               | Inhalt                                       |
| ------ | ------------------------------- | ---------------------- | -------------------------------------------- |
| Queue  | `GET /api/v1/queue/stream`      | MFA, TV                | Warteschlangen-Snapshots (`event: snapshot`) |
| Device | `GET /api/v1/ops/device/stream` | Terminal (TV optional) | Liveness-SSE — Kanal offen/zu, Ping          |
| Ops    | `GET /api/v1/ops/stream`        | MFA                    | Betriebsereignisse (siehe unten)             |

**Queue bleibt separat** — hohe Update-Frequenz, TV braucht denselben Kanal.

**Ops-Stream ist neu** — ein dauerhaft offener MFA-Kanal für alles Betriebliche außer Queue.

---

## Ops-Stream: Pub/Sub-Hub

### Server

```
app/src/shared/ops/ops-event-hub.ts   ← zentraler In-Memory-Pub/Sub (Single-Praxis)
app/src/routes/ops/ops-stream-routes.ts ← SSE-Endpunkt
```

Publisher rufen `publishOpsEvent(type, payload)` auf. Alle offenen MFA-SSE-Connections erhalten das Event.

Beim Connect: **Initial-Snapshot pro Event-Typ** — jeweils als separates SSE-Event, kein Sammel-JSON.

### Wire-Format (SSE)

Jeder fachliche State hat einen **eigenen `event:`-Namen**:

```
event: emergency
data: {"revision":12,"active":true,"emergencyId":"…","raisedAt":"…","acknowledgedAt":null,"serverTime":"…"}

event: device.presence
data: {"revision":34,"deviceId":"waiting-room","kind":"tv","status":"online","streamConnected":true,"lastSeenAt":"…","serverTime":"…"}

event: device.pairing
data: {"revision":35,"kind":"tv","phase":"pending","expiresAt":"…","deviceId":"waiting-room","serverTime":"…"}
```

Ping alle 25s (`: ping`) — Verbindung offen halten, kein fachlicher State.

Solange mindestens ein MFA-Client am Ops-Stream hängt, läuft zusätzlich ein **5s-Tick**: `refreshKnownDevicePresence()` (online→stale→offline aus `lastSeenAt`) und `pruneExpiredPairings()` als Sicherheitsnetz. Pairing-Ablauf wird primär per **Timer pro Pairing** (`schedulePairingExpiry`) sofort gepusht.

---

## Getrennte States (nicht vermischen)

Diese Dimensionen sind **orthogonal**. Sie dürfen in UI und API **nicht** zu einem Blob zusammengefasst werden.

### 1. `device.presence` — Erreichbarkeit

**Frage:** Ist das Gerät da / lebt es / ist der Stream offen?

| Feld              | Bedeutung                                                             |
| ----------------- | --------------------------------------------------------------------- |
| `status`          | `online` \| `stale` \| `offline` — siehe Statusregeln unten           |
| `streamConnected` | Offener Device-SSE: TV `/queue/stream`, Terminal `/ops/device/stream` |
| `deviceId`        | `waiting-room` \| `checkin-terminal`                                  |
| `kind`            | `tv` \| `terminal`                                                    |

**Nicht:** „Gerät braucht Pairing“ — das ist `device.pairing`.

#### Statusregeln (Operator-Latenz)

Ein Modell für **alle gekoppelten Geräte** — nicht getrennt nach TV/Terminal:

| Phase                       | online                          | stale              | offline             |
| --------------------------- | ------------------------------- | ------------------ | ------------------- |
| **Gekoppelt (normal)**      | Device-SSE offen                | — (SSE = Liveness) | **SSE zu (sofort)** |
| **Pairing (Code am Gerät)** | Heartbeat via Pairing-Poll < 5s | Heartbeat ≥ 5s     | Heartbeat ≥ 10s     |

Kanäle:

- **TV gekoppelt:** Queue-SSE (`/queue/stream`) = Device-SSE
- **Terminal gekoppelt:** `/ops/device/stream`
- **Pairing:** kein Device-SSE (401) → Heartbeat über Pairing-REST

- Übergänge per **Timer** gepusht; 5s-Tick nur Sicherheitsnetz.
- **Kein offener Device-SSE** (gekoppelt) → sofort `offline`.

Beispiel: TV offline, aber bereits gekoppelt → `presence: offline`, `pairing: none`, **kein PIN-Feld**.

### 2. `device.pairing` — Kopplungs-Prompt

**Frage:** Zeigt das Gerät gerade einen Code für MFA-Eingabe?

| Feld        | Bedeutung           |
| ----------- | ------------------- |
| `phase`     | `pending` \| `none` |
| `kind`      | `tv` \| `terminal`  |
| `expiresAt` | nur bei `pending`   |
| `deviceId`  | betroffenes Gerät   |

**Nicht:** „Gerät offline“ — das ist `device.presence`.

**Pairing-Lifecycle:** `pending` → `none` bei Confirm, TTL, **Device-SSE-Disconnect** oder **Presence offline**.

Beispiel: TV zeigt Code, MFA-Tab war schon offen → `pairing: pending` per Push, PIN-Feld **sofort** — kein 15s-Poll.

### 3. `emergency` — Notfall

**Frage:** Läuft ein Terminal-Notfall?

Bestehendes Modell (`EmergencyStreamSnapshot`), nur Hub/Stream konsolidieren:

| Feld                                        | Bedeutung |
| ------------------------------------------- | --------- |
| `active`                                    | boolean   |
| `emergencyId`, `raisedAt`, `acknowledgedAt` | wie heute |

Quelle: Terminal (oder MFA) `POST /ops/emergency/raise|ack` → sofort `publishOpsEvent('emergency', …)`.

---

## Publisher (wann pushen?)

| Auslöser                                                           | Event                                        |
| ------------------------------------------------------------------ | -------------------------------------------- |
| `recordDevicePresence`, `markDeviceStreamConnected/Disconnected`   | `device.presence`                            |
| Geplanter Timer (`lastSeenAt` + 5s/10s)                            | `device.presence` bei online→stale→offline   |
| Ops-Stream-Tick (5s): `refreshKnownDevicePresence`                 | Sicherheitsnetz                              |
| `startDevicePairing`, Pairing-Poll (`GET …/pairing/{id}`)          | `device.presence` (Liveness während Pairing) |
| `startDevicePairing`                                               | `device.pairing` → `pending`                 |
| Pairing bestätigt / abgelaufen / SSE-Disconnect / Presence offline | `device.pairing` → `none`                    |
| `raiseEmergency`, `ackEmergency`                                   | `emergency`                                  |

Queue-Änderungen: weiterhin `publishTvQueueUpdate` → **Queue-Stream**, nicht Ops-Stream.

---

## Client (MFA)

### Eine Ops-Verbindung, getrennte Handler

```
connectOpsStream()  // onMount MFA, bleibt offen
  on('emergency',       → emergencyStore)
  on('device.presence', → devicePresenceStore)
  on('device.pairing',  → devicePairingStore)
```

- **Hauptseite** und **Quicksettings** lesen dieselben Stores — **keine zweite Verbindung**, kein REST-Poll.
- Queue: weiterhin `connectMfaQueueStream()` (eigener Stream).

### UI-Regeln (Quicksettings)

| Anzeige                           | Quelle                                                                                       |
| --------------------------------- | -------------------------------------------------------------------------------------------- |
| Status-Badge online/stale/offline | `device.presence`                                                                            |
| PIN-Eingabe sichtbar              | `device.pairing.phase === 'pending'` (oder Submit-Busy); roter Input-Rahmen, kein Zusatztext |
| Notfall-Alert                     | `emergency`                                                                                  |
| Terminal sperren                  | unabhängig von `presence`; nur ausblenden während aktivem Pairing-Prompt                     |

---

## Was REST bleibt

| REST                                          | Rolle                                                                     |
| --------------------------------------------- | ------------------------------------------------------------------------- |
| `POST /auth/{tv,terminal}/pairing/start`      | Gerät startet Pairing (Gerät zeigt Code)                                  |
| `GET /auth/{tv,terminal}/pairing/{id}`        | Gerät pollt bis Cookie gesetzt (Set-Cookie geht nicht per SSE)            |
| `POST /auth/{tv,terminal}/pairing/confirm`    | MFA bestätigt Code                                                        |
| `POST /ops/device/presence`                   | TV/Terminal melden Liveness (ergänzend; TV auch via Queue-SSE)            |
| `GET /ops/heartbeat`                          | Terminal-Betriebsstatus (Lock, Notfall-Flags) — **nicht** Primär-Liveness |
| `POST /ops/emergency/raise`, `…/ack`          | Notfall auslösen / quittieren                                             |
| `POST /ops/checkin-lock`, Queue-Mutationen, … | Aktionen                                                                  |

Pairing-Abschluss am **Gerät** bleibt poll-basiert (`GET …/pairing/{id}`), weil der Browser das Device-Cookie aus der Response braucht. **Nur** „MFA soll PIN-Feld zeigen“ ist Push über `device.pairing`.

---

## Entfernt (nicht mehr im Code)

| Was                                                                                       | Ersatz                                        |
| ----------------------------------------------------------------------------------------- | --------------------------------------------- |
| `GET /api/v1/ops/emergency/stream`, `emergency-stream-hub.ts`, `connectEmergencyStream()` | `GET /api/v1/ops/stream` · `event: emergency` |
| `GET /api/v1/ops/devices`, `GET …/pairing-prompt`, `GET /ops/emergency/status`            | Ops-Stream Events                             |
| MFA Quicksettings 15s-Poll, `fetchDevicePairingPromptStatus`                              | Ops-Stream Stores                             |

---

## Device-Auth (Cookies) — Kurz

Cookies für TV/Terminal-Sessions bleiben v1-vertretbar (Kiosk, HttpOnly, SameSite).

- Getrennte Cookies: `pf_tv_device_session`, `pf_terminal_device_session`
- `X-Client-Role: tv|terminal` bei gemischten Browser-Tabs (MFA + Geräte)

Cookies sind **Auth**, nicht **Transport für Echtzeit**. Das Pub/Sub-Problem war nie „Cookie vs. SSE“, sondern Beobachtung über REST statt Push.

Langfristig optional: Device-Token-Modell analog Patient-Session — separates Thema, blockiert nicht Ops-Stream.

---

## Ist-Stand (2026-06)

Umgesetzt:

- `ops-event-hub.ts`, `GET /api/v1/ops/stream` (MFA), `GET /api/v1/ops/device/stream` (TV/Terminal)
- Publisher an Presence-, Pairing-, Emergency-Stellen
- MFA: `connectOpsStream()`, shared Stores; Quicksettings ohne REST-Poll
- Separater Emergency-SSE-Endpunkt und Server-Fallbacks entfernt
- Smoke: `npm run smoke:ops-stream`

Akzeptanz: MFA sieht Pairing-Prompt und Presence-Wechsel ohne spürbare Verzögerung (< 1s typisch), bei offenem Dashboard — wie Notfall.

---

## Referenzen

- API-Details: `docs/apis.md` → Abschnitt „Echtzeit / Ops-Stream“
- Interne Events (Outbox vs. SSE): `docs/events.md`
- Architektur: `docs/architecture.md` (logische Komponenten)
- Pairing/Auth: [`delivery.md`](delivery.md), [`../manager/README.md`](../manager/README.md)
- Ist-Code: `ops-event-hub.ts`, `ops-stream-routes.ts`, `connectOpsStream()`, `MfaQuicksettings.svelte` (Stores)
