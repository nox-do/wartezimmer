# Interne Events (v1 Ist-Stand)

## Ziel

**Mutations:** REST ist der Hauptweg.  
**Beobachtung (Echtzeit):** SSE über In-Memory-Pub/Sub-Hubs — siehe **`docs/realtime-streams.md`**.

Die Outbox in SQLite dient v1 als **Audit-Trail** und Crash-Recovery-Markierung — nicht als Event-Bus mit Side-Effect-Workern.

Details Remediation (E2E-Review 2026-06-08, PR-Pakete P0–P4): siehe **`todo.md`** → Abschnitt „Remediation-Plan“.

## Grundsaetze

- So wenig Events wie moeglich
- Keine sensiblen Inhalte im Payload, nur Referenzen
- Idempotente Verarbeitung (Wiederholung darf keinen Schaden erzeugen)

## Transport (v1)

- Events werden in derselben SQLite-Transaktion wie die Fachaenderung geschrieben
- Hintergrund-Worker markiert Events als `published` (audit-only, kein externer Dispatch)
- Kein externer Broker

Implementierung: `app/src/shared/outbox/outbox-worker.ts`, Emitter via `emitOutboxEvent` in `database-*.ts`.

---

## Implementiert (v1) — Outbox

Alle unten stehenden Typen sind **audit-only** (Worker setzt `published_at`, kein Side-Effect).

| Event                      | Emitter (Auszug)                                            | Zweck                                                                                                       |
| -------------------------- | ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `CheckinCreated`           | `database-checkin-sessions.ts`                              | Audit Check-in                                                                                              |
| `QueueStatusChanged`       | `database-queue.ts`                                         | Audit Queue-Transition                                                                                      |
| `EmergencyRaised`          | `database-emergency.ts`                                     | Audit Terminal-Notfall                                                                                      |
| `EmergencyAcknowledged`    | `database-emergency.ts`                                     | Audit MFA-Quittierung                                                                                       |
| `PatientSessionClosed`     | `database-checkin-sessions.ts` (via `submitPatientSession`) | Audit Session-Ende; v1 ausgeloest nach Formular-Intake (`patient-documents/forms`), nicht nach Datei-Upload |
| `DocumentIntakeReceived`   | `database-documents.ts`                                     | Audit Upload/Form-Intake                                                                                    |
| `DocumentPreviewRequested` | `database-documents.ts`                                     | Audit MFA-Preview-Anfrage                                                                                   |
| `DocumentLifecycleChanged` | `database-documents.ts`                                     | Audit discard/export/status                                                                                 |
| `DayCloseStarted`          | `database-day-lifecycle.ts`                                 | Audit Tagesabschluss-Start (`day-close/start`)                                                              |
| `BusinessDayReset`         | `database-day-lifecycle.ts`                                 | Audit Tagesreset (`day-lifecycle/reset`)                                                                    |
| `OpsRuntimeReset`          | `database-runtime-reset.ts`                                 | Audit Wartungs-Reset                                                                                        |

**Nicht als Outbox-Event, aber implementiert:**

| Verhalten            | Wo                                                            | Hinweis                                                                                   |
| -------------------- | ------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Recall-SMS           | `queue-routes.ts` → `sms-sender.ts`                           | Synchroner Versand, kein `SmsDispatchRequested`                                           |
| Dateisystem-Export   | `documents-routes.ts`                                         | Synchron in der HTTP-Route, kein Outbox-Worker                                            |
| MFA/TV Queue-Updates | `publishTvQueueUpdate` in Routes                              | Direkt SSE-Hub, kein Outbox                                                               |
| Ops-Echtzeit         | `ops-event-hub` → `GET /ops/stream`, `GET /ops/device/stream` | Push: `emergency`, `device.presence`, `device.pairing` — siehe `docs/realtime-streams.md` |

---

## Echtzeit Pub/Sub (SSE) — Zielbild

Leitdokument: **`docs/realtime-streams.md`**.

Kurz:

- **Queue-Stream** (`/queue/stream`): Warteschlangen-Snapshots für MFA + TV.
- **Ops-Stream** (`/ops/stream`): getrennte SSE-Event-Typen für Notfall, Geräte-Presence und Pairing-Prompt — **nicht vermischen**.
- Entfernt: REST-Poll für MFA-Live-Status (`GET /ops/devices`, `GET …/pairing-prompt`, separater Emergency-Stream).

Outbox-Events und SSE-Push sind **verschiedene Transporte**: Outbox = persistierter Audit-Trail; SSE-Hub = sofortige UI-Benachrichtigung ohne SQLite-Roundtrip.

---

## Geplant (nicht in v1-Outbox)

| Event                               | Geplanter Zweck                           | Status                                                 |
| ----------------------------------- | ----------------------------------------- | ------------------------------------------------------ |
| `RecallRequested`                   | Rueckholen + Benachrichtigung             | nicht emittiert                                        |
| `RecallWindowExpired`               | Ticket nach Rückhol-Countdown → `waiting` | nicht als Outbox-Event — Backend-Scheduler + Queue-SSE |
| `SmsDispatchRequested`              | Async SMS ueber Outbox                    | nicht noetig v1 (inline SMS)                           |
| `AnamneseSubmitted`                 | Formular → Dokument                       | laeuft als `DocumentIntakeReceived`                    |
| `DocumentFilesystemExportRequested` | Async Export                              | **entfernt** — Export bleibt sync                      |
| `DayResetConfirmed`                 | —                                         | **entfernt** — Code nutzt `BusinessDayReset`           |

---

## Minimales Event-Schema (SQLite-Outbox)

```json
{
  "eventId": "uuid",
  "eventType": "QueueStatusChanged",
  "occurredAt": "2026-05-29T09:00:00Z",
  "aggregateId": "ticket-id",
  "payload": {
    "ticketId": "A-042",
    "status": "called"
  }
}
```

## Sicherheitsregel

Payloads enthalten keine medizinischen Freitexte und keine Dokumentinhalte. Kritische Details nur ueber autorisierte REST-Endpunkte.

## Hinweise fuer Erweiterungen

- Neues Event zuerst in `AUDIT_ONLY_EVENT_TYPES` (`outbox-worker.ts`) eintragen, wenn audit-only
- Side-Effect-Worker nur mit klarem Single-Praxis-Nutzen (v1: vermeiden)
- Katalog hier und Emitter im selben PR aktualisieren
