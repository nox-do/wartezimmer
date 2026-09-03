# Plan: DB-Schicht — Reset-Vertrag, Timer, Session-Writes

Stand: 2026-09-03

Status: **Entwurf, Bugbot eingearbeitet.** Kein Code in diesem Dokument.
Nächster Schritt: Schnitt 1. Vertrag ist dieses Dokument.

Die SQLite-Datei ist das Praxismodell. Drei Stellen nehmen das zu leicht:
Tages-/Runtime-Reset, In-Memory-Timer neben Write-TX, Session-GET das schreibt.
Alles andere (God-Object, JSON-Settings, Ticket-Namen, `waiting_room_full`)
bleibt liegen, bis diese drei Verträge halten.

---

## Fachliches Ziel

Nach einem Geschäftstag-Reset oder Runtime-Reset gibt es keine Visit-Zeilen
und keine davon abhängigen Host-/Portal-Zeilen mehr. `PRAGMA foreign_key_check`
ist leer. In-Memory-Timer spiegeln nur committeden Zustand. Session-Reads, die
heute `last_seen` / Expiry mutieren, tun das atomar oder gar nicht.

Dokumentdateien auf Disk, Outbox-Semantik, Schema-Generation, Migrations-Runner
sind **nicht** dieser Plan.

---

## Ist (gebunden)

1. `clearFlowCoreVisitRuntime` (`app/src/shared/flow-core/flow-core-schema.ts`)
   schaltet `foreign_keys` aus, löscht `visit_events`, `visit_topics`, `visits`,
   `patients`, `daily_queue_counters`, schaltet FK wieder an. Wird aus
   `CoreDatabase.resetBusinessDay` und `executeRuntimeReset` **in derselben**
   `BEGIN IMMEDIATE` aufgerufen, nach Kernel und nach
   `clearAllTerminalAssistPending` (DB-Funktion) plus
   `clearAllTerminalAssistPendingExpiries()` — nicht über die Public-Methode
   `this.clearAllTerminalAssistPending()`.
2. Mit FK aus feuert `ON DELETE CASCADE` nicht. Generation-1 /
   `ensureVisitPortalSchema`: Sessions/Docs `ON DELETE CASCADE` auf `visits`;
   `visit_host_state` hat CASCADE ab Create. `user_version` 0 ohne Portal-Ensure:
   Baseline `documents.visit_id` / `patient_sessions.visit_id` **ohne** Visit-FK
   (`001_baseline.sql`). `foreign_key_check` sieht solche Waisen nicht.
   Flow-Core `visit_topics` / `visit_events`: FK ohne CASCADE — blocken
   `DELETE FROM visits` wenn sie noch Zeilen haben. Catalog-FKs zeigen auf
   visits nicht; `supersedes_*` ohne FK.
3. `terminal_assist_pending` hat keine Visit-FK; extra löschen bleibt richtig.
   Outbox bleibt im Kernel. `device_authorizations` ohne Visit-FK — nicht Cut 1.
4. `recallVisit` plant den Timer **nach** erfolgreichem `withTransaction`.
   `returnToWaiting` kündigt **vor** der TX. `pressTerminalAssist`,
   `releaseTerminalAssist`, `clearAllTerminalAssistPending` und beide Resets
   rufen Scheduler **innerhalb** der TX auf.
5. `requirePatientSessionFromDb` schreibt (`expirePatientSessionStmt`,
   `touchPatientSessionStmt`) und öffnet **keine** TX.
   Ohne äußere TX: `getPatientSession`, `getPatientSessionMe`,
   `listPatientDocuments` (`documentDeps().requirePatientSession` → direkt
   `requirePatientSessionFromDb`). Mit äußerer TX: `submitPatientSession`,
   `intakePatientDocument` / `intakeFormDocuments`, `discardPatientDocument`.
6. `withTransaction` ist `BEGIN IMMEDIATE` ohne Savepoint. Zweites
   `BEGIN IMMEDIATE` in einer offenen TX bricht.

---

## Festgelegt (Scope)

