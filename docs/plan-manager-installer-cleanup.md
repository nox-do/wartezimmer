# Plan: Manager — Installer-UI aufräumen

Stand: 2026-08-30

Status: **Gegen Ist-Code geprüft; Diff A startklar** (Bootstrap-Busy bis alle drei
Requests settled; `show()` setzt Routing zurück). Eine Installation, ein Betreiber,
ein Manager. Kein Multi-Tenant, keine neue Store-Schicht. Keine parallelen
Wartungs-Slots.

Produkt-HTTPS bleibt [`plan-proxy-tls-manager.md`](plan-proxy-tls-manager.md).
HTTPS-Copy-Aufräumen: [`plan-manager-https.md`](plan-manager-https.md). Dieser
Plan betrifft Renderer-Koordination (Controller, Busy, Fehlerort, Svelte-Brücke),
nicht Setup-API, Compose oder Caddy.

---

## Was „Aufräumen“ hier heißt

Der Manager ist eine kleine Installer-App: Shell, vier Tabs, testbare
Plain-Object-Controller, Svelte nur als View. Das **läuft**. Das Problem ist
Drift in der Koordination: ein ungetaggtes Wartungs-Mutex für zahlreiche
Aktionen, ein Bootstrap ohne Lifecycle-Gate, mehrere Catch-Lücken und drei
parallele Wege, State in die View zu drücken.

Aufräumen = **eine laufende Aktion eindeutig benennen, Fehler am Ursprung,
eine Notify-Leitung** — auf der Fläche, die die Aktion wirklich führt. Die
Wartungsaktionen bleiben dabei wie heute serialisiert. Nicht: acht
Mini-Controller, eine neue Parallelitäts-Policy, Svelte-Stores quer durch alle
Screens, Netzwerk und TLS wieder zusammenlegen.

---

## Festgelegt (Scope)

1. Eine Installation, ein Host. Kein Multi-Tenant, kein Zentral-Produkt.
2. Controller bleiben Plain Objects ohne Svelte-Import (Tests in Node).
3. Views klonen Controller-State nach `$state`. Das Muster bleibt.
4. Wartung ist der erste Umbau. Netzwerk und TLS bleiben getrennte Controller.
5. Generation-Gates in Netzwerk und Host-Refresh sind Vorbild, kein Rewrite.
6. Kein Boot-, View-Unmount- oder IPC-Mitnahme in diesem Plan.
7. Keine neuen Features, keine gelöschten Panels, keine Copy-Kampagne.
8. Keine parallelen Wartungs-Mutationen und keine Konfliktmatrix. Der heutige
   globale Interlock bleibt die sichere Vorgabe; nur Herkunft und Darstellung
   der laufenden Aktion werden präziser.

### Nicht-Ziele

- Kein Svelte-Store / Runes-Store als App-State
- Kein gemeinsamer „AsyncAction“-Framework für alle Tabs
- Netzwerk-Controller nicht zerlegen, TLS nicht zurück ins Netzwerk
- Wizard nicht umbauen (kein Merge mit Netzwerk; Notify wie Wartung)
- Restore- und Pfupdate-Wizards bleiben eigene Controller
- Setup-API, Backup-Format, Routing-Vertrag unberührt
- Keine Freigabe anderer Wartungsaktionen während Stack-, Backup-, Storage-,
  Routing-, PIN- oder Update-Arbeit

---

## Ist: drei Hotspots

```text
Shell          configSnapshot + runtimeSnapshot + Sessions + viewLoading
  │
  ├─ Status     Selektoren, keine lokalen Mutationen
  ├─ Assistent  linear; Async-Lifecycle offen                 ← Safety-Follow-up
  ├─ Netzwerk   network-controller + tls-network-controller   ← gelb + Follow-up
  └─ Wartung    maintenance-controller                        ← rot, zuerst
```

