# Plan: Einfache Neuinstallation mit optionaler Backup-Übernahme

Stand: 2026-09-11

Status: **Plan, kein Code.** Baut auf `.pfbackup` v2 aus
[`plan-backup-v2.md`](plan-backup-v2.md) auf.

---

## 1. Entscheidung

Wir behandeln Update und Neuinstallation bewusst unterschiedlich:

- **Update:** nur für eine laufende, gesunde und über die Maintenance-API
  authentifizierte Installation.
- **Neuinstallation:** ist immer als ausdrücklich bestätigter Weg verfügbar.
  Bei einer vorhandenen, nicht sicher startbaren oder ungesunden Installation
  ist sie der normale Recovery-Weg.
- **Recovery:** keine Reparatur der alten Runtime, sondern eine
  Neuinstallation mit anschließender Übernahme eines gültigen `.pfbackup` v2.

Der Produktablauf ist:

```text
Prepare → Bestätigung → Factory Reset → Fresh Setup → optionaler Restore
```

Die Rückfalllinie bei einer unbrauchbaren Installation ist das Backup. Nach
der ausdrücklichen Bestätigung wird nicht versucht, die alte Runtime-DB, alte
Dokumentartefakte oder einen teilweise defekten Stack rollbackfähig zu halten.
Das vermeidet einen zweiten Update-/Rollback-Mechanismus für kaputte Systeme.

Die Crash-Garantie ist bewusst klein: Nach jedem Manager-, Setup- oder
Host-Crash kann eine saubere Neuinstallation erneut gestartet werden;
`backups/` bleibt erhalten. Es gibt keine Zusage, einen begonnenen Factory
Reset oder Restore exakt an seiner letzten technischen Einzelaktion
fortzusetzen. Ein unklarer Zwischenzustand wird durch eine erneute
Neuinstallation ersetzt.

Bewusst nicht vorgesehen:

- kein allgemeiner Reparaturassistent
- kein `.pfupdate` auf einem gestoppten, unvollständigen oder ungesunden Stack
- kein automatischer Restore ohne Vorschau und Auswahl
- kein Restore von Visits, Queue, Sessions, Dokumenten oder
  `device_authorizations`
- kein Rollback von einer bestätigten Neuinstallation auf die zuvor als
  unbrauchbar bewertete Installation
- keine forensische Rekonstruktion fremder Docker-Installationen

---

## 2. Produktzustände

Das Backend liefert genau einen diskriminierten Installationszustand, keine
überlappenden Boolean-Flags:

```ts
type InstallationState =
  | {
      kind: 'docker-unavailable';
      reason: string;
      operation?: InstallOperationSummary;
    }
  | { kind: 'fresh' }
  | { kind: 'installing'; operation: InstallOperationSummary }
  | { kind: 'healthy'; updateEligible: true }
  | { kind: 'stopped' }
  | { kind: 'needs-reinstall'; reasons: InstallationReason[] };
```

Priorität der Auswertung:

1. Ist Docker nicht prüfbar, lautet der Zustand `docker-unavailable`. Ein
   eventuell aktiver Vorgang wird darin nur zur Anzeige mitgeliefert; in diesem
   Zustand werden weder Update noch Installation fortgesetzt.
2. Ein aktiver Installationsvorgang ergibt `installing`.
3. Sind App und Sandbox gesund und akzeptiert die Maintenance-API den Token,
   lautet der Zustand `healthy`.
4. Sind `.env` und ein konsistenter Release-State vorhanden, aber der Stack
   läuft nicht, lautet der Zustand `stopped`.
5. Gibt es keine maßgeblichen Installationsspuren, lautet er `fresh`.
6. Alle widersprüchlichen oder unvollständigen Spuren ergeben
   `needs-reinstall`.

Proxy, TLS und Gateway sind optionale, separat dargestellte Zustände. Sie
gehören nicht zum `healthy`-Gate und blockieren damit weder Wartung noch
Update. Wenn sie laut Konfiguration aktiv sein sollen, werden ihre Fehler als
eigene Netzwerk-/Dienstwarnung angezeigt.

### Gestoppte Installation