1. Drei Schnitte, nacheinander. Jeder Schnitt allein mergebar, Tests grün,
   kein Fassaden-Split von `CoreDatabase`.
2. Kein neues Produktverhalten: kein neues Setting, keine neue API, kein
   Disk-Wipe der Export-/Upload-Dateien in Schnitt 1–3.
3. Kein Umbau Migrations-Runner / `SCHEMA_GENERATION` / `002`/`003`.
4. `waiting_room_full`, tote Statements, Ticket-Vokabular: nicht dieser Plan.
5. `resetFlowCoreRuntimeForTests` bleibt der Prozess-Cache-Drop (Name später).
6. SQLite-FK bleiben `PRAGMA foreign_keys = ON` am Connection-Start wie heute.

---

## Schnitt 1 — Reset löscht Abhängige mit FK an

**Vertrag:** Nach `resetBusinessDay` und nach `executeRuntimeReset` auf einer
echten SQLite (nicht Statement-Mocks):

- `visits`, `visit_events`, `visit_topics`, `patients`, `daily_queue_counters`
  leer.
- `visit_host_state`, `patient_sessions`, `documents` leer.
- `terminal_assist_pending` leer (wie heute).
- `PRAGMA foreign_key_check` leer (nur wo FKs existieren — Counts sind die
  Wahrheit für Baseline-Waisen).
- Catalog/Settings/Auth/Device-Grants/Messaging-Config unverändert zum heutigen
  Kernel (Runtime-Reset stellt Settings/Messaging wie heute wieder her).

**Wie (ohne Code hier):** `clearFlowCoreVisitRuntime` lässt `foreign_keys` **an**.
Delete-Reihenfolge muss SQLite erfüllen:

1. Kinder ohne CASCADE: `visit_events`, `visit_topics` (wie heute, nur mit FK an).
2. `visits` — CASCADE räumt `visit_host_state`, `patient_sessions`, `documents`
   nur wenn die Portal-FKs existieren.
3. `patients`.
4. `daily_queue_counters`.

Legacy (kein Visit-CASCADE): explizit `documents`, `patient_sessions`,
`visit_host_state` **vor** `visits` löschen, idempotent, Tabellen dürfen fehlen
(`sqlite_master`-Guard nur im Reset-Pfad).

Kein `PRAGMA foreign_keys = OFF` mehr in diesem Pfad. Kein
`foreign_keys = OFF` um Delete-Order zu umgehen.

**Tests (zwei Fixtures, beide Counts + `foreign_key_check`):**

1. `createCurrentSchema` (Generation-1, CASCADE): Visit + Host-State + Session +
   Document, dann `resetBusinessDay` und `executeRuntimeReset`. Assert alle
   genannten Tabellen leer **und** leeres `foreign_key_check`. FK-Check allein
   reicht nicht.
2. Legacy-Seed: `001_baseline.sql` **ohne** `ensureVisitPortalSchema` (kein
   Visit-CASCADE auf Sessions/Docs). Dieselben Zeilen anlegen, Reset, Assert:
   dieselben Tabellen leer. Deckt den expliziten Delete-vor-visits-Zweig.
   Kein Migrations-Runner-Umbau — nur Test-Schema-Seed.

Kernel-Mocks bleiben für Phase/Lock/Outbox; sie ersetzen die SQLite-Tests nicht.

**Nicht:** Dateien unter Export-/Upload-Pfad löschen. Outbox-Delete bleibt im
Kernel wie heute.

---

## Schnitt 2 — Timer nur nach Commit

**Vertrag:** Prozess-Timer (Recall-Expiry, Terminal-Assist-Expiry) werden nur
geplant oder gekündigt, wenn die dazugehörige SQLite-TX committed hat. Bei
Rollback bleibt der Timer-Stand wie vor dem Call.

**Pfade:**

