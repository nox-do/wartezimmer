# Things To Do Before Release

- [ ] Flow-Core Transaktionsschnitt sauberziehen: `flow-core` mittelfristig transaktionsneutral machen oder zwei Modi anbieten
- [ ] `checkIn()` innerhalb einer bestehenden Host-Transaktion sauber unterstützen
- [ ] Optionalen Komfortpfad mit eigener Transaktion für Standalone-/PoC-Nutzung definieren

## Architektur-Notiz: Transaktions-Owner

- Uns ist ein Integrationsbruch zwischen Host und `flow-core` aufgefallen: beide Schichten wollten auf derselben SQLite-Connection die Write-Transaktion besitzen.
- Der Host startet in `app/src/shared/db/database.ts` eine äußere Transaktion, damit Core-Write, Host-State und Outbox atomar zusammenbleiben.
- `flow-core` hat in `packages/flow-core/src/server/unit-of-work.ts` zusätzlich selbst `BEGIN IMMEDIATE` geöffnet; das ist auf derselben SQLite-Connection nicht verschachtelbar.
- Das Ergebnis war der Laufzeitfehler `cannot start a transaction within a transaction`, sichtbar im Docker-Log beim echten Terminal-Check-in.
- Kurzfristiger Fix: innerer Core-Pfad über `SAVEPOINT`, damit verschachtelte Nutzung stabil läuft.
- Mittelfristiges Ziel: klarer Ownership-Schnitt. Im Produkt sollte der Host der äußere Transaktions-Owner sein; `flow-core` sollte darin transaktionsneutral mitlaufen oder optional einen separaten Standalone-Modus anbieten.