| Fläche             | Dateien                                               | Koordination                                                                                                     |
| ------------------ | ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Wartung            | `maintenance-controller.ts`, `MaintenanceView.svelte` | ein ungetaggtes `busy`, ein globales `error`, Async-Schreibpfade ohne Lifecycle-Generation                       |
| Netzwerk           | `network-controller.ts`, `NetworkView.svelte`         | Draft + Phasen + zwei Generation-Zähler; View orchestriert Shell + zwei Controller                               |
| TLS unter Netzwerk | `tls-network-controller.ts`, `TlsNetworkPanel.svelte` | persistenter Controller ohne Session-Gate; Hydrate kann über Tab-Sessions überlappen; LAN→TLS-Lock nur einseitig |
| Assistent          | `wizard-controller.ts`, `WizardView.svelte`           | `hide()` invalidiert nur Routing-Request; übrige Async-Pfade können in einen neuen Lauf schreiben                |
| Brücke überall     | `onStateChange` → `syncSnapshot()`                    | plus tote `subscribe()`, plus Extra-Klone nach Notify                                                            |

---

## Finding 1 — Wartung: Busy ohne Herkunft, Fehler ohne Ort (gelb)

`MaintenanceState` hält Stack, Logs, Ordner, Backup, TLS-Sidecar,
Software-Update-**Ergebnis**, Routing und PIN-Reset in einem Objekt — mit
**genau einem** `busy` und **genau einem** `error`. Die Update-Ausführung selbst
liegt bereits korrekt im eigenen `pfupdate-wizard-controller`.

```32:54:manager/src/renderer/maintenance-controller.ts
export type MaintenanceState = {
  status: HostStatus | null;
  compose: ComposeStatus | null;
  logsService: string;
  logsText: string;
  // … Ordner, Routing, Backup, Sidecar, Statuszeilen …
  busy: boolean;
  error: string | null;
};
```

### Folgen und Grenze

- Eine Aktion blockiert **alle** Wartungspanels. Das ist für einen
  Single-User-Installer grob, aber eine sichere Serialisierung und für sich
  **kein Defekt**. Der Plan darf daraus nicht ohne Konfliktvertrag parallele
  Stack-, Backup-, Storage-, Routing- oder PIN-Aktionen machen. Die Sperre
  sitzt heute in der View (`disabled={snapshot.busy}`), nicht als
  Controller-Guard. Restore-Busy sperrt die anderen Panels nicht; Pfupdate
  sperrt nur den Update-Button.
- Weil `busy` keine Herkunft trägt, zeigt die View teils die falsche Aktivität:
  `SoftwareUpdatePanel` bekommt `snapshot.busy || pfupdateSnapshot.busy` und
  beschriftet den Button bei jedem Wartungs-Busy mit „Update läuft …“ — auch
  wenn nur Logs oder Backup laufen. Analog hängt der Routing-Bootstrap-Hinweis
  am globalen `busy`.
- Fehler erscheinen **global am Seitenende**, nicht bei ihrem Ursprung:

```338:340:manager/src/renderer/MaintenanceView.svelte
    {#if snapshot.error}
      <p class="error">{snapshot.error}</p>
    {/if}
```

- Die Panels haben bereits lokale Statuszeilen (`backupStatusText`,
  `routingModeStatusText`, `storageStatusText`, `pinResetStatusText`,
  `tlsSidecarStatusText`, `softwareUpdateStatusText`). Erfolg landet dort,
  Fehler daneben im Footer. Uneinheitlich.

Ein Controller-File für den Tab ist für diese Appgröße **kein** Problem. Das
Ziel ist deshalb ein getaggtes `activeOperation`, nicht parallele Slots:
weiterhin global sperren, aber Busy-Copy und Fehler an der auslösenden Fläche
anzeigen.

---

## Finding 2 — Wartung: Async-Schreibpfade ohne Lifecycle-Schutz (rot)

Nach einem erfolgreichen Full-Refresh bump’t die Shell
`maintenanceSession.generation` beim Öffnen des Tabs. Der Controller hat
**kein** eigenes Generation-Feld. `show()` startet drei Requests parallel und
schreibt im `then`/`catch`/`finally` bedingungslos:

```489:525:manager/src/renderer/maintenance-controller.ts
    show(status) {
      patch({ /* Reset Felder, error: null */ });
      setBusy(true);
      void Promise.all([refreshLogs('app'), deps.api.getPfbackupInfo(), deps.api.getRoutingMode()])
        .then(([, backupInfoResult, routingCapabilities]) => {
          patch({ /* latestBackup, routingMode, … */ });
        })
        .catch(/* setError */)
        .finally(() => setBusy(false));
    },
```

Beim Verlassen der Session macht die View nur `clearError()`. Es gibt kein
`hide()`, das spätere UI-Schreibvorgänge der alten Session verwirft. Die
Hauptnavigation bleibt während Wartungsaktionen benutzbar; betroffen ist daher
nicht nur der Bootstrap, sondern grundsätzlich jede alte asynchrone
Controller-Antwort.

`show()` setzt Logs und Backup-Pfade zurück, **nicht** `routingMode` /
`routingModeSaved` / `openVisitCount`. Der Hinweis „Routing-Modus wird geladen …“
hängt an `busy && routingMode === null`. Beim erneuten Tab-Öffnen bleibt der
alte Modus stehen; scheitert `getRoutingMode`, bleibt er stehen.

**Race:** schnell Tab verlassen und wieder öffnen → alte Antwort überschreibt
den neuen State oder setzt `busy` zu früh auf `false`. Ein Gate nur um das
äußere `Promise.all().then/.finally` reicht nicht: `refreshLogs('app')` patcht
`logsService` und `logsText` bereits **innerhalb** des Promise und müsste
ebenfalls gegated werden.

Das `Promise.all` koppelt außerdem drei unabhängige Bootstrap-Daten: scheitern
Logs, werden erfolgreiche Backup- und Routing-Antworten im gemeinsamen `then`
nicht übernommen. Die Requests dürfen parallel bleiben, ihre Ergebnisse müssen
aber unabhängig und generation-geprüft angewendet werden.

Netzwerk macht das bereits richtig (`showGeneration`, `actionGeneration`,
`hide()`). Host-Refresh ebenfalls (`generation` vor Config/Runtime-Apply).
Wartung ist die Lücke. Das Gate schützt nur lokale Controller-/View-Writes;
eine auf dem Host bereits ausgeführte Mutation muss ihren notwendigen
`onAfterMutation`-Refresh trotzdem noch auslösen.

Zusätzliche Catch-/Kopplungslücken:

- `recordPfupdateSuccess()` und der Erfolgszweig von `executePinReset()` rufen
  `void refreshLogs()` **ohne Catch**. Ein Log-Fail wird zur unhandled
  Rejection.
- Pfupdate-Erfolg löst `onAfterMutation` doppelt aus: zuerst indirekt über
  `recordPfupdateSuccess()`, danach noch einmal im
  `pfupdate-wizard-controller`, der die Mutation tatsächlich ausgeführt hat.
- `browseImportsFolder()` / `browseExportsFolder()` können rejecten; die View
  hängt nur `.then(syncSnapshot)` an. Auch das ist eine unhandled Rejection.
- `runAction()` wartet nach einer erfolgreichen Stack-Aktion auf Logs und ruft
  `onAfterMutation` erst danach. Scheitern nur die Logs, bleibt der nötige
  Host-Refresh aus und der Fehler sieht wie ein Stack-Fehler aus.
- `requestLogsRefresh()` fängt zwar, löscht einen alten Fehler bei erfolgreichem
  Retry aber nicht.

---

## Finding 3 — Netzwerk: zeitliches Spaghetti, fachlich nachvollziehbar (gelb)

Der Netzwerk-Controller speichert Config/Runtime **nicht**. Hydration läuft
über Getter. Intern braucht er Koordinationszustand:

| Marker                 | Rolle                                                      |
| ---------------------- | ---------------------------------------------------------- |
| `showGeneration`       | stale `fetchSetupNetwork` nach `show()`/`hide()` verwerfen |
| `actionGeneration`     | Save/Verify nach `hide()` verwerfen                        |
| `draftBaseline`        | unangetasteter Draft darf von Config nachziehen            |
| `saveSubmittedDraft`   | nach Save hydratisieren, wenn der User nicht weiter tippt  |
| `pendingConfigHydrate` | Config während `phase !== idle` merken, später flushen     |

Das ist die richtige Antwort auf Draft vs. Poll vs. Save. Die Generation-Gates
sind getestet.

Die View orchestriert zusätzlich: Shell-Snapshots, Network-Controller,
TLS-Controller, geklonte Svelte-Snapshots, Accordion-Defaults. Änderungen an
Save, Refresh oder Tab-Wechsel verlangen Wissen über die Reihenfolge der
`$effect`s.

**Entscheidung:** Hotspot, **kein** großer Rewrite. Netzwerk und TLS ausdrücklich
**nicht** zusammenlegen — LAN-Save und HTTPS-Reise sind zwei Strecken. Der
Basis-Netzwerk-Controller bleibt gelb; beim TLS-Geschwister gibt es aber einen
separaten Safety-Follow-up, siehe unten.

---

## Finding 4 — Controller–Svelte-Brücke (gelb, quer)

Es existieren parallel:

1. `onStateChange` — lebt; jeder Screen verdrahtet das auf `syncSnapshot()`.
2. `subscribe()` nur im Wartungs-Controller — **kein Aufrufer** im Manager.
3. Manuelle `syncSnapshot()`-Aufrufe in der View, oft direkt nach einer Aktion,
   die schon `notify()` auslöst.

Beispiel Wartung: `onStateChange: syncSnapshot` beim Erzeugen, danach zusätzlich
`c.show(status); … syncSnapshot();` und `c.applyRuntimeHealth(health); syncSnapshot();`.
Pfupdate-Success: Controller patched + `notify()`, View ruft danach noch einmal
`syncSnapshot()`.

`setImportsPath` / `setExportsPath` unterdrücken `notify()`, die View ruft aber
bei jedem `oninput` unmittelbar `syncSnapshot()` auf. Das spart keinen
Re-Render; es ist nur ein zweiter Benachrichtigungsweg. Diese Ausnahme ist im
Ist-Code daher nicht begründet.

Dasselbe Extra-Sync-Muster: Wizard (`goNext().then(syncSnapshot)`), Netzwerk
(`patchFields` + Sync, Session-`$effect` + Sync). Restore/Pfupdate-Dialoge
syncen nach jeder Dialog-Aktion extra — dort ist `onStateChange` schon gesetzt.

Kein akuter Defekt. Typische Quelle für „bei dieser Aktion muss man zusätzlich
noch syncen“.

**Eine Regel:** Controller patch’t → `notify()` → View klont **genau einmal**.
Auch die beiden Pfad-Setter melden normal. Direkte View-Updates bleiben nur für
lokale View-Flags (Confirm, Accordion, Dialog-offen) und für das einmalige
Initialisieren direkt nach `createMaintenanceController`. Tote `subscribe()`
löschen.

---

## Safety-Follow-ups außerhalb dieser Schnitte

Diese Punkte sind echter Handlungsbedarf, werden aber nicht in die
Wartungs-Schnitte gemischt.

### Netzwerk/TLS — gezielt, kein pauschales `hide()`

`NetworkView` ruft beim Session-Ende nur `networkController.hide()` auf. Der
TLS-Controller bleibt persistent und `hydrateOperatorRequest()` kann beim
schnellen Zu-/Aufmachen mehrfach parallel über idempotentes `prepareHostTls`
laufen. Der Replay ist damit nicht single-flight und sein Ergebnis nicht an
die gestartete Host-/LAN-Identität gebunden.

