# Audit: Dopplungen und Altlasten

Stand: 2026-07-23 (nachgeschärft)

## Ziel und Bewertungsmaßstab

Dieses Dokument sammelt belegte Kandidaten. Eine Dopplung ist nicht automatisch ein
Fehler. Bewertet werden:

- fachlich unterschiedliche Verantwortung,
- notwendige Schicht- oder Laufzeitgrenzen,
- Drift- und Fehlerrisiko,
- Wartungskosten im Verhältnis zur möglichen Abstraktion,
- belegte Nutzung und dokumentierte Kompatibilitätsanforderungen.

Status:

- **bereinigen**: klare Doppelquelle oder klar auslaufender Kompatibilitätsrest,
- **entscheiden**: Absicht ist dokumentiert, Nutzen und Kosten sollten aber neu bewertet werden,
- **behalten**: Dopplung ist generiert, eine sinnvolle Grenzschicht oder verhältnismäßig.

Dies ist ein erster, repositoryweiter Inventur-Durchgang. Build-Ausgaben,
`node_modules`, `.svelte-kit`, `dist`, `out` und `ui/build` wurden bei der
Quellcodebewertung ausgeschlossen.

**OK-\*-Einträge nicht anfassen**, solange keine bewusste Architekturentscheidung
das ändert. Sie sind Absicherung gegen Drive-by-Refactors.

## Empfohlene Reihenfolge

Effort: **S** ≈ Minuten, **M** ≈ Stunden, **L** ≈ Entscheidung + ggf. größerer Schnitt.

| Schritt | ID      | Aktion                                                                 | Effort |
| ------- | ------- | ---------------------------------------------------------------------- | ------ |
| ✅ 1    | LEG-001 | Tar-Pfad-Alias entfernen                                               | S      |
| ✅ 2    | LEG-002 | `SaveEnvBackupResult`-Alias entfernen                                  | S      |
| ✅ 3    | DUP-001 | Ticket-Code in Domain kanonisieren (inkl. Smoke-Helper)                | S–M    |
| 4       | DUP-002 | OpenAPI-Generator/Sync-Checks vereinheitlichen (gleiche Guards)        | M      |
| 5       | LEG-003 | PoC-HTTP/UI: behalten mit Owner **oder** aus aktivem Build entfernen   | L      |
| 6       | DUP-003 | Monorepo-Root-Suche (bei Gelegenheit)                                  | S      |
| 7       | DUP-004 | Proxy-Compose: Drift-Check oder Packaging-Kopie (bei Gelegenheit)      | S      |

## Kurzpriorisierung

| ID      | Kandidat                                                 | Status               | Priorität | Effort | Konfidenz |
| ------- | -------------------------------------------------------- | -------------------- | --------- | ------ | --------- |
| LEG-001 | `validateTarArchiveEntryPaths`                           | erledigt (2026-07-23) | niedrig   | S      | hoch      |
| LEG-002 | `SaveEnvBackupResult`                                    | erledigt (2026-07-23) | niedrig   | S      | hoch      |
| DUP-001 | Ticket-Code in Domain, Flow-Core, App und Smoke          | erledigt (2026-07-23) | mittel    | S–M    | hoch      |
| DUP-002 | doppelte OpenAPI-Type-Generatoren und Drift-Checks       | bereinigen           | mittel    | M      | hoch      |
| LEG-003 | Flow-Core-PoC-Server und Referenz-UI im Produkt-Monorepo | entscheiden          | mittel    | L      | hoch      |
| DUP-003 | doppelte Monorepo-Root-Suche                             | entscheiden          | niedrig   | S      | hoch      |
| DUP-004 | Proxy-Compose-Overlays mit identischem Inhalt            | behalten/entscheiden | niedrig   | S      | hoch      |
| OK-001  | generierte OpenAPI-Typen für App und UI                  | behalten             | –         | –      | hoch      |
| OK-002  | Raumkapazitäts-Adapter für App und UI                    | behalten             | –         | –      | hoch      |
| OK-003  | lokale Re-Export-Grenzen für Domain-Konstanten           | behalten             | –         | –      | mittel    |

## Befunde

### DUP-001: Ticket-Code hat mehrere Implementierungen

`packages/domain/src/ticket-code.ts` definiert bisher nur `formatTicketCode`.
Dieselbe Formatierung und `parseTicketCode` stehen nochmals in
`packages/flow-core/src/shared/ticket-code.ts`. `parseTicketCode` ist außerdem
nahezu identisch in `app/src/shared/queue/ticket-code.ts` implementiert.
Zusätzlich: `scripts/smoke-helpers.mjs` enthält eine eigene `formatTicketCode`.

