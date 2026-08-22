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

| Reihenfolge | ID      | Kandidat                                                    | Status      | Priorität | Effort |
| ----------- | ------- | ----------------------------------------------------------- | ----------- | --------- | ------ |
| 1           | DUP-005 | UI-Transporttypen aus vorhandenem OpenAPI ableiten          | bereinigen  | hoch      | M      |
| 2           | DUP-006 | lokale Smoke-`requestJson` durch Shared-Helper ersetzen     | bereinigen  | mittel    | S      |
| 3           | DUP-009 | Default-Aufrufraum vollständig an Domain koppeln            | bereinigen  | mittel    | S      |
| 4           | DUP-008 | gemeinsames Route-Parsing für beide Drift-Checks            | bereinigen  | mittel    | S      |
| 5           | DUP-007 | gemeinsamen Fastify-Error-Handler verwenden                 | bereinigen  | mittel    | S      |
| 6           | DUP-010 | App/Sandbox-`FormPdfDisplay`-Vertrag zentralisieren         | bereinigen  | mittel    | S–M    |
| 7           | DUP-011 | Setup-DTOs aus `server-shared` verwenden                    | bereinigen  | mittel    | S      |
| 8           | DUP-002 | OpenAPI-Generatoren und Sync-Checks vereinheitlichen        | bereinigen  | mittel    | M      |
| 9           | DUP-012 | `sha256File` innerhalb von Setup zentralisieren             | bereinigen  | niedrig   | S      |
| 10          | DUP-014 | DB-Snapshot-Vergleich als gemeinsamen Vertragshelfer führen | entscheiden | niedrig   | S      |
| 11          | DUP-003 | Monorepo-Root-Suche zentralisieren                          | entscheiden | niedrig   | S      |

### Neue Befunde

#### DUP-005: UI modelliert vorhandene OpenAPI-Responses nochmals von Hand

Mehrere UI-Clients deklarieren Response-DTOs manuell, obwohl dieselben Schemas in
OpenAPI stehen und bereits generierte UI-Typen existieren:

- `ui/src/lib/mfa/practice-ops-api.ts`: Day-Lifecycle, Business-Day-Statistik und
  Routing-Capabilities,
- `ui/src/lib/ops/ops-system-api.ts`: Deployment-Storage, Contact-Lookup,
  Messaging-Provider und Runtime-Reset,
- `ui/src/lib/terminal/terminal-api.ts`: Terminal-Assist und Ops-Heartbeat,
- `ui/src/lib/portal/types.ts`: Session-Resolve, Session-Me und Captive-Authorize.

Beispielsweise sind `DayLifecycleResponse`, `RuntimeResetResponse`,
`DeploymentStorageResponse`, `MessagingProviderCatalogResponse` und
`OpsHeartbeatResponse` bereits in den generierten Deklarationen vorhanden.

Risiko:

- `check-openapi-types-sync` schützt nur die generierten Dateien, nicht die
  handgeschriebenen Spiegeltypen;
- Änderungen am Schema können trotz grünem Drift-Check unbemerkt am UI-Client
  vorbeilaufen;
- die bestehende OpenAPI-first-Regel wird an mehreren Stellen umgangen.

Empfehlung:

1. In den jeweiligen `openapi-types.ts` sprechende Aliase für Response- und
   Request-Schemas exportieren.
2. API-Clients ausschließlich mit diesen Aliasen typisieren.
3. UI-eigene View-Models nur dort behalten, wo sie Daten tatsächlich transformieren.
4. Nicht die generierten App- und UI-Dateien zusammenlegen; OK-001 bleibt gültig.

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

#### DUP-007: Standard-Fehlerbehandlung ist in beiden Fastify-Apps identisch

`app/src/app.ts` und `app/src/maintenance-app.ts` registrieren denselben Handler
für Fastify-Validierungsfehler, Domain-Fehler und unbekannte Fehler.

Empfehlung: `registerDefaultErrorHandler(app)` unter `app/src/http/` einführen und
in beiden App-Buildern verwenden. Die getrennten App-Builder bleiben sinnvoll;
nur die globale Fehlersemantik wird zentralisiert.

#### DUP-008: Route-Parser für zwei Architektur-Checks ist doppelt