`stopped` bietet als primäre Aktion **Vorhandene Installation starten** und als
bewusst destruktive Alternative **Neu installieren**. Auch bei `healthy` bleibt
die Neuinstallation über einen klar abgesetzten, bestätigten Wartungsweg
verfügbar.

Der mutierende Start-Endpunkt prüft unmittelbar vor `compose up`:

- erwartetes App-Datenvolume existiert bereits
- `praxis-flow.db` existiert darin
- der Check verwendet erst `docker volume inspect`, danach einen temporären
  Utility-Container mit `--network none`, `--read-only` und `volume:ro`

Der Status-Poll startet dafür nicht ständig Utility-Container. Scheitert das
Start-Gate, `compose up`, der Core-Healthcheck oder die Maintenance-
Authentifizierung, bietet der Manager `needs-reinstall` an. Er repariert nichts
automatisch.

---

## 3. Ein Standardmechanismus für Fresh und Reinstall

Fresh Install und Reinstall verwenden denselben zweiphasigen
`.pfinstall`-Import:

1. `preparePfinstall`
2. `activatePreparedPfinstall`

Der heutige `loadDeliveryImagesFromArchive` wird entlang dieser Grenze
zerlegt. Update und `.pfupdate` bleiben eigene Produktpfade; gemeinsam genutzt
werden nur kleine Paket-, Image- und Compose-Prüfprimitive.

### 3.1 Prepare — nicht destruktiv

`preparePfinstall`:

1. verlangt die Endung `.pfinstall`
2. berechnet und prüft den Paket-Hash
3. extrahiert in `installHome/operations/install/<id>/`
4. validiert Manifest, Templates und erlaubte Archivpfade
5. lädt die Docker-Images
6. prüft erwartete Images, Plattform und Proxy-Digest
7. validiert die vorbereitete Compose-Konfiguration
8. kopiert ein optional gewähltes `.pfbackup` v2 in denselben
   Vorgangsbereich und prüft es offline
9. schreibt den Vorgangsmarker atomar mit `phase: prepared`

`docker load` verändert in dieser Phase nur den lokalen Image-Cache. Laufende
Container, Volumes, `.env`, Manager-State und TLS-State bleiben unangetastet.
Nach erfolgreichem Prepare wird der ursprüngliche Host-Pfad der `.pfinstall`
nicht mehr benötigt.

### 3.2 Commit — destruktiv und bestätigt

Erst nach der sichtbaren Bestätigung ruft der Manager
`commitPreparedInstall` auf.

Bei `mode: fresh` aktiviert Commit nur das vorbereitete Release. Bei
`mode: replace` führt Commit vorher den Factory Reset aus.

Der Modus ist kein frei verwendbares Sicherheitsgate des Renderers. Das
Backend prüft unter demselben Mutex unmittelbar vor Commit den aktuellen
Installationszustand. `fresh` ist nur ohne maßgebliche Installationsspuren
zulässig. `replace` ist nach ausdrücklicher Bestätigung aus jedem prüfbaren
Installationszustand möglich und ist auch der Neustartweg für einen
abgebrochenen Installationsversuch.

Die Bestätigung für `replace` nennt ausdrücklich:

- alte Runtime-Daten und Dokument-Intake werden gelöscht
- Geräte müssen neu gekoppelt werden
- vorhandene automatische Backups bleiben erhalten
- TLS wird nur übernommen, wenn das gewählte Backup v2 TLS enthält

Unmittelbar nach der Bestätigung und **vor** der ersten Änderung an Containern,
Volumes oder Host-Dateien wird der Vorgangsmarker atomar auf
`phase: installing` gesetzt. Ab dann wird nie mehr behauptet, die
Altinstallation sei unverändert oder gefahrlos abbrechbar.

---

## 4. Kleiner persistenter Vorgangsmarker

Es gibt höchstens einen aktiven Installationsvorgang pro Install-Home.

```ts
type InstallOperation = {
  schemaVersion: 1;
  id: string;
  mode: 'fresh' | 'replace';
  phase: 'prepared' | 'installing';
  createdAt: string;
  package: {
    sha256: string;
    releaseVersion: string;
  };
  backup: null | {
    fileName: string;
    sha256: string;
    containsTls: boolean;
  };
};
```