Dass Apply/DNS/Obtain nach dem Verlassen weiterlaufen, ist dagegen **nicht
automatisch ein Defekt**: derselbe TLS-Controller bleibt erhalten, `busy`
verhindert einen zweiten TLS-Klick und eine bereits gestartete Host-Mutation
muss ihren `onAfterMutation`-Refresh beenden dürfen. Ein naives `hide()`, das
State zurücksetzt oder alle Completion-Pfade verwirft, könnte `busy` stranden
lassen oder einen notwendigen Refresh verlieren.

Der kleine Safety-Schnitt dafür:

- Operator-Request-Hydration single-flight und an Hostname + LAN-IP binden;
  veraltetes Ergebnis nicht anwenden, keinen zweiten Replay für dieselbe
  Identität starten.
- Offenen Network/TLS-Confirm beim Session-Ende schließen und Callback
  verwerfen.
- Mutations-Lock symmetrisch machen: LAN-Busy sperrt TLS heute zu Recht;
  während `tlsSnapshot.busy` dürfen umgekehrt LAN-/Proxy-Apply und
  Draft-Verwerfen keine konkurrierende Host-Mutation starten. Accordion und
  reine Diagnose dürfen weiter bedienbar bleiben.
- Tests: zwei Session-Starts derselben Identität erzeugen nur einen Replay;
  ein altes Hydrate-Ergebnis für eine andere Identität wird ignoriert;
  TLS-Busy sperrt die mutierenden LAN-Aktionen; alter Confirm ist wirkungslos.
- Kein Setup-API-Umbau, kein Zusammenlegen der Controller, kein Reset des
  TLS-Drafts beim bloßen Tab-Wechsel.

### Wizard — Lifecycle-Race (rot, eigener Safety-Schnitt)

Der globale `busy`/`error` ist im linearen Assistenten angemessen. Der Defekt
ist `hide()`: Es invalidiert nur `routingCapabilitiesRequestId` und ersetzt den
State. Alte `goNext()`-, PEM-, Prerequisite-, Release-Import- und Folder-
Promises patchen danach über die gemeinsame `state`-Variable den **neuen**
Lauf; ihr `finally` kann dessen `busy` zu früh lösen. Auch ein alter
Identity-Reset-Confirm kann später starten.

Eigener kleiner Safety-Schnitt: Lifecycle-Generation für alle asynchronen
Wizard-UI-Writes und Progress-Callbacks, Confirm beim Session-Ende verwerfen,
notwendige Host-Mutation-Callbacks trotz ausgeblendeter View ausführen. Kein
Wizard-FSM-Rewrite und keine Aufteilung des globalen Busy/Error. Tests: alter
`goNext`-/PEM-/Prerequisite-/Import-/Browse-Abschluss verändert nach
`hide()` + `show()` weder neuen State noch `busy`; eine bereits ausgeführte
Host-Mutation meldet sich trotzdem genau einmal; alter Confirm ist wirkungslos.

---

## Zielbild (Installer-Maß)

```text
Wartung-Tab
  Controller (eine Datei)
    lifecycleGeneration + hide() gegen alte Async-UI-Writes
    activeOperation: bootstrap | stack | logs | storage | backup | tlsSidecar | routing | pin | null
    weiterhin genau eine Wartungsaktion gleichzeitig
    errors nach Fläche; Erfolg/Progress bleiben eigene Statuszeilen
    notify() = einzige Brücke
  View
    LoadingOverlay weiterhin ausschließlich aus Shell-viewLoading
    alle Wartungsaktionen disabled, solange Controller, Restore oder Pfupdate arbeiten
    Busy-Darstellung und Fehler nur an der auslösenden Fläche
    syncSnapshot über onStateChange; einmalig nach Controller-Erzeugung
```

Kein zweites State-System. Shell bleibt Autorität für Config/Runtime.
Wartung hält nur Tab-Lokales (Draft-Pfade, Logs-Text, Panel-Statuszeilen).