Domain exportiert `parseTicketCode` noch nicht — das ist die Lücke, nicht nur
„zweimal dasselbe“.

Der Fund ist nicht nur heuristisch: `packages/flow-core/HANDOVER.md` nennt
„ticket-code mit @praxis-flow/domain deduplizieren“ selbst als offene Merge-Arbeit.

Risiko:

- Format und Parser können unabhängig auseinanderlaufen (Domain / Core / App / Smoke).
- Die Tests liegen derzeit auf mehreren Implementierungen.
- App und UI verwenden bereits die Domain-Funktion für Format, während Flow-Core und
  Smoke weitere kanonisch wirkende Quellen behalten.

Empfehlung:

1. `parseTicketCode` ebenfalls in `@praxis-flow/domain` kanonisieren.
2. Flow-Core importiert `formatTicketCode` und `parseTicketCode` aus der Domain
   (Re-Export ok).
3. `formatVisitId`, `parseVisitId` und `compactBusinessDay` bleiben im Flow-Core,
   sofern Visit-IDs bewusst Core-Verantwortung sind.
4. App-Pfad als dünner Re-Export belassen, wenn er eine stabile Importgrenze ist.
5. Smoke-Helper aus Domain re-exportieren statt eigener Kopie.

### DUP-002: OpenAPI-Generierung ist doppelt und bereits unterschiedlich

`scripts/generate-openapi-types.mjs` und
`scripts/generate-app-openapi-types.mjs` enthalten denselben Ablauf mit
unterschiedlichen Zieltabellen. Auch
`scripts/check-openapi-types-sync.mjs` und
`scripts/check-app-openapi-types-sync.mjs` wiederholen den Prüfablauf.

Die Dopplung hat bereits zu Drift geführt:

- der App-Check verwendet `repoRootFromImportMeta`, der UI-Check berechnet den Root
  separat;
- der App-Check ruft `assertGeneratedFilesTracked` auf, der UI-Check nicht;
- Fehlermeldungen und Missing-File-Behandlung unterscheiden sich.

Empfehlung:

- eine gemeinsame Spezifikation `{ input, outputs[] }` und einen gemeinsamen
  Generator verwenden;
- einen gemeinsamen Sync-Check mit Zielgruppe oder Dateiliste verwenden;
- **dieselben Guards** in beiden Checks (mindestens: Missing-Files +
  `assertGeneratedFilesTracked`) — das ist der konkrete Bug, nicht nur Ästhetik;
- die getrennten npm-Skriptnamen dürfen als stabile Bedienoberfläche erhalten
  bleiben.

Die erzeugten Dateien selbst sind nicht der primäre Fehler; die doppelte
Orchestrierungslogik ist es. Siehe OK-001: Outputs nicht zusammenlegen.

### LEG-001: Deprecated Tar-Pfad-Validator ist nur noch Kompatibilität für Tests

`setup/src/pfupdate-package.ts` markiert
`validateTarArchiveEntryPaths` als deprecated. Außer Definition und gezieltem
Test gibt es keine Nutzung. Die produktive Validierung verwendet
`validateTarArchiveEntries`, die zusätzlich Entry-Typen prüft.

Empfehlung:

- den alten Test auf `validateTarArchiveEntries` umstellen;
- Alias anschließend entfernen.

Das ist ein kleiner, gut isolierter Cleanup.

### LEG-002: Alter Env-Backup-Typname wird intern noch verwendet

`manager/src/shared/host-status.ts` deklariert
`SaveEnvBackupResult = SavePfbackupResult` als deprecated. Der alte Name wird nur
noch von `manager/src/main/save-env-backup.ts` verwendet. Andere IPC-Pfade nutzen
bereits `SavePfbackupResult`. Bereits in `todo.md` als „Rename später“ notiert.

Empfehlung:

- den internen Import und Rückgabetyp auf `SavePfbackupResult` umstellen;
- Alias entfernen, sofern es keinen externen Consumer des privaten
  Manager-Pakets gibt.

### LEG-003: Flow-Core enthält weiterhin eine vollständige PoC-Oberfläche

`packages/flow-core` enthält neben der produktiv importierten Runtime:

- einen eigenen HTTP-/Static-Server (`src/server/http.ts`),
- eine eigene lokale DB-/Seed-Strecke,
- Reset- und Start-Skripte (`dev`/`start` → `dist/server/http.js`),
- eine Referenz-UI unter `src/public`,
- eigene Handovers, Todos und eine Canvas-Datei.

Die Dokumentation bezeichnet HTTP und UI ausdrücklich als PoC beziehungsweise
Cherry-Pick-Quelle. Gleichzeitig ist die Host-Integration laut Handover weitgehend
abgeschlossen. Das ist also eine beabsichtigte Altlast, keine versehentlich tote
Datei.