Der Marker enthält keine frei verwendbaren Host-Pfade und keine Secrets. Die
Paket- und Backup-Dateien liegen im Vorgangsverzeichnis und werden durch die
gespeicherten Hashes an genau diese Bytes gebunden.

Dateirechte:

- Vorgangsverzeichnis `0700`
- Dateien, insbesondere die unverschlüsselte Backup-Kopie, `0600`
- keine Inhalte oder Secret-Werte in API-Antworten und Logs

### Crash-Verhalten

| Zustand beim Neustart                           | Verhalten                                                                                              |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| kein Marker                                     | normalen Installationszustand bestimmen                                                                |
| `prepared`                                      | Altinstallation ist unverändert; Commit oder Abbruch anbieten                                          |
| `installing`, Stack eindeutig gesund            | Wizard/Abschluss darf wieder geöffnet werden                                                           |
| `installing`, Zustand unvollständig oder unklar | saubere Neuinstallation erneut anbieten; kein automatischer Reset beim Status-Poll                     |
| Crash während Restore                           | keine technische Fortsetzungsgarantie; bei unklarem Zustand Neuinstallation und Restore erneut starten |
| frischer Stack gesund, Marker noch vorhanden    | Abschluss erneut anbieten; ein bereits gesunder Stack gilt nicht als verloren                          |

Vor Commit kann der Vorgang abgebrochen und sein Staging-Verzeichnis gelöscht
werden. Ab `installing` gibt es keinen Rückweg zur alten Runtime. Angeboten
werden nur ein eindeutig sicherer Abschluss/Wizard-Wiedereinstieg oder eine
erneut ausdrücklich bestätigte saubere Neuinstallation.

Ein Backend-Mutex verhindert parallele mutierende Setup-Operationen innerhalb
des Setup-Prozesses. Der persistente Marker unterscheidet nur die fachlich
wichtige Grenze „Abbruch noch sicher“ von „Neuinstallation bereits bestätigt“.
Ein großes Event-Journal, eine generische `resume`-/`abort`-Engine oder ein
Rollback-Snapshot der Altinstallation ist nicht nötig.

---

## 5. Factory Reset als klare Grenze

Der Reset verwendet Docker Compose als Besitzer der Produkt-Ressourcen:

```text
docker compose down --volumes --remove-orphans
```

Damit werden gemeinsam entfernt:

- App-DB-Volume
- `sandbox_intake_data` mit Dokumentartefakten
- `clamav_db` als wiederaufbaubarer Cache
- Container und Compose-Netzwerke des eigenen Projekts

Der Teardown verwendet den expliziten Compose-Projektnamen und die bereits
verifizierten Templates aus dem Vorgangsbereich. Eine nur teilweise lesbare
Altinstallation ist damit nicht die einzige Quelle für die Teardown-
Konfiguration. Ein internes, vorbereitetes Env liefert ausschließlich die für
Compose-Auflösung nötigen Werte.

Nach `down` prüft Setup, dass die bekannten Produkt-Volumes tatsächlich nicht
mehr existieren. Ein verbliebenes Volume darf nur dann gezielt entfernt
werden, wenn Name **und** Compose-Projektlabel zur verwalteten Installation
passen. Andernfalls stoppt der Vorgang als Besitzkonflikt.

Erst wenn Compose-Teardown erfolgreich ist, entfernt Setup eine feste
Allowlist verwalteter Host-Artefakte, unter anderem:

- `.env`
- `manager-state.json`
- installierte Compose-Templates
- generiertes `proxy/Caddyfile`
- `state/tls`
- alte unvollständige Setup-Artefakte

Explizit erhalten bleiben:

- `backups/`
- der aktive Bereich unter `operations/install/<id>/`
- externe Import-/Export-Verzeichnisse
- bereits geladene Docker-Images als Cache

Der vorhandene `resetInstallHome` wird nicht unverändert verwendet. Er wird in
klar benannte Primitive zerlegt:

- `composeDown({ volumes, removeOrphans })`
- `resetManagedInstallArtifacts({ preserveBackups, preserveOperationId })`

