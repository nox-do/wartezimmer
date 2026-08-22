# Audit: Dopplungen und Altlasten

Stand: 2026-08-22 (zweite Audit-Welle)

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

### Aktuelle Priorisierung

| Reihenfolge | ID      | Kandidat                                                    | Status                | Priorität | Effort |
| ----------- | ------- | ----------------------------------------------------------- | --------------------- | --------- | ------ |
| 1           | DUP-005 | UI-Transporttypen aus vorhandenem OpenAPI ableiten          | erledigt (2026-08-22) | hoch      | M      |
| 2           | DUP-006 | lokale Smoke-`requestJson` durch Shared-Helper ersetzen     | bereinigen            | mittel    | S      |
| 3           | DUP-009 | Default-Aufrufraum vollständig an Domain koppeln            | erledigt (2026-08-22) | mittel    | S      |
| 4           | DUP-008 | gemeinsames Route-Parsing für beide Drift-Checks            | bereinigen            | mittel    | S      |
| 5           | DUP-007 | gemeinsamen Fastify-Error-Handler verwenden                 | erledigt (2026-08-22) | mittel    | S      |
| 6           | DUP-010 | App/Sandbox-`FormPdfDisplay`-Vertrag zentralisieren         | bereinigen            | mittel    | S–M    |
| 7           | DUP-011 | Setup-DTOs aus `server-shared` verwenden                    | erledigt (2026-08-22) | mittel    | S      |
| 8           | DUP-002 | OpenAPI-Generatoren und Sync-Checks vereinheitlichen        | erledigt (2026-08-22) | mittel    | M      |
| 9           | DUP-012 | `sha256File` innerhalb von Setup zentralisieren             | erledigt (2026-08-22) | niedrig   | S      |
| 10          | DUP-014 | DB-Snapshot-Vergleich als gemeinsamen Vertragshelfer führen | entscheiden           | niedrig   | S      |
| 11          | DUP-003 | Monorepo-Root-Suche zentralisieren                          | entscheiden           | niedrig   | S      |

### Neue Befunde

#### DUP-005: UI modelliert vorhandene OpenAPI-Responses nochmals von Hand — erledigt (2026-08-22)

Handgeschriebene Spiegeltypen sind durch Aliase auf die lokal generierten UI-Typen
ersetzt. Bestehende Importnamen bleiben (z. B. `DayLifecycleState`,
`RoutingCapabilities`, `TerminalAssistPressed`). Portal-Session-Typen kommen aus
den inline-`paths` von `documents.yaml`; `identity.yaml` bleibt App-only.
OK-001 unverändert: generierte App-/UI-Dateien nicht zusammengelegt.

#### DUP-006: Smoke-Skripte kopieren einen bereits vorhandenen HTTP-Helper

`scripts/smoke-helpers.mjs` exportiert einen vollständigen `requestJson`-Helper.
Trotzdem implementieren sechs Smoke-Skripte einen lokalen Helper:

- `smoke-day-lifecycle.mjs`,
- `smoke-emergency.mjs`,
- `smoke-messaging-recall.mjs`,
- `smoke-ops-settings.mjs`,
- `smoke-practice-hours.mjs`,
- `smoke-doc-flow.mjs`.

Fünf dieser Funktionen sind strukturell identisch. Der Shared-Helper unterstützt
zusätzlich CSRF, Client-Rollen, Cookie-Updates und Extra-Header. Gerade dadurch ist
die lokale Kopie riskant: neue Auth-Anforderungen erreichen nur einen Teil der
Smokes.

Empfehlung: die fünf einfachen Kopien direkt ersetzen und den Doc-Flow nur um die
tatsächlich benötigte Zusatzfähigkeit ergänzen. Lokale `assert`-Kopien im selben
Zug ebenfalls gegen den exportierten Helper prüfen.

#### DUP-007: Standard-Fehlerbehandlung ist in beiden Fastify-Apps identisch — erledigt (2026-08-22)