Kosten:

- zweite ausführbare Oberfläche und API neben Fastify,
- zweite lokale Betriebsart mit eigener DB und Seeds,
- zusätzliche Tests und Dokumentation, die Produktstand und PoC-Stand
  auseinanderhalten müssen,
- bereits dokumentierter Konflikt bei Transaktions-Ownership
  (`things-to-do-before-release.md`).

**Entscheidungsfrage (Ja/Nein):**

1. Brauchen wir Standalone-HTTP + `src/public` noch **aktiv** zum Entwickeln?
2. Wenn **nein**: relevante ADRs/Beispiele archivieren; PoC-HTTP, Referenz-UI und
   Standalone-Skripte aus dem aktiven Build/Testpfad entfernen.
3. Wenn **ja**: Owner, Startbefehl und Verifikationspflicht explizit festlegen.

Nicht pauschal `packages/flow-core` entfernen: Die Produkt-App importiert dessen
Shared- und Server-Runtime aktiv.

### DUP-003: Monorepo-Root-Suche existiert zweimal

`setup/src/project-root.ts` und `manager/src/main/project-root.ts` laufen beide
maximal zwölf Verzeichnisse nach oben und suchen das Paket `praxis_flow`.
Unterschiedlich sind hauptsächlich Defaults, Fehlermeldung und die optionale
Variante.

Empfehlung:

- den gemeinsamen Suchkern in ein Node-taugliches Shared-Modul verschieben;
- lokale Wrapper können paketbezogene Fehlermeldungen und Defaults behalten.

Priorität niedrig: Die Logik ist klein und ändert sich selten.

### DUP-004: Proxy-Compose-Overlays sind semantisch identisch

`docker-compose.proxy.yml` und `docker-compose.proxy.delivery.yml` unterscheiden
sich nur in Kommentar und Anwendungsbeispiel. Der Compose-Inhalt ist identisch.

Die getrennten Dateinamen passen allerdings zum Packaging-Modell: Release-Pakete
nehmen die `*.delivery.yml`-Templates mit. Deshalb ist die Dopplung derzeit
verhältnismäßig.

Mögliche Verbesserung:

- eine kanonische Vorlage führen und die zweite Datei beim Packaging erzeugen
  beziehungsweise kopieren;
- alternativ einen kleinen Gleichheits-/Drift-Check ergänzen.

### OK-001: Generierte OpenAPI-Typen für App und UI

Mehrere `*-openapi.d.ts` sind bytegleich in App und UI. Beide Zielorte werden
explizit generiert, sind getrennte Consumer-Grenzen und werden über Drift-Checks
abgesichert.

Bewertung: behalten. Eine zentrale Generated-Package-Struktur wäre möglich, ist
aber ein Architekturumbau und durch die bloße Dateidopplung nicht gerechtfertigt.
Die Orchestrierung sollte trotzdem wie unter DUP-002 zusammengeführt werden.

### OK-002: Raumkapazitäts-Adapter

Die Fachlogik liegt bereits in `@praxis-flow/domain`. App und UI besitzen dünne
Adapter für unterschiedliche Datenformen:

- Backend: `QueueVisitRow.id`,
- UI: `QueueItem.visitId` und optionales `roomId`,
- Backend ergänzt serverseitige Validierung und Domain-Fehler,
- UI ergänzt Labels und UI-Abfragen.

Bewertung: behalten. Die ähnlichen Mapping-Funktionen sind eine angemessene
Schichtgrenze.

### OK-003: Lokale Domain-Re-Exports

Dateien wie `app/src/shared/ops/device-ids.ts`,
`app/src/shared/topic-icon-ids.ts` und
`app/src/shared/checkin-topics.ts` re-exportieren Domain-Symbole. Sie werden aktiv
über lokale App-Pfade importiert.

Bewertung: vorerst behalten. Sie stabilisieren App-interne Importgrenzen. Eine
Bereinigung lohnt erst, wenn das Projekt bewusst direkte Workspace-Imports als
Regel festlegt.

## Nächste Audit-Wellen

1. App-Backend: parallele Route-/Service-/DB-Helfer und alte Visit-/Queue-Pfade.
2. UI: ähnliche Fetch-Wrapper, Controller und View-Model-Mappings.
3. Setup/Manager: doppelte Backup-, Update-, Netzwerk- und Compose-Modelle.
4. Dokumentation: aktive Spezifikation gegen abgeschlossene Pläne, Handovers und
   historische Todos abgrenzen.
5. Tests: doppelte Contract-Tests von sinnvollen Schichttests unterscheiden.