Kein rekursives Leeren des gesamten Install-Homes. Fehler beim Compose-
Teardown stoppen den Commit, bevor Host-Dateien entfernt werden.

---

## 6. Docker-Besitz statt eigener Installationsforensik

Produktinvariante: Der ausgelieferte Manager verwaltet genau eine Praxis-Flow-
Installation pro Host/Benutzer und ein festes Install-Home. Dev- und
Test-Instanzen dürfen über `PRAXIS_FLOW_HOME`, Compose-Projektnamen und eigene
Host-Ports isoliert werden.

Die festen `container_name`-Einträge für App, Sandbox und Proxy werden aus den
Compose-Dateien entfernt. Compose benennt und besitzt Ressourcen über den
expliziten Projektnamen. Das verhindert, dass ein Dev-Stack und der installierte
Manager dieselben globalen Container-Namen verwenden.

Folgeänderungen:

- `sandbox-health.ts` adressiert `sandbox` über Compose statt über
  `praxis-flow-sandbox`
- Dev-/Test-Host-Ports für App, Maintenance und Proxy werden konfigurierbar
- Produktiv bleiben die bisherigen Default-Ports bestehen
- lokale App-/Maintenance-URLs werden aus dem Setup-Kontext abgeleitet und
  verwenden bei Dev-/Test-Overrides nicht mehr blind `8080`/`8082`
- fremde Container oder Volumes ohne passenden Compose-Projektbesitz werden
  niemals automatisch entfernt
- ein belegter Produkt-Port durch ein fremdes Projekt ist ein Konflikt, kein
  Anlass zur Übernahme oder Löschung

Historische Installationen mit festen Container-Namen dürfen nur entfernt
werden, wenn deren Compose-Labels den erwarteten Projektnamen belegen.

---

## 7. Automatische Backups

Recovery-Discovery startet erst auf `.pfbackup` v2. Es gibt keine erneute
Sidecar-Sonderlogik.

Setup scannt ausschließlich `installHome/backups/`:

- nur reguläre Dateien `praxis-flow-backup-*.pfbackup`
- keine Symlinks und kein Verlassen des Backup-Verzeichnisses
- neueste Datei zuerst
- vollständige Offline-Prüfung von Container, Manifest, Teile-Hashes, JSON und
  integrierter TLS-Payload
- ungültige neuere Dateien werden übersprungen
- Rückgabe nur von Metadaten und einer serverseitig auflösbaren Candidate-ID,
  niemals eines absoluten Pfads

Die Candidate-ID gilt nur für dieses Backup-Verzeichnis. Beim Prepare wird die
Datei sofort in den geschützten Vorgangsbereich kopiert, erneut geprüft und ihr
äußerer SHA-256 im Marker gespeichert. Vorschau und Restore prüfen denselben
Digest erneut.

Die zwei bekannten Prüfstufen bleiben:

1. `archiveUsable`: vollständig offline prüfbar
2. `restoreCompatible`: erst gegen die frisch gestartete Ziel-App prüfbar

Manifest-Hashes sind Integritätsprüfungen, keine Signatur und kein
Authentizitätsnachweis.

---

## 8. Fresh Setup und Restore

Nach `phase: installing` verwendet der Manager den bestehenden Setup-Wizard.
Ein normaler Reload darf ihn wieder öffnen, wenn der Backend-Zustand dafür
eindeutig ist. Bei einem unvollständigen oder widersprüchlichen Zustand bleibt
als sichere Rückfalllinie immer die erneut bestätigte Neuinstallation.

### Saubere Neuinstallation

Der Wizard läuft normal einschließlich optionalem HTTPS. Nach erfolgreichem
Full-Stack-Health wird der Vorgang abgeschlossen und entfernt.

### Neuinstallation mit Backup

1. Wizard schreibt eine frische `.env` und frische Installations-Secrets.
2. Wizard führt zunächst nur bis zu einer gesunden HTTP-Baseline.
3. Setup prüft das vorbereitete Backup online gegen die neue Maintenance-API.
4. Der vorhandene Restore-Core übernimmt Settings und gegebenenfalls TLS v2.
5. Abschluss erst nach Re-Export-Vergleich und Full-Stack-Health.

