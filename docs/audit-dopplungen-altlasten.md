# Audit: Dopplungen und Altlasten

Stand: 2026-08-22

## Ergebnis der zweiten Audit-Welle

Geprüft wurden 731 produktive TypeScript-, Svelte- und MJS-Dateien in `app`, `ui`,
`setup`, `manager`, `sandbox`, den Workspace-Packages und `scripts`. 193 Testdateien
wurden getrennt betrachtet; generierte Dateien, Build-Ausgaben und `node_modules`
blieben ausgeschlossen.

Die Suche kombinierte:

- identische Dateien und Textblöcke,
- AST-nahe Funktionsvergleiche ohne Bezeichner, Literale, Kommentare und Formatierung,
- doppelte Exportnamen und gleichnamige Verträge,
- Abgleich gegen vorhandene Domain-, Shared- und OpenAPI-Quellen,
- manuelle Bewertung der Schicht- und Laufzeitgrenzen.

Es gibt keine vollständig identischen produktiven Quelldateien außerhalb generierter
Artefakte. Die relevanten Dopplungen sind überwiegend strukturell oder semantisch.

### Aktive Arbeitsliste

Erledigte Befunde stehen nicht mehr in der Priorisierung, sondern gesammelt unter
[Abgeschlossen](#abgeschlossen).

| Reihenfolge | ID      | Kandidat                                                     | Status           | Priorität | Effort |
| ----------- | ------- | ------------------------------------------------------------ | ---------------- | --------- | ------ |
| 1           | DUP-008 | gemeinsames Route-Parsing für beide Drift-Checks             | bereinigen       | mittel    | S      |
| 2           | DUP-010 | App/Sandbox-`FormPdfDisplay`-Vertrag zentralisieren          | bereinigen       | mittel    | S–M    |
| 3           | DUP-015 | Portal-Control-Inferenz als Vertrag klären                   | entscheiden      | mittel    | S–M    |
| 4           | DUP-014 | DB-Snapshot-Vergleich als gemeinsamen Vertragshelfer führen  | entscheiden      | niedrig   | S      |
| 5           | DUP-003 | Monorepo-Root-Suche zentralisieren                           | entscheiden      | niedrig   | S      |
| 6           | DUP-013 | gemeinsamen Prozess-Runner bei nächster Änderung extrahieren | bei Gelegenheit  | niedrig   | S      |
| 7           | DUP-004 | Proxy-Compose-Overlays                                       | vorerst behalten | niedrig   | S      |

### Offene Befunde

#### DUP-003: Monorepo-Root-Suche existiert zweimal

`setup/src/project-root.ts` und `manager/src/main/project-root.ts` laufen beide
maximal zwölf Verzeichnisse nach oben und suchen das Paket `praxis_flow`.
Unterschiedlich sind hauptsächlich Defaults, Fehlermeldung und die optionale
Variante.

Empfehlung: den gemeinsamen Suchkern in ein Node-taugliches Shared-Modul
verschieben. Lokale Wrapper dürfen paketbezogene Fehlermeldungen und Defaults
behalten. Priorität niedrig, weil die Logik klein ist und sich selten ändert.

#### DUP-004: Proxy-Compose-Overlays sind semantisch identisch

`docker-compose.proxy.yml` und `docker-compose.proxy.delivery.yml` unterscheiden
sich nur in Kommentar und Anwendungsbeispiel. Die getrennten Dateinamen passen zum
Packaging-Modell, da Release-Pakete die `*.delivery.yml`-Templates mitnehmen.

Bewertung: vorerst behalten. Falls eine der Dateien geändert wird, eine kanonische
Vorlage mit Packaging-Kopie oder zumindest einen Gleichheits-/Drift-Check ergänzen.

#### DUP-008: Route-Parser für zwei Architektur-Checks ist doppelt

`scripts/check-auth-route-rules.mjs` und `scripts/check-openapi-route-sync.mjs`
enthalten dieselbe Regex-basierte Funktion `parseRegisteredRoutes` und fast
dieselbe rekursive Dateisuche. Wenn Fastify-Routen künftig anders geschrieben
werden, können die beiden Schutzmechanismen unterschiedlich reagieren.

Empfehlung: Collection und Parsing in einen gemeinsamen Script-Helper verschieben.
Der Aufrufer entscheidet lediglich, ob Testdateien berücksichtigt werden und wie
Pfade normalisiert werden.

#### DUP-010: `FormPdfDisplay` ist ein doppelter App/Sandbox-Wire-Contract

Die vier Typen `FormPdfDisplay`, `FormPdfDisplayMeta`, `FormPdfDisplayField` und
`FormPdfDisplaySection` sind in `app/src/shared/forms/form-pdf-display.ts` und
`sandbox/src/form2pdf-types.ts` strukturell gleich. Der App-Prozess erzeugt diese
Daten; die Sandbox validiert und rendert sie.

Empfehlung: Typen und Runtime-Guard in `@praxis-flow/server-shared` führen. App und
Sandbox hängen bereits von diesem Package ab. Der App-spezifische Aufbau und das
Sandbox-spezifische Layout bleiben lokal.

#### DUP-013: Release-Skripte kopieren Prozess-Runner

`scripts/build-release-images.mjs` und `scripts/build-pfupdate.mjs` enthalten
identische `run`- und `runCapture`-Funktionen. Ein gemeinsamer Script-Helper ist
sinnvoll, sobald einer der beiden Build-Flows wieder angefasst wird. Priorität
niedrig, weil die Logik klein und aktuell gleich ist.

#### DUP-014: DB-Snapshot-Gleichheit wird an App- und Setup-Grenze separat definiert

`dbSnapshotsEquivalentForRestore` in
`app/src/shared/settings/settings-snapshot-import.ts` und
`dbSnapshotsEquivalent` in `setup/src/settings-snapshot-db-verify.ts` vergleichen
dieselben drei Bereiche per `JSON.stringify`. Da dies eine Restore-Verifikation
über eine Prozessgrenze ist, sollte entweder der Vergleich im Shared-Vertrag
liegen oder explizit dokumentiert werden, warum Produzent und Orchestrator jeweils
eine eigene Prüfung besitzen.

#### DUP-015: Portal-Control-Inferenz läuft in Backend und UI

`app/src/shared/forms/portal-field-metadata.ts` und
`ui/src/lib/portal/anamnese-field-control.ts` leiten aus Feldtyp und `maxLength`
dieselbe Eingabekomponente ab. Das Backend liefert `portalControl` bereits mit;
die UI verwendet die Kopie als Fallback.

Empfehlung: entscheiden, ob `portalControl` ein verpflichtender Transportvertrag
ist. Falls ja, UI-Fallback entfernen und das OpenAPI-Schema verschärfen. Falls der
Fallback für Abwärtskompatibilität nötig ist, die Regel browser-sicher teilen und
mit einem expliziten Kompatibilitätstest absichern.

### Bewusst nicht konsolidieren

#### OK-001: Generierte OpenAPI-Typen für App und UI

App und UI bleiben getrennte Consumer-Grenzen und erhalten jeweils eigene
`*-openapi.d.ts`. Die gemeinsame Spec-Tabelle, Generierung und die Drift-Guards
liegen unter DUP-002; ein zusätzliches Shared-Package ist nicht gerechtfertigt.

#### OK-002: Raumkapazitäts-Adapter für App und UI

Die Fachlogik liegt in `@praxis-flow/domain`. App und UI besitzen dünne Adapter für
ihre unterschiedlichen Datenformen und ergänzen jeweils schichtspezifische
Validierung beziehungsweise Darstellung.

#### OK-003: Lokale Domain-Re-Exports

Lokale Re-Exports wie `app/src/shared/ops/device-ids.ts`,
`app/src/shared/topic-icon-ids.ts` und `app/src/shared/checkin-topics.ts`
stabilisieren App-interne Importgrenzen. Direkte Workspace-Imports sind derzeit
keine allgemeine Projektregel.

#### OK-004: Expiry-Scheduler

Terminal-Assist-Pending und Recall-Window verwenden ähnliche Timer-Strukturen.
Retry-Intervall, Datenquelle, Ablaufaktion und Resync-Verhalten sind jedoch
fachlich verschieden. Eine generische Scheduler-Abstraktion würde derzeit mehr
Konfiguration als gemeinsame Fachlogik erzeugen.

#### OK-005: Call-Announcement-Reachability in App und UI

Backend und UI exportieren ähnlich benannte Funktionen. Das Backend entscheidet
autoritativ anhand der Presence-Registry; die UI zeigt lediglich einen Hinweis
aus ihrem SSE-Zustand. Diese Doppelung markiert eine sinnvolle Trust-Grenze.

#### OK-006: Restore-/Update-Phasenprojektion

`restorePhaseFromCutover` und `updatePhaseFromCutover` haben denselben Switch-Aufbau,
übersetzen aber bewusst in zwei verschiedene externe Fortschrittsvokabulare. Die
kleine explizite Projektion ist lesbarer als ein generischer Mapper.

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
- **bei Gelegenheit**: kleine, stabile Dopplung ohne aktuellen Änderungsdruck,
- **behalten**: Dopplung ist generiert, eine sinnvolle Grenzschicht oder verhältnismäßig.

Build-Ausgaben, `node_modules`, `.svelte-kit`, `dist`, `out` und `ui/build` wurden
bei beiden repositoryweiten Inventur-Durchgängen ausgeschlossen.

**OK-\*-Einträge nicht anfassen**, solange keine bewusste Architekturentscheidung
das ändert. Sie sind Absicherung gegen Drive-by-Refactors.

## Abgeschlossen

| ID      | Ergebnis                                                                                     | Datum      |
| ------- | -------------------------------------------------------------------------------------------- | ---------- |
| LEG-001 | veralteten Tar-Pfad-Alias entfernt; `validateTarArchiveEntries` bleibt kanonisch             | 2026-07-23 |
| LEG-002 | `SaveEnvBackupResult` entfernt; interner Consumer nutzt `SavePfbackupResult`                 | 2026-07-23 |
| LEG-003 | Flow-Core-PoC-HTTP, Referenz-UI und Standalone-Oberfläche entfernt                           | 2026-07-28 |
| DUP-001 | Ticket-Code-Formatierung und -Parser in `@praxis-flow/domain` kanonisiert                    | 2026-07-23 |
| DUP-002 | OpenAPI-Type-Orchestrierung und Sync-Guards zusammengeführt; Outputs bleiben getrennt        | 2026-08-22 |
| DUP-005 | UI-Spiegeltypen durch Aliase auf lokal generierte OpenAPI-Typen ersetzt                      | 2026-08-22 |
| DUP-007 | gemeinsamen `registerDefaultErrorHandler` für App und Maintenance-App eingeführt             | 2026-08-22 |
| DUP-009 | Default-Aufrufraum an `listEnabledRooms` und `resolveDefaultCallRoomId` gekoppelt            | 2026-08-22 |
| DUP-011 | Setup-DTOs aus `@praxis-flow/server-shared` übernommen und lokal re-exportiert               | 2026-08-22 |
| DUP-012 | `sha256File` in Setup zentralisiert; bestehender Pfupdate-Import bleibt als Re-Export gültig | 2026-08-22 |
| DUP-006 | lokale Smoke-`requestJson`/`assert` durch `smoke-helpers` ersetzt; `durationMs` ergänzt      | 2026-08-22 |

Zu DUP-002: `scripts/openapi-types-lib.mjs` hält die gemeinsame Spec-Tabelle und
Orchestrierung. UI und App behalten eigene generierte Zielbäume; `identity.yaml`
bleibt App-only.

Zu DUP-005: Die bisherigen öffentlichen UI-Typnamen bleiben als Re-Exports
erhalten. Ops-, Terminal- und Portal-Transporttypen stammen aus `components` oder
`paths` der jeweils lokalen generierten Deklarationen. Echte View-Models bleiben
lokal.

Zu DUP-006: Fünf identische `requestJson`-Kopien und sechs lokale `assert`-Kopien
nutzen den Shared-Helper. `requestJson` liefert zusätzlich `durationMs`;
`smoke-doc-flow.mjs` behält `fetchTimed` und `requestMultipart` lokal.

## Nächste Audit-Wellen

1. App-Backend: parallele Route-/Service-/DB-Helfer und alte Visit-/Queue-Pfade.
2. UI: ähnliche Fetch-Wrapper, Controller und View-Model-Mappings.
3. Setup/Manager: doppelte Backup-, Update-, Netzwerk- und Compose-Modelle.
4. Dokumentation: aktive Spezifikation gegen abgeschlossene Pläne, Handovers und
   historische Todos abgrenzen.
5. Tests: doppelte Contract-Tests von sinnvollen Schichttests unterscheiden.