`errors` ist dabei nur ein kleines, typisiertes Mapping der vorhandenen
Flächen (`stack`, `logs`, `storage`, `backup`, `tlsSidecar`, `routing`, `pin`),
kein Error-Bus. Bootstrap-Teilfehler nach Schnitt 3: Logs → `logs`,
`getPfbackupInfo` → `backup`, `getRoutingMode` → `routing`. Software-Update-
Fehler bleiben im Pfupdate-Wizard. Bestehende Erfolgs-/Fortschrittstexte werden
nicht mit Fehlern überladen; die Panels bekommen für Fehler eine echte lokale
`.error`-Zeile.

Die View leitet `maintenanceLocked` aus `activeOperation`,
`restoreSnapshot.busy` und `pfupdateSnapshot.busy` ab — keine Store- oder
Policy-Schicht. Das ist bewusst **enger** als heute (Restore sperrt dann den
ganzen Tab, nicht nur den Dialog). Mutierende Controller-Einstiege bekommen
zusätzlich `if (activeOperation) return`, damit Tests den Interlock nicht
umgehen. `show` / `hide` / `applyConfigSnapshot` / `applyRuntimeHealth` /
`recordPfupdateSuccess` bleiben davon ausgenommen.

Accordion (festgelegt): kein Seiten-Footer. Fehler nur in der Fläche. Kinder
eines zugeklappten `MaintenanceSection` sind nicht im DOM — deshalb:

1. Klick-Fehler bleiben im offenen Block; kein Extra-Umschalten.
2. Liegt der Fehler in einem anderen Block, genau **einen** Abschnitt öffnen
   (nicht drei). Nur bei **neuem** Fehler-Key, nicht gegen späteres Zuklappen
   ankämpfen.
3. Log-Fail nach Stack- oder PIN-Erfolg bleibt an **Stack bzw. PIN**, nicht
   unter Diagnose. Log-Fail nach Pfupdate (kein Wartungs-Update-Slot) → `logs`.
   Bootstrap-Teilfehler: `logs` / `backup` / `routing`; öffnen nach fester
   Reihenfolge einen Block (`routing` vor `backup` vor `logs`).

---

## Schnitte

Wie HTTPS-Aufräumen: kleine Schnitte, Review, kein Mitnahme.

### Schnitt 1 — Lifecycle-Sicherheit und unabhängiger Bootstrap

**Ziel:** Tab-Wechsel darf keine alte Wartungsantwort in eine neue Session
schreiben. Die drei Bootstrap-Ergebnisse dürfen sich nicht gegenseitig
verwerfen.

- Eine Controller-`lifecycleGeneration` analog den Netzwerk-Gates. `show()`
  eröffnet eine Generation; `hide()` invalidiert sie. Jeder asynchrone Pfad
  prüft vor lokalen `patch`-/Fehler-/`finally`-Writes, ob er noch zur sichtbaren
  Session gehört.
- View ruft `hide()` auf, wenn `maintenanceSession` null wird, nicht nur
  `clearError()`. `hide()` verwirft keine Host-Mutation; es unterdrückt nur
  deren verspätete lokale Darstellung.
- Erfolgreiche Host-Mutationen rufen den notwendigen `onAfterMutation`-Refresh
  auch dann auf, wenn die alte View-Generation inzwischen ungültig ist.
- Bootstrap lädt Logs, Backup-Info und Routing weiter parallel, wendet aber
  jedes Ergebnis einzeln und generation-geprüft an. Kein mutierendes
  `refreshLogs()` ungeschützt innerhalb eines nur außen gegateten
  `Promise.all`. Die erste fertige Antwort darf `busy` **nicht** lösen:
  `busy` bleibt true, bis alle drei Requests settled sind (`allSettled` oder
  Zähler + generation-geprüftes `finally`). Sonst kann der User mutieren,
  während Routing oder Backup-Info noch laufen.
- `show()` setzt `routingMode`, `routingModeSaved` und `openVisitCount` zurück
  (Routing auf `null`), analog zu Logs und Backup-Pfaden. Sonst bleibt ein
  Stale-Modus stehen und die Ladeanzeige greift nicht.