Enthält das Backup kein TLS, bleibt die frische Installation HTTP. HTTPS kann
danach wie gewohnt unter Netzwerk eingerichtet werden. Dadurch erzeugt der
Recovery-Fluss nicht erst eine neue Managed-TLS-Identität, die unmittelbar
danach überschrieben würde.

Schlägt der Restore fehl, verwendet der vorhandene Restore-Rollback weiterhin
die gesunde frische HTTP-Installation als Ziel. Die alte, vor Commit verworfene
Runtime ist kein Rollback-Ziel.

Angebote nach einem Restore-Fehler:

- Restore erneut versuchen
- ohne Backup mit der frischen Installation fortfahren
- alternativ die frische Installation abschließen und danach den bestehenden
  manuellen Restore-Dialog für ein anderes Backup verwenden

Ein abgefangener Restore-Fehler nutzt weiterhin den vorhandenen Rollback. Bei
einem Prozess- oder Host-Crash mitten im Restore wird dagegen keine
transaktionale Fortsetzung versprochen. Ist der Zustand danach nicht eindeutig
gesund, startet der Benutzer die Neuinstallation und den Restore erneut.

---

## 9. Restore-Regeln für Release und Secrets

Der Restore verwendet einen gemeinsamen, exakt typisierten Vertrag für Werte,
die nie aus einem Backup auf eine Installation zurückgeschrieben werden:

```ts
const NON_RESTORABLE_INSTALL_ENV_KEYS = [...STACK_IMAGE_ENV_KEYS, ...SECRET_ENV_KEYS] as const;
```

Damit gewinnen immer die Werte der Zielinstallation:

- App-, Sandbox-, Proxy- und optionale Gateway-Images
- `MAINTENANCE_TOKEN`
- `SANDBOX_INTERNAL_TOKEN`
- `AUTH_KEY_CAPTIVE`
- `OPENNDS_FAS_KEY`
- künftig ergänzte, typisierte Installations-Secrets

Provider-Credentials sind Praxisdaten und bleiben außerhalb dieser Liste. Der
aktuelle Release-State in `manager-state.json` gewinnt weiterhin gegen den
Backup-Release-State.

TLS ist die bewusste Ausnahme unter den technischen Identitäten: Es wird nach
den Regeln von Backup v2 einschließlich Zielzustand, Vorschau und bestehender
HTTPS-Bestätigung übernommen.

Diese Secret-Regel gilt für den allgemeinen Restore-Core, nicht nur für den
Recovery-Adapter. Dadurch gibt es keinen zweiten Env-Merge und der bekannte
Maintenance-Token-Fehler kann nicht durch einen Restore erneut eingeführt
werden.

---

## 10. API-Schnitt

Die bestehende Host-Statusantwort erhält das Feld `installation` mit dem
diskriminierten Zustand aus Abschnitt 2. Es braucht keinen zweiten Satz
paralleler Produktflags.

Zusätzliche Endpunkte:

- `POST /api/setup/host/install/prepare`
  - Body: `.pfinstall`-Pfad aus dem nativen Main-Dialog, gewünschter Modus
    `fresh` oder `replace`, optionale Backup-Candidate-ID
  - Backend validiert den Modus gegen den aktuellen Installationszustand
  - führt Abschnitt 3.1 aus
  - liefert Operation-ID und nicht sensitive Paket-/Backup-Metadaten
- `POST /api/setup/host/install/commit`
  - Body: Operation-ID und bei `replace` explizite Bestätigung
  - prüft Modus und Zustand unter dem mutierenden Setup-Mutex erneut
  - wechselt vor der ersten Mutation atomar von `prepared` auf `installing`
  - führt Factory Reset und Release-Aktivierung aus
- `DELETE /api/setup/host/install/operation`
  - nur vor Commit in `phase: prepared`
- `POST /api/setup/host/install/finish`
  - Body: Operation-ID und `restore` oder `without-backup`
  - verwendet bei `restore` den vorhandenen Restore-Core
  - prüft Health und entfernt den Marker bei Erfolg
- `POST /api/setup/host/installation/start`
  - sicherer Startversuch aus `stopped`, einschließlich DB-Gate und Health