`scripts/check-auth-route-rules.mjs` und `scripts/check-openapi-route-sync.mjs`
enthalten dieselbe Regex-basierte Funktion `parseRegisteredRoutes` und fast
dieselbe rekursive Dateisuche. Wenn Fastify-Routen künftig anders geschrieben
werden, können die beiden Schutzmechanismen unterschiedlich reagieren.

Empfehlung: Collection und Parsing in einen gemeinsamen Script-Helper verschieben.
Der Aufrufer entscheidet lediglich, ob Testdateien berücksichtigt werden und wie
Pfade normalisiert werden.

#### DUP-009: Default-Aufrufraum ist trotz Domain-Quelle zweimal im Backend implementiert

`@praxis-flow/domain` stellt mit `listEnabledRooms` und
`resolveDefaultCallRoomId` bereits die kanonische Regel bereit. Die gleiche Filter-
und Fallback-Regel steht zusätzlich in:

- `app/src/shared/checkin-topic-settings.ts`,
- `app/src/shared/db/database-ops-settings.ts`.

Die UI verwendet die Domain-Quelle bereits über einen dünnen Adapter.

Empfehlung: beide Backend-Stellen auf die Domain-Funktionen umstellen. Lokale
Wrapper dürfen erhalten bleiben, wenn sie statt einer ID das vollständige
`OpsSettings`-Room-Objekt liefern.

#### DUP-010: `FormPdfDisplay` ist ein doppelter App/Sandbox-Wire-Contract

Die vier Typen `FormPdfDisplay`, `FormPdfDisplayMeta`, `FormPdfDisplayField` und
`FormPdfDisplaySection` sind in `app/src/shared/forms/form-pdf-display.ts` und
`sandbox/src/form2pdf-types.ts` strukturell gleich. Der App-Prozess erzeugt diese
Daten; die Sandbox validiert und rendert sie.

Empfehlung: Typen und Runtime-Guard in `@praxis-flow/server-shared` führen. App und
Sandbox hängen bereits von diesem Package ab. Der App-spezifische Aufbau und das
Sandbox-spezifische Layout bleiben lokal.

#### DUP-011: Setup implementiert Teile seines Shared-API-Vertrags erneut

Folgende lokalen Setup-Typen spiegeln bereits exportierte DTOs aus
`packages/server-shared/src/setup-api.ts`:

- `NetworkAddress` und `NetworkInterfaceInfo` in `setup/src/network.ts`,
- `PfupdateApplyInput` in `setup/src/settings-backup-update.ts`,
- `PfupdateInspectInput` in `setup/src/pfupdate-inspect.ts`.

Empfehlung: Shared-Typen importieren beziehungsweise gezielt re-exportieren. Die
Implementierungsdateien sollen nicht zu einer zweiten Vertragsquelle werden.

#### DUP-012: `sha256File` existiert zweimal im Setup-Workspace

`setup/src/delivery-images.ts` und `setup/src/pfupdate-package.ts` enthalten die
gleiche synchrone SHA-256-Dateifunktion. Eine der Implementierungen sollte in
einen kleinen lokalen Datei-/Digest-Helper verschoben werden.

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
| 4       | DUP-002 | OpenAPI-Generator/Sync-Checks vereinheitlichen (gleiche Guards)   | M      |
| ✅ 5    | LEG-003 | PoC-HTTP/UI aus aktivem Build entfernen                           | L      |
| 6       | DUP-003 | Monorepo-Root-Suche (bei Gelegenheit)                             | S      |
| 7       | DUP-004 | Proxy-Compose: Drift-Check oder Packaging-Kopie (bei Gelegenheit) | S      |

## Kurzpriorisierung

| ID      | Kandidat                                                 | Status                | Priorität | Effort | Konfidenz |
| ------- | -------------------------------------------------------- | --------------------- | --------- | ------ | --------- |
| LEG-001 | `validateTarArchiveEntryPaths`                           | erledigt (2026-07-23) | niedrig   | S      | hoch      |
| LEG-002 | `SaveEnvBackupResult`                                    | erledigt (2026-07-23) | niedrig   | S      | hoch      |
| DUP-001 | Ticket-Code in Domain, Flow-Core, App und Smoke          | erledigt (2026-07-23) | mittel    | S–M    | hoch      |
| DUP-002 | doppelte OpenAPI-Type-Generatoren und Drift-Checks       | bereinigen            | mittel    | M      | hoch      |
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