- Bootstrap-Fehler bleiben in diesem Schnitt global (`error`). Scheitern
  mehrere Teile, gewinnt der letzte `setError`; die anderen Ergebnisse stehen
  trotzdem. Flächen-Mapping erst in Schnitt 3.

- Tests: zweites `show()` verwirft **alle** Resultate des ersten Laufs,
  einschließlich Logs; Teilfehler im Bootstrap lassen die anderen Resultate
  stehen; `show()` startet mit `routingMode === null`; `busy` bleibt true, bis
  alle drei Bootstrap-Requests settled sind, auch wenn das erste Ergebnis
  schon da ist; `hide()` während Bootstrap setzt den neuen State nicht
  nachträglich um; alte Action-`finally`-Writes gewinnen nach erneutem
  `show()` nicht; Mutationserfolg triggert trotz Navigation `onAfterMutation`.

**Nicht:** `busy` umformen, Footer verschieben, `subscribe` löschen oder
Wartungsaktionen parallel freigeben. Kein `setBusy(false)` nach dem ersten
Bootstrap-Teilergebnis.

### Schnitt 2 — Catch-Lücken und Mutation-Refresh

**Ziel:** Diagnosefehler dürfen Mutationserfolg nicht verschleiern, kein
Promise darf ungecatcht sterben und ein Update löst genau einen Host-Refresh
aus.

- Log-Refresh in `recordPfupdateSuccess` und `executePinReset` fangen; Folder-
  Browse-Rejections ebenfalls fangen. `requestLogsRefresh` löscht bis Schnitt 3
  den bestehenden globalen Fehler beim Start eines bewussten Retries.
- `recordPfupdateSuccess()` projiziert nur Update-Ergebnis und Logs in den
  Wartungs-State. Den Host-Refresh besitzt allein der
  `pfupdate-wizard-controller`; genau ein `onAfterMutation` pro erfolgreichem
  Update.
- In `runAction()` Stack-Ergebnis und `onAfterMutation` vor dem optionalen
  Log-Refresh behandeln. Ein anschließender Log-Fail ist Diagnose-, nicht
  Stack-Fehler.
- Tests: Catch-Pfade für Pfupdate/PIN/Browse erzeugen keine unhandled
  Rejection; erfolgreicher Log-Retry entfernt den alten Fehler; Stack-Erfolg
  triggert auch bei Log-Fail den Host-Refresh; Pfupdate-Erfolg löst genau einen
  Host-Refresh aus.

**Nicht:** State-Form ändern, Fehlerflächen verschieben oder neue
Retry-/Logging-Policy einführen.

### Schnitt 3 — Getaggte Aktion und Fehlerort

**Ziel:** Die App weiß, **was** läuft und **wo** ein Fehler hingehört, ohne die
heutige Serialisierung zu lockern.

- `busy: boolean` → `activeOperation` (Union im Zielbild). Mutierende
  Einstiege: früher Return, wenn schon eine Operation läuft. Die View sperrt
  über `maintenanceLocked` (Controller-Operation **oder** Restore-Busy **oder**
  Pfupdate-Busy). Das zieht die heutige Lücke zu: Restore/Pfupdate blockieren
  dann den ganzen Tab, nicht nur den eigenen Dialog bzw. den Update-Button.
- `LoadingOverlay` bleibt ausschließlich an `managerShell.viewLoading`.
  `activeOperation === 'bootstrap'` erzeugt keinen zweiten Overlay; es sperrt
  Aktionen und steuert nur die bestehende lokale Routing-Ladeanzeige.
- Komponenten trennen, wo nötig, `disabled` von eigener `busy`-Darstellung.
  Insbesondere darf ein Logs-/Backup-Busy den Update-Button nicht mit „Update
  läuft …“ beschriften.