Bestehende Endpunkte bleiben:

- manueller Backup-Inspect/Restore mit `{ content }`
- normaler Setup-Plan/Apply
- `.pfupdate`, jedoch mit Backend-Gate `installation.kind === 'healthy'`

Der Renderer entscheidet keine Sicherheits- oder Destruktionsgates. Er zeigt
den Backend-Zustand an und sendet Operation-IDs, keine frei konstruierten
Recovery-Pfade.

Ein fehlgeschlagener oder abgebrochener Vorgang darf die Neuinstallation nicht
dauerhaft blockieren. In `installing` kann derselbe Vorgang mit den bereits
geprüften und gepinnten Paket-/Backup-Bytes erneut von vorn gestartet werden.
`backups/` bleibt dabei erhalten. Nach einem gesunden Abschluss und entferntem
Marker kann wie gewohnt ein neues Paket oder ein anderes Backup gewählt
werden.

---

## 11. Änderungen an bestehenden Komponenten

### Setup

- `delivery-images.ts`: `.pfinstall` in Prepare und Activate zerlegen
- Update-Paketcode nur für gemeinsame Hash-/Image-Prüfprimitive heranziehen;
  keinen gemeinsamen Mega-Orchestrator bauen
- atomaren `install-operation`-Store mit den zwei Phasen `prepared` und
  `installing` ergänzen
- `reset-install-home.ts`: zielgerichteten Factory Reset statt Home-Leerung
- `docker.ts`: `composeDown` mit expliziten Optionen
- `host-state.ts`: diskriminierten Installationszustand liefern
- `app-data-volume.ts`: DB-Gate erst nach Volume-Inspect und nur read-only
- Offline-Backup-v2-Discovery neben dem bestehenden Backup-Core
- `settings-backup-restore.ts`: gemeinsamer
  `NON_RESTORABLE_INSTALL_ENV_KEYS`-Merge
- vorhandenen Restore- und Fresh-DB-Cutover-Core unverändert wiederverwenden,
  soweit dessen Restore-Rollback zur frischen Zielinstallation reicht

### Manager

- `status-view-model.ts`: nicht mehr allein anhand `envExists` routen
- `SetupEntry.svelte`: exakt den gelieferten Installationszustand darstellen
- `wizard-controller.ts`: keine Recovery-Absicht im Renderer persistieren;
  aktive Operation bei jedem Show/Reload vom Backend lesen; bei unklarem
  `installing` eine erneute Neuinstallation anbieten
- Recovery mit Backup überspringt die initiale HTTPS-Konfiguration
- Wartung und `.pfupdate` nur bei `healthy`; das Gate umfasst App, Sandbox und
  authentifizierte Maintenance-API, nicht optionale Proxy-/TLS-/Gateway-Dienste
- bestehende Restore-Vorschau und Fehlerdarstellung wiederverwenden

### Compose und Sandbox

- globale `container_name`-Werte entfernen
- Sandbox-Exec über Compose-Service ausführen
- Dev-/Test-Ports konfigurierbar machen
- `urls.ts` und Aufrufer auf kontextabhängige lokale Host-Ports umstellen
- TLS-Smoke-/Lab-Skripte und Operations-Dokumentation von festen
  Container-Namen lösen

### Shared DTOs

- `InstallationState`, Reason-Codes, Operation-Summary und Backup-Candidate in
  `packages/server-shared/src/setup-api.ts`
- keine sensitiven Env-Werte oder absoluten Pfade in DTOs

---

## 12. Umsetzungsschnitte

### Schnitt A — Compose-Besitz und Zustandsmodell

- globale App-/Sandbox-/Proxy-Containernamen entfernen
- Compose-Servicezugriffe anpassen
- Dev-/Test-Ports konfigurierbar machen
- diskriminierten Installationszustand im Backend ergänzen
- sicheren Startversuch für `stopped`
- Update-Gate auf `healthy`

**Review-Gate:** Dev- und Delivery-Projekt übernehmen keine fremden Container.
Docker-Ausfall führt zu keiner Zustandsentscheidung. Status-Poll erzeugt kein
Volume und keinen Utility-Container.

### Schnitt B — `.pfinstall` Prepare/Activate

