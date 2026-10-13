# Transaktionen zwischen Host und Flow-Core

## Atomare Schreibvorgänge

Der Host öffnet in `app/src/shared/db/database.ts` die äußere SQLite-Transaktion.
Core-Schreibvorgänge, Host-Zustand und Outbox-Einträge werden gemeinsam bestätigt
oder zurückgerollt. Alle beteiligten Vorgänge verwenden dieselbe Verbindung.

## Verschachtelte Aufrufe

`runInTransaction()` in `packages/flow-core/src/server/unit-of-work.ts` prüft
`db.isTransaction`:

- Ohne bestehende Transaktion verwendet der Flow-Core `BEGIN IMMEDIATE` und
  anschließend `COMMIT` oder `ROLLBACK`.
- Innerhalb einer Host-Transaktion verwendet er einen eigenen `SAVEPOINT`.
  Erfolg gibt den Savepoint frei; ein Fehler rollt bis zum Savepoint zurück
  und wird an den Aufrufer weitergegeben.

Das Freigeben eines Savepoints bestätigt die äußere Host-Transaktion nicht.
Erst deren Abschluss schreibt den gesamten Vorgang dauerhaft fest. Weitere
Schreibpfade müssen diese gemeinsame Transaktionsgrenze erhalten.