`registerDefaultErrorHandler` liegt unter `app/src/http/default-error-handler.ts`.
`app.ts` und `maintenance-app.ts` verwenden denselben Handler.

#### DUP-008: Route-Parser für zwei Architektur-Checks ist doppelt

`scripts/check-auth-route-rules.mjs` und `scripts/check-openapi-route-sync.mjs`
enthalten dieselbe Regex-basierte Funktion `parseRegisteredRoutes` und fast
dieselbe rekursive Dateisuche. Wenn Fastify-Routen künftig anders geschrieben
werden, können die beiden Schutzmechanismen unterschiedlich reagieren.

Empfehlung: Collection und Parsing in einen gemeinsamen Script-Helper verschieben.
Der Aufrufer entscheidet lediglich, ob Testdateien berücksichtigt werden und wie
Pfade normalisiert werden.

#### DUP-009: Default-Aufrufraum ist trotz Domain-Quelle zweimal im Backend implementiert — erledigt (2026-08-22)

`checkin-topic-settings.ts` liefert weiter das Room-Objekt, filtert und fällt
aber über `listEnabledRooms` / `resolveDefaultCallRoomId` aus der Domain.
Der ungenutzte Export in `database-ops-settings.ts` ist entfernt.

#### DUP-010: `FormPdfDisplay` ist ein doppelter App/Sandbox-Wire-Contract

Die vier Typen `FormPdfDisplay`, `FormPdfDisplayMeta`, `FormPdfDisplayField` und
`FormPdfDisplaySection` sind in `app/src/shared/forms/form-pdf-display.ts` und
`sandbox/src/form2pdf-types.ts` strukturell gleich. Der App-Prozess erzeugt diese
Daten; die Sandbox validiert und rendert sie.

Empfehlung: Typen und Runtime-Guard in `@praxis-flow/server-shared` führen. App und
Sandbox hängen bereits von diesem Package ab. Der App-spezifische Aufbau und das
Sandbox-spezifische Layout bleiben lokal.

#### DUP-011: Setup implementiert Teile seines Shared-API-Vertrags erneut — erledigt (2026-08-22)

`network.ts`, `settings-backup-update.ts` und `pfupdate-inspect.ts` importieren
die DTOs aus `@praxis-flow/server-shared` und re-exportieren sie lokal.

#### DUP-012: `sha256File` existiert zweimal im Setup-Workspace — erledigt (2026-08-22)

Eine Implementierung in `setup/src/sha256-file.ts`. `pfupdate-package.ts`
re-exportiert für bestehende Importe.

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
- **behalten**: Dopplung ist generiert, eine sinnvolle Grenzschicht oder verhältnismäßig.

Build-Ausgaben, `node_modules`, `.svelte-kit`, `dist`, `out` und `ui/build` wurden
bei beiden repositoryweiten Inventur-Durchgängen ausgeschlossen.

**OK-\*-Einträge nicht anfassen**, solange keine bewusste Architekturentscheidung
das ändert. Sie sind Absicherung gegen Drive-by-Refactors.

## Empfohlene Reihenfolge der ersten Audit-Welle (historisch)

Effort: **S** ≈ Minuten, **M** ≈ Stunden, **L** ≈ Entscheidung + ggf. größerer Schnitt.

| Schritt | ID      | Aktion                                                            | Effort |
| ------- | ------- | ----------------------------------------------------------------- | ------ |
| ✅ 1    | LEG-001 | Tar-Pfad-Alias entfernen                                          | S      |
| ✅ 2    | LEG-002 | `SaveEnvBackupResult`-Alias entfernen                             | S      |
| ✅ 3    | DUP-001 | Ticket-Code in Domain kanonisieren (inkl. Smoke-Helper)           | S–M    |
| ✅ 4    | DUP-002 | OpenAPI-Generator/Sync-Checks vereinheitlichen (gleiche Guards)   | M      |
| ✅ 5    | LEG-003 | PoC-HTTP/UI aus aktivem Build entfernen                           | L      |
| 6       | DUP-003 | Monorepo-Root-Suche (bei Gelegenheit)                             | S      |
| 7       | DUP-004 | Proxy-Compose: Drift-Check oder Packaging-Kopie (bei Gelegenheit) | S      |