- Globales `error` und den Seiten-Footer entfernen. Stattdessen typisierte
  `errors` nach Fläche. Erfolg/Progress bleiben in den vorhandenen Statuszeilen;
  Fehler erscheinen daneben als lokale `.error`-Zeile. `StackControls` und
  `LogsPanel` brauchen dafür erstmals eine lokale Fehler-Prop, aber kein neues
  Panel. `BackupPanel` bekommt drei Fehler-Slots (Backup / Sidecar / PIN), kein
  neues Panel. `inspectTlsSidecar` schreibt heute dieselbe Botschaft in
  Statuszeile **und** `error` — nach dem Schnitt nur noch `errors.tlsSidecar`.
- Ein neuer Lauf löscht nur den Fehler seiner Fläche; `show()` darf alle
  flächenbezogenen Fehler für die neue Session zurücksetzen.
- View: bei neuem Fehler-Key den Ursprungsabschnitt öffnen, siehe Zielbild.
  Kein neuer Electron-Smoke-Harness.
- Tests: Während Logs-Refresh bleiben andere Wartungsaktionen gesperrt, aber
  nur Logs zeigen Busy; fremdes Busy erzeugt nie „Update läuft …“; Restore-
  oder Pfupdate-Busy sperrt die übrigen Wartungsaktionen; Routing-/Storage-/
  Backup-/TLS-Sidecar-/PIN-/Stack-/Log-Fehler tragen die richtige Fläche;
  Bootstrap-Teilfehler landen auf `logs` / `backup` / `routing`;
  `maintenanceSectionToOpenForErrors` öffnet einen Block.

**Nicht:** Controller in acht Dateien splitten. Keine neuen Panels. Keine
parallelen Wartungs-Slots.

### Schnitt 4 — eine Notify-Leitung (Wartung zuerst)

**Ziel:** keine tote `subscribe()`, kein Ritual-Sync nach Notify.

- `subscribe()` aus Wartungs-Controller und Public-API entfernen.
- Extra-`syncSnapshot` in `MaintenanceView` streichen, wo `onStateChange`
  bereits feuert (`show`, `applyConfigSnapshot`, `applyRuntimeHealth`,
  `setRoutingMode`, Browse-`.then`, Pfupdate-`onApplySuccess`, Restore- und
  Pfupdate-Dialog-Callbacks in derselben Datei).
- `setImportsPath` / `setExportsPath` normal notifyen; `notify: false` und die
  manuellen `oninput`-Syncs entfernen. Der Ist-Code klont heute ohnehin bei
  jedem Tastendruck, daher ist das keine neue Render-Frequenz.
- Einmaliges `syncSnapshot()` direkt nach Controller-Erzeugung bleibt. Lokale
  View-Flags (Confirm, Accordion, Dialog-offen) bleiben Svelte-lokal.
- Tests: ein Pfad-Setter und ein normaler Controller-Patch lösen jeweils genau
  einen `onStateChange`-Callback aus; entfernte manuelle Syncs ändern keine
  sichtbare Zustandsübernahme.

**Nicht:** keine neuen Panels, keine TLS/Setup-API und keine Notify-Hygiene in
Wizard- oder Netzwerk-View. Deren Regel ist nur als späterer Follow-up notiert.

---

## Reihenfolge und Halt

Umsetzung in **zwei Diffs** (Plan-Schnitte bleiben die Checkliste):

1. **Diff A = Schnitt 1+2** — Lifecycle, Bootstrap, Catch, Refresh-Besitz. Kein
   `activeOperation`, kein Footer-Umzug, keine Notify-Hygiene.
2. **Diff B = Schnitt 3+4** — getaggte Aktion, Fehlerort, eine Notify-Leitung.

Netzwerk/TLS zusammenlegen und Wizard-FSM-Umbau bleiben außerhalb. Die oben
notierten Safety-Follow-ups sind eigene Diffs. Defect-first-Reihenfolge über
diesen Plan hinaus: Diff A, Wizard-Lifecycle, Network/TLS-Safety, danach Diff B.
Wer den Wartungsplan ohne Unterbrechung abschließt, mischt diese Dateien
trotzdem nicht in Diff A oder B.

Kein Umbau ohne den jeweiligen Schnitt.
