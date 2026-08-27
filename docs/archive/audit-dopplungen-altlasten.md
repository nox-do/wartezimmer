# Audit: Dopplungen und Altlasten

> **Archiviert (2026-08-24).** Zweite Audit-Welle abgeschlossen, keine offenen Befunde.
> Nicht fortschreiben. Docs-Einstieg: [`../README.md`](../README.md).

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

Die aktive Arbeitsliste der zweiten Audit-Welle ist leer.

### Offene Befunde

_(keine)_

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

#### OK-007: Proxy-Compose-Overlays

`docker-compose.proxy.yml` und `docker-compose.proxy.delivery.yml` unterscheiden
sich nur in drei Kommentarzeilen (Usage-Beispiel). Der YAML-Body ist identisch;
beide Dateien stammen aus demselben Commit und sind seither nicht gedriftet.

Anders als Basis-Compose und Gateway-Overlay braucht der Proxy kein `build:` vs.
`image:`-Split: Caddy ist in Dev und Delivery dasselbe Upstream-Image. Die zwei
Dateinamen sind die Packaging-Grenze (`*.delivery.yml` geht in Manager-Bundle und
`.pfupdate`; `resolveComposeFiles` wählt nach Dev/Delivery). Zusammenlegen würde
nur den Dateinamen-Vertrag ändern, ohne Verhalten zu verbessern.

Kein Drift-Check, solange TLS/443 nicht angefasst wird. Dann beide Dateien
gemeinsam ändern — oder erst dann eine kanonische Vorlage bzw. einen
Gleichheitscheck nachziehen.

#### OK-008: Monorepo-Root-Suche in Setup und Manager

`setup/src/project-root.ts` und `manager/src/main/project-root.ts` laufen beide
maximal zwölf Verzeichnisse nach oben und suchen `package.json` mit
`name === "praxis_flow"`. Das ist kein gemeinsamer Vertrag, sondern zwei
dünne Host-Helfer mit unterschiedlicher API:

- Setup braucht `findProjectRootOptional`: Install-Mode liegt oft außerhalb
  des Repos; `null` ist ein gültiger Zustand.
- Manager braucht die strikte Variante nur im unpackaged Dev-Pfad
  (`startDevSetupServer`). Packaged nutzt `process.resourcesPath` und sucht
  das Repo nicht.
- Fehlermeldungen sind produktbezogen (Setup-Code vs. Manager-UI).

Ein Shared-Kern in `@praxis-flow/server-shared` würde ein neues Subpath-Export
brauchen: der Barrel-Import ist im Manager-Renderer schon zweimal an
`node:crypto` gescheitert. Das ist mehr Packaging als die ~25 Zeilen Walk.
Setup darf den Manager nicht importieren; Manager soll Setup nicht als
Library ziehen (Setup läuft als Child).

Setup exportiert zusätzlich eine ungenutzte strikte `findProjectRoot` — kein
Grund für eine Extraktion. Entfernen nur bei gezieltem Cleanup.

#### OK-009: Prozess-Runner in den Release-Skripten

`run` und `runCapture` in `scripts/build-release-images.mjs` und
`scripts/build-pfupdate.mjs` sind identisch (`spawnSync`, `cwd` = Repo-Root,
Fehler → `process.exit`). Dazu kommen dieselben Mini-Helfer `assertDockerReady`,
`assertImageExists`, `ensureProxyImage` und `sha256File`. `smoke-proxy.mjs` hat
einen dritten, anders geformten `run` (wirft, statt zu beenden) und gehört nicht
dazu.

Ein gemeinsamer Script-Helper lohnt die Packaging-Kante nicht: zwei CLI-Dateien,
kein Testvertrag, `process.exit` als API. Die eigentlichen Flows bleiben
verschieden (gzip-Archiv vs. unkomprimiertes `docker save` plus Templates).

Beim Blick auf die Kopie war `buildReleaseImages` gedriftet: nur
`release:images` setzte `PRAXIS_FLOW_STACK_VERSION`. Seit 2026-08-24 liegt der
App-`docker build` in `scripts/release-app-image.mjs`; beide Skripte und ein
Script-Test halten Tag und Build-Arg gleich. Die Runner bleiben lokal.

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