## Kurzpriorisierung

| ID      | Kandidat                                                 | Status                | Priorität | Effort | Konfidenz |
| ------- | -------------------------------------------------------- | --------------------- | --------- | ------ | --------- |
| LEG-001 | `validateTarArchiveEntryPaths`                           | erledigt (2026-07-23) | niedrig   | S      | hoch      |
| LEG-002 | `SaveEnvBackupResult`                                    | erledigt (2026-07-23) | niedrig   | S      | hoch      |
| DUP-001 | Ticket-Code in Domain, Flow-Core, App und Smoke          | erledigt (2026-07-23) | mittel    | S–M    | hoch      |
| DUP-002 | doppelte OpenAPI-Type-Generatoren und Drift-Checks       | erledigt (2026-08-22) | mittel    | M      | hoch      |
| LEG-003 | Flow-Core-PoC-Server und Referenz-UI im Produkt-Monorepo | erledigt (2026-07-28) | mittel    | L      | hoch      |
| DUP-003 | doppelte Monorepo-Root-Suche                             | entscheiden           | niedrig   | S      | hoch      |
| DUP-004 | Proxy-Compose-Overlays mit identischem Inhalt            | behalten/entscheiden  | niedrig   | S      | hoch      |
| OK-001  | generierte OpenAPI-Typen für App und UI                  | behalten              | –         | –      | hoch      |
| OK-002  | Raumkapazitäts-Adapter für App und UI                    | behalten              | –         | –      | hoch      |
| OK-003  | lokale Re-Export-Grenzen für Domain-Konstanten           | behalten              | –         | –      | mittel    |

## Befunde

### DUP-001: Ticket-Code — erledigt (2026-07-23)

Historischer Befund: Formatierung und Parser waren in Domain, Flow-Core, App und
Smoke mehrfach implementiert. Heute exportiert `@praxis-flow/domain` beide
Funktionen; Flow-Core und App bilden nur noch dünne Re-Export-Grenzen und der
Smoke-Helper re-exportiert `formatTicketCode` aus der Domain. Visit-ID-spezifische
Logik bleibt bewusst im Flow-Core.

### DUP-002: OpenAPI-Generierung ist doppelt und bereits unterschiedlich — erledigt (2026-08-22)

Eine Spec-Tabelle und ein Ablauf in `scripts/openapi-types-lib.mjs`. Die alten
Skriptnamen bleiben Wrapper. UI- und App-Checks teilen Missing-File-Sammlung und
`assertGeneratedFilesTracked`. Outputs bleiben getrennt (OK-001); `identity.yaml`
nur App. Tracked-Guard liegt in `openapi-lib.mjs` und bekommt denselben Root.

### LEG-001: Deprecated Tar-Pfad-Validator — erledigt (2026-07-23)

Der nur noch von Tests verwendete Alias `validateTarArchiveEntryPaths` wurde
entfernt. Die produktive und getestete Validierung läuft über
`validateTarArchiveEntries`, die zusätzlich Entry-Typen prüft.

### LEG-002: Alter Env-Backup-Typname — erledigt (2026-07-23)

Der interne Manager-Consumer wurde auf `SavePfbackupResult` umgestellt und der
deprecated Alias `SaveEnvBackupResult` entfernt.

### LEG-003: Flow-Core PoC-Oberfläche — erledigt (2026-07-28)

PoC-HTTP, Referenz-UI (`src/public`), Standalone-Skripte und Package-Meta aus
`packages/flow-core` entfernt. Library-Runtime + Package-Tests bleiben.
Standalone-/Referenz-Snapshot: `../new_flow_core`.

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
Die Orchestrierung ist unter DUP-002 zusammengeführt.

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