- heutigen Loader in zwei Phasen zerlegen
- geschütztes Staging und atomaren Vorgangsmarker ergänzen
- Compose-Konfiguration vor Commit validieren
- Abbruch in `prepared`
- vor der ersten Mutation atomar auf `installing` wechseln
- Manager kann nach Neustart einen vorbereiteten Vorgang anzeigen

**Review-Gate:** Paketfehler verändern keine Host-Konfiguration. Austausch oder
Entfernen der ursprünglichen `.pfinstall` nach Prepare beeinflusst Commit nicht.
Nur eine mutierende Setup-Operation kann laufen.

### Schnitt C — Backup v2 und Discovery

- Schnitte aus `plan-backup-v2.md` abschließen
- automatischen Offline-Scanner ergänzen
- gewähltes Backup im Vorgangsbereich pinnen
- äußeren Datei-Digest bei Preview und Restore erneut prüfen

**Review-Gate:** neuestes nutzbares Backup wird trotz neuerer defekter Datei
gefunden. Keine Pfade oder Secrets in der API. Kein Sidecar-Sonderweg.

### Schnitt D — Factory Reset und Fresh Setup

- Compose-Teardown mit Volumes und Orphans
- verwaltete Host-Artefakte per Allowlist entfernen
- `backups/` und aktive Operation erhalten
- vorbereitetes Release aktivieren
- nach Manager-/Host-Crash einen sicheren Wizard-Wiedereinstieg oder eine
  erneut bestätigte Neuinstallation anbieten

**Review-Gate:** App-DB, Sandbox-Intake und Cache sind gemeinsam entfernt.
Fehler vor erfolgreichem Teardown entfernen keine Host-Dateien. Der
Status-Poll löscht nach einem Crash nichts automatisch. `prepared` ist immer
gefahrlos abbrechbar; `installing` behauptet nie, die Altinstallation sei noch
intakt. Eine neue bestätigte Neuinstallation ist aus `installing` immer
möglich.

### Schnitt E — Restore und Abschluss

- HTTP-Baseline bei gewähltem Backup
- Online-Inspect und vorhandener Restore-Core
- aktuelle Images und Installations-Secrets gewinnen
- TLS v2 übernehmen oder HTTP behalten
- Finish/Retry/ohne Backup fortfahren

**Review-Gate:** Restore-Fehler hinterlässt die frische Installation. Alter
Maintenance-Token und alte Image-Tags werden nicht restauriert. Ein normaler
Fehler nutzt den bestehenden Restore-Rollback. Nach Prozess-/Host-Crash kann
Recovery ohne Abhängigkeit vom Zwischenzustand als Neuinstallation erneut
gestartet werden.

---

## 13. Minimale Testmatrix

| Ausgangslage/Ereignis                             | Erwartung                                                                                    |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Docker nicht erreichbar                           | `docker-unavailable`, keine Mutation                                                         |
| keinerlei Spuren                                  | `fresh`                                                                                      |
| App + Sandbox gesund, Maintenance-Token korrekt   | `healthy`, Update erlaubt                                                                    |
| Proxy/TLS/Gateway gestört                         | eigener Dienststatus; `healthy`-Gate bleibt bei gesundem App-/Sandbox-Stack erfüllt          |
| konfigurierte Installation gestoppt, DB vorhanden | sicherer Startversuch                                                                        |
| `healthy` oder `stopped`, Neuinstallation gewählt | nach ausdrücklicher Bestätigung `replace` möglich                                            |
| Volume oder DB fehlt                              | kein Start; Neuinstallation anbieten                                                         |
| Start oder Health scheitert                       | Neuinstallation anbieten                                                                     |
| widersprüchliche `.env`/Release-Spuren            | `needs-reinstall`                                                                            |
| Prepare mit ungültiger `.pfinstall`               | Altzustand unverändert                                                                       |
| Quelldatei nach Prepare ersetzt/entfernt          | keine Wirkung auf gepinnte Bytes                                                             |
| Crash nach `prepared`                             | Commit oder Abbruch möglich                                                                  |
| Crash nach Wechsel auf `installing`               | keine Aussage über alten Zustand; derselbe gepinnte Vorgang kann neu gestartet werden        |
| Crash während Reset oder Setup                    | keine automatische Löschung beim Poll; sicheren Wiedereinstieg oder Neuinstallation anbieten |
| Crash während Restore                             | keine Resume-Garantie; Neuinstallation und Restore erneut möglich                            |
| zwei parallele Commit-Requests                    | genau einer arbeitet                                                                         |
| Replace ohne Backup                               | komplette saubere Neuinstallation                                                            |
| Replace mit gültigem Backup v2                    | HTTP-Baseline, dann Settings/TLS-Restore                                                     |
| neuestes Backup defekt, älteres gültig            | älteres Backup anbieten                                                                      |
| Backup nach Prepare ausgetauscht                  | Digest-Gate blockiert                                                                        |
| Restore inkompatibel                              | frische Installation bleibt gesund                                                           |
| Restore enthält alten Maintenance-Token           | frischer Token bleibt aktiv                                                                  |
| Restore enthält alte Image-Tags                   | `.pfinstall`-Release bleibt aktiv                                                            |
| Backup enthält TLS                                | keine neue TLS-Identität vor Restore                                                         |
| Backup enthält kein TLS                           | frische HTTP-Installation                                                                    |
| Dev- und Delivery-Projekt parallel                | keine Containerübernahme; Portkonflikt klar                                                  |
| fremder Container auf Produkt-Port                | Konflikt, niemals automatisch löschen                                                        |