| ID      | Ergebnis                                                                                      | Datum      |
| ------- | --------------------------------------------------------------------------------------------- | ---------- |
| DUP-001 | Ticket-Code-Formatierung und -Parser in `@praxis-flow/domain` kanonisiert                     | 2026-07-23 |
| DUP-002 | OpenAPI-Type-Orchestrierung und Sync-Guards zusammengeführt; Outputs bleiben getrennt         | 2026-08-22 |
| DUP-005 | UI-Spiegeltypen durch Aliase auf lokal generierte OpenAPI-Typen ersetzt                       | 2026-08-22 |
| DUP-006 | lokale Smoke-`requestJson`/`assert` durch `smoke-helpers` ersetzt; `durationMs` ergänzt       | 2026-08-22 |
| DUP-007 | gemeinsamen `registerDefaultErrorHandler` für App und Maintenance-App eingeführt              | 2026-08-22 |
| DUP-009 | Default-Aufrufraum an `listEnabledRooms` und `resolveDefaultCallRoomId` gekoppelt             | 2026-08-22 |
| DUP-010 | `FormPdfDisplay`-Typen und Guard in `@praxis-flow/server-shared`; App/Sandbox re-exportieren  | 2026-08-22 |
| DUP-011 | Setup-DTOs aus `@praxis-flow/server-shared` übernommen und lokal re-exportiert                | 2026-08-22 |
| DUP-012 | `sha256File` in Setup zentralisiert; bestehender Pfupdate-Import bleibt als Re-Export gültig  | 2026-08-22 |
| DUP-008 | Fastify-Route-Scan in `fastify-route-scan.mjs`; Auth- und OpenAPI-Check nutzen dieselbe Menge | 2026-08-22 |
| DUP-015 | `portalControl` verpflichtender Backend-Vertrag; UI-Inferenz entfernt                         | 2026-08-23 |
| DUP-014 | DB-Restore-Vergleich in `@praxis-flow/server-shared`; App-Vollvergleich behält `env` lokal    | 2026-08-23 |
| LEG-001 | veralteten Tar-Pfad-Alias entfernt; `validateTarArchiveEntries` bleibt kanonisch              | 2026-07-23 |
| LEG-002 | `SaveEnvBackupResult` entfernt; interner Consumer nutzt `SavePfbackupResult`                  | 2026-07-23 |
| LEG-003 | Flow-Core-PoC-HTTP, Referenz-UI und Standalone-Oberfläche entfernt                            | 2026-07-28 |

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

Zu DUP-010: Typen und vollständiger Runtime-Guard liegen in
`@praxis-flow/server-shared`. App (`form-pdf-display.ts`) und Sandbox
(`form2pdf-types.ts`) bleiben Re-Export-Grenzen. Builder und PDF-Layout bleiben
lokal. Der Guard prüft jetzt auch `subtitle` und `meta`.

Zu DUP-008: `collectRegisteredAppRoutes` ist die einzige Scan-API. Testdateien
(`*.test.ts`, `*.spec.ts`) sind fest ausgeschlossen — auch die Auth-Fixtures in
`auth-routes.test.ts`. Normalisierung, Regel- und OpenAPI-Vergleich bleiben in
den jeweiligen Checks.

Zu DUP-015: `portalControl` ist verpflichtend im OpenAPI-/Fastify-Vertrag.
`toPortalFormFields` bleibt der Lieferpfad: bekannte Templates dürfen eine Map
haben, alle anderen bekommen den Wert per Inferenz. Die UI rendert nur noch den
gelieferten Wert.

Zu DUP-014: `settingsDbSnapshotsEquivalentForRestore` vergleicht nur
`opsSettings`, `authSettings` und `messagingProviderConfigs`. `exportedAt` und
`settingsFormatVersion` gehören nicht zum Restore-Inhalt. App und Setup
importieren die Funktion direkt. `snapshotsEquivalentForRestore` bleibt App-lokal
und ergänzt `env`. `buildExpectedDbSnapshotAfterImport` bleibt in Setup.

## Nächste Audit-Wellen

1. App-Backend: parallele Route-/Service-/DB-Helfer und alte Visit-/Queue-Pfade.
2. UI: ähnliche Fetch-Wrapper, Controller und View-Model-Mappings.
3. Setup/Manager: doppelte Backup-, Update-, Netzwerk- und Compose-Modelle.
4. Dokumentation: Kunden-Test-Pfad vs. Archiv (2026-08-24); TLS-Zielbild
   `plan-proxy-tls.md`, gemischter Proxy-Plan und Routing-/Auth-/Gateway-Docs unter
   `docs/archive/`.
5. Tests: doppelte Contract-Tests von sinnvollen Schichttests unterscheiden.