| Call | Heute | Soll |
| ---- | ----- | ---- |
| `recallVisit` | schedule nach TX | unverändert |
| `returnToWaiting` | cancel vor TX | cancel nach erfolgreicher TX |
| `pressTerminalAssist` | schedule in TX | schedule nach TX |
| `releaseTerminalAssist` | cancel in TX | cancel nach erfolgreicher TX |
| `clearAllTerminalAssistPending` | cancel in TX | cancel nach TX |
| `resetBusinessDay` / `executeRuntimeReset` | `clearAllTerminalAssistPendingExpiries` in der äußeren TX | nur Expiries/cancel **nach** COMMIT der äußeren TX |

Reset/Runtime-Reset: Tabellen-Clear (`clearAllTerminalAssistPending` auf der DB)
und `clearFlowCoreVisitRuntime` bleiben **in** der äußeren TX. Nicht
`this.clearAllTerminalAssistPending()` von innen aufrufen (würde eine zweite
TX öffnen).

Wenn die TX scheitert: kein cancel/schedule. Bestehende Timer bleiben gültig
(Recall-Poll `processExpiredRecallWindows` bleibt Sicherheitsnetz).

**Tests:** bestehender Recall-Scheduler-Test plus: Fake, der in der TX wirft;
assert Timer-Map unverändert. Assist analog, falls Scheduler testbar ist;
sonst Reset-Pfad: Throw nach DB-Write simulieren nur, wenn ohne die TX zu
committen — nicht den Produktivpfad mit absichtlichem `ROLLBACK` nach
Side-Effect testen.

**Nicht:** Scheduler umbauen (kein Redis, kein SQLite-Timer-Table).

---

## Schnitt 3 — Session-Mutation atomar

**Vertrag:** Jeder Pfad, der `patient_sessions` updated (`touch`, `expire`,
`revoke`), läuft in `withTransaction` oder in einer bereits offenen Write-TX
des Callers.

**TX-Regel (kein Nesting):**

- `requirePatientSessionFromDb` öffnet **nie** selbst eine TX (bleibt
  Statement-only).
- `withTransaction` hat keinen Savepoint-Pfad. Kein zweites `BEGIN IMMEDIATE`.
- Caller **ohne** offene Write-TX wrappen auf `CoreDatabase`:
  `getPatientSession`, `getPatientSessionMe`, `listPatientDocuments`.
- Caller **mit** bereits offener TX bleiben unverändert (nur äußere TX):
  `submitPatientSession`, `intakePatientDocument`, `intakeFormDocuments`,
  `discardPatientDocument`. Dort darf `documentDeps().requirePatientSession`
  keine zweite TX starten — folgt aus Regel 1.

`listPatientDocuments` geht heute über `documentDeps().requirePatientSession`,
nicht über `getPatientSession`. Nur Session-GET-Wrapper reichen nicht.

**Festlegung:** Touch/`expire` bei gültigem Token bleibt Produktverhalten
(Session lebt durch Nutzung; abgelaufene Session wird als `expired` markiert).
Kein zweites Session-Modell. Kein Entfernen von `last_seen`.

**Tests:** bestehender Session-Flow; ein Test, dass Expire+Throw nicht halb
schreibt, ist optional wenn die eine TX das erzwingt.

---

## Reihenfolge und Halt

1. Schnitt 1. Ohne den ist Schnitt 2/3 Kosmetik am lecken Modell.
2. Schnitt 2.
3. Schnitt 3.
4. Halt. Nächster Plan (nicht hier): Disk-Dokumente nach Reset, Zombie-Spalte,
   Schema-Quellen zusammenziehen.

---

## Explizit nicht

- `CoreDatabase` splitten oder Deps-Bags cachen.
- `ops_settings` JSON in Tabellen.
- In-Memory Device-Grant-Store an Baseline angleichen (außer er bricht durch
  Schnitt 1 — dann nur Test-Schema, kein Prod-Verhalten).
- Baseline `date('now','localtime')` vs `BUSINESS_TZ` (eigener Mini-Fix, nicht
  an Schnitt 1 hängen).
- Packager-Pfad zu `packages/flow-core/db/schema.sql`.
- Migrations-Runner anfassen (Legacy-Test seedet Baseline direkt).