Zusätzlich Fehler-Injektion nach jeder persistenten Phasengrenze und Tests für
`0700`/`0600`, keine Secrets in Antworten/Logs sowie vollständiges Entfernen
von App- und Sandbox-Volume.

---

## 14. Definition of Done

- `.pfupdate` ist ausschließlich auf einem gesunden, authentifizierten Stack
  möglich.
- Der Manager bietet nie `.pfinstall` über einen Pfad an, den das Backend wegen
  vorhandener Spuren anschließend unerwartet ablehnt.
- Fresh und Replace verwenden denselben Prepare-/Activate-Mechanismus.
- Vor der Bestätigung werden weder Container noch Volumes noch Host-State
  verändert; geladene Images dürfen als Cache verbleiben.
- Nach bestätigtem Replace sind alle alten Runtime-Volumes entfernt,
  `backups/` bleibt erhalten.
- `prepared` bedeutet immer „noch gefahrlos abbrechbar“; vor der ersten
  Mutation wird atomar auf `installing` gewechselt.
- Nach jedem Manager-, Setup- oder Host-Crash kann eine saubere
  Neuinstallation erneut gestartet werden; `backups/` bleibt erhalten.
- Es gibt keine Produktzusage, einen begonnenen Reset oder Restore technisch
  an derselben Einzelaktion fortzusetzen.
- Das ausgewählte Paket und Backup sind über Digests an unveränderliche
  Staging-Bytes gebunden.
- Recovery verwendet denselben Restore-Core wie manueller Restore.
- Aktuelle Release-Images und frische Installations-Secrets werden nie aus dem
  Backup überschrieben.
- TLS wird ausschließlich über `.pfbackup` v2 wiederhergestellt.
- Dev- und installierter Stack teilen keine globalen Container-Namen mehr.

---

## 15. Bewusst verworfene Komplexität aus dem ersten Entwurf

Der erste Entwurf plante einen Recovery-Snapshot von `.env`, Manager-State,
TLS, Runtime-DB und weiteren Volume-Inhalten sowie einen Rollback zur alten
Installation. Das ist gestrichen.

Damit entfallen:

- Recovery-Kopien von Patient-/Besuchsdaten und privaten TLS-Schlüsseln
- Retention und Aufräumlogik für solche Altzustandskopien
- kohärenter Multi-Volume-Rollback
- Wiederanlauf einer bereits als unbrauchbar bewerteten Installation
- ein umfangreicher Recovery-Zustandsautomat
- zusätzliche Restore-Implementierung

Die notwendige Komplexität bleibt an zwei etablierten Grenzen:

1. atomarer Prepare-/Commit-Zustand für die Installation
2. bestehender transaktionaler Restore auf die frische Zielinstallation
