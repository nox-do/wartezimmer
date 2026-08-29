# Plan: Manager — Start und Initialisierung

Stand: 2026-08-29

Status: **Bereinigtes Planungsdokument, noch kein Auftrag zum Umbau.** Am
2026-08-29 mit dem aktuellen Code und den bestehenden Controller-Tests
abgeglichen.

Betrifft nur die Electron-Hülle (Main + Renderer-Boot). Setup-API, Wizard-Schritte,
TLS, Backup sind raus, solange sich ihr Vertrag nicht ändert.

Ist-Dokumentation (teilweise veraltet, siehe unten):
[`../manager/README.md`](../manager/README.md).

---

## Ziel

Zwei Betriebsarten **explizit**, aus dem letzten erfolgreichen Config-Snapshot
abgeleitet. Nur die **initiale Route** wird einmal am Start entschieden:

| Modus | Kriterium | Initiale Oberfläche | Chrome | Runtime |
| ----- | --------- | ------------------- | ------ | ------- |
| **Setup** | `HostStatus.envExists === false` | Wizard fullscreen | im fullscreen Wizard aus; nach bewusstem Verlassen wieder an | aus |
| **Betrieb** | `.env` vorhanden | Status | an, außer bei fullscreen Wizard | sofort + Poll alle 12s |

Heute gibt es diese Tabelle nicht. Es gibt `activeView`, `wizardPresentation`,
`bootReady` und einen Hijack in `onConfig`.

Weniger ist mehr: **Config zuerst → Modus ableiten → eine initiale Route.**
Spätere Config-Refreshes dürfen Modus und Poll-Policy aktualisieren, aber nie
automatisch routen.

---

## Nicht-Ziele (dieser Plan)

- Wizard-Schritte, HTTPS, Netzwerk-Tab, Wartung, Backup
- Main: Setup-Child, Port, Health-Wait vor dem Fenster
- IPC-Kanäle zusammenlegen (eigener Schnitt, unten nur inventarisiert)
- Alle Views lazy mounten (eigener Schnitt nach Boot-Router)
- `HostStatus` / `HostRuntimeHealth` zusammenlegen
- Produktänderung am Wizard-Inhalt

---

## Ist: Phasen (Code-Pfad)

Zum Vergleich: jede Zeile ist nachvollziehbar. Abweichung README vs. Code ist
absichtlich festgehalten.

### A. Main — bis das Fenster existiert

Datei: `manager/src/main/index.ts`, `setup-server.ts`

```text
app.whenReady
  → installMacApplicationMenu
  → startSetupServer
       vorhandener Prozess auf 9190? reuse
       sonst Child (dev: npm workspace serve, packaged: resources/setup)
       wait GET /api/setup/health (max 15s)
  → registerSetupIpc (alle Handler)
  → createWindow → loadURL (dev) / loadFile (packaged)
```

Fenster kommt **nach** erreichbarer Setup-API. Fail → Error-Box, `app.quit()`.
Das bleibt.

### B. Renderer — bis die erste Fläche sichtbar ist

| Schritt | Datei | Was passiert |
| ------- | ----- | ------------ |
| 1 | `renderer/main.ts` | `createManagerAppController()`, `mount(App)`, dann `controller.start()` |
| 2 | `App.svelte` | HealthHeader + MainNav + **vier Views immer im DOM** (`hidden`) |
| 3 | `start()` | immer `navigateTo('status')` |
| 4 | `manager-navigation.ts` | `setView('status')`, Chrome-Flags, **full refresh** (Config **und** Runtime parallel) |
| 5a | `host-refresh-controller.ts` | `onRuntime` sobald Health da — **ohne** auf Config zu warten |
| 5b | `onConfig` in `manager-app-controller.ts` | Snapshot, `markBootReady()`, ggf. Wizard-Hijack |
| 6 | `manager-shell-state.svelte.ts` | `showChrome` = `bootReady && !wizardFullscreen` |
| 7 | `StatusView.svelte` | extra `hidden` solange `!bootReady` |

`bootReady` ist der Patch gegen den Chrome-Blitz (todo 2026-08-29), nicht ein
erster Modus.

### C. Wizard-Hijack (Ersteinrichtung)

Nur in `onConfig`, einmal pro Prozess (`bootRouteResolved`):

```text
view === 'status' && !status.envExists
  → navigateTo('wizard', { fullscreen, status })
  → return  (syncShell(status) fällt aus)
```

Hilfsfunktion: `shouldAutoStartFullscreenWizard` in `manager-navigation.ts`
(`!status?.envExists`; bei `null` wäre das `true`, der Hijack läuft aber nur
nach erfolgreichem Config-Fetch).

### D. Nach dem ersten Frame

- Full refresh plant immer einen Runtime-Poll (12s), **auch wenn View = wizard**.
  Test: `host-refresh-controller.test.ts` — `poll continues while wizard view is active`.
- README behauptet das Gegenteil: „Runtime-Poll alle 12s **(nicht im Wizard)**“.
- Tab-Wechsel Wartung/Netzwerk: deferred `viewLoading`, dann Session-`generation`.
- Wizard-Tab / Status-Button: eigene Presentation-Regeln (siehe UX).

---

## Ist: zwei Modi, drei Einstiege, zwei Achsen

### Achse 1 — View

`status | network | maintenance | wizard`

### Achse 2 — Presentation

`fullscreen` (kein Chrome) vs. `embedded` (Chrome + Assistent als Tab)

### Einstiege Assistent

| Auslöser | Presentation | Status-Payload |
| -------- | ------------ | -------------- |
| Auto nach erstem Config | immer fullscreen | der gerade geholte `HostStatus` |
| Status-Karte „Einrichtung“ | immer fullscreen | `getLastConfig()` oder zweiter Fetch |
| Tab „Assistent“ | `defaultWizardPresentation`: fullscreen ohne `.env`, sonst embedded | wie oben |

Es gibt **kein** `appMode`. Fullscreen ist eine Presentation auf View `wizard`.

### Was „Betrieb“ und „Setup“ im Produkt meint — vs. Code

| Produkt | Code |
| ------- | ---- |
| Ersteinrichtung, keine `.env` | `!envExists` → Auto-Wizard |
| Einrichtung unvollständig, `.env` da (Docker/Release/LAN) | `isSetupEntryStatus` in `status-view-model.ts` → Status-Karte **mit** Chrome, kein Auto-Wizard |
| Stack läuft | `setupEntryTone === 'maintenance'` (Name irreführend: das ist der Normal-Status, nicht der Wartung-Tab) |

Auto-Setup-Modus hängt **nur** an `.env`, nicht an Docker/Release/LAN.

---

## Ist: UX-Invarianten (nicht stillschweigend ändern)

Beim Vergleich und späteren Patch **bewahren**, außer der Plan sagt etwas anderes:

1. **Einmal Hijack pro Lauf.** Abbrechen im fullscreen Wizard → Status mit Setup-Karte.
   `bootRouteResolved` bleibt true → kein erneutes Auto-Öffnen in derselben Session.
   Nächster Manager-Start ohne `.env` öffnet den Wizard wieder.
2. **Tab Assistent** mit vorhandener `.env` → embedded, Chrome bleibt.
3. **Status-Button** → immer fullscreen, auch wenn `.env` schon da (Nachziehen der Einrichtung).
4. Config-Fehler: `statusError`, `bootReady` trotzdem, Status-View zeigt die Meldung.
   Runtime-Fehler: nur Health-Header, Status bleibt.
5. Wizard nach Apply: `onWizardComplete` → Status; `onHostMutated` macht full refresh.
6. Netzwerk/Wartung-Tabs disabled bis `envExists && docker installed && daemon`
   (`manager-main-nav.ts` `setupReadyForTools`).

Punkt 1 ist die heikelste Stelle für einen „Config zuerst, dann Wizard“-Boot:
direkt in den Wizard zu starten ist ok; **Abbrechen muss weiter auf Status**
landen, ohne den Wizard sofort wieder zu öffnen.

---

## Ist: Dateikarte (Boot-relevant)

| Datei | Rolle heute | Boot-Spaghetti? |
| ----- | ----------- | --------------- |
| `main/index.ts` | Fenster, IPC-Registrierung | IPC-Copy-Paste, nicht Boot-Logik |
| `main/setup-server.ts` | Child + Health-Wait | nein |
| `preload/index.ts` | `praxisManager` Bridge | Status extra-Kanal + generisches `callSetupApi` |
| `renderer/main.ts` | mount + 10 Callbacks + `start()` | Glue |
| `App.svelte` | Layout, alle Views | kein Modus, nur `showChrome` / `wizardFullscreen` |
| `manager-app-controller.ts` | Refresh-Callbacks **und** Route | **ja** — Hijack, `bootRouteResolved` |
| `manager-navigation.ts` | Tab-Wechsel, Sessions, Wizard-Fetch | drei Pfade in einer Funktion |
| `host-refresh-controller.ts` | Fetch, Generation, Poll | `immediate` tot; Poll unabhängig vom Modus |
| `manager-shell-state.svelte.ts` | globales `$state` | `bootReady` als Chrome-Gate |
| `WizardView.svelte` / Network / Maintenance | `onMount` Controller + `$effect` auf Session | Muster ok, Boot hängt nicht daran |
| `StatusView.svelte` | liest Snapshots, extra `bootReady` | Symptom des Races |

---

## Soll: Boot-Maschine

Ein gespeicherter Boot-Zustand und ein abgeleiteter Betriebsmodus:

```text
bootPhase: 'idle' | 'loading-config' | 'ready' | 'config-failed'
appMode:   'setup' | 'ops' | null
           // Ableitung aus configSnapshot?.envExists, kein zweiter Speicherwert
```

`bootPhase` beschreibt nur den ersten Config-Versuch. Ein Config-Fehler nach
erfolgreichem Boot setzt `bootPhase` nicht zurück, sondern aktualisiert wie heute
nur `statusError` und behält den letzten erfolgreichen Snapshot.

Sequenz **Setup** (`!envExists`):

```text
mount (Chrome aus, keine Status-Fläche)
  → refreshConfig  (Config-only; schreibt Cache und Shell-Snapshot)
  → appMode ergibt setup
  → navigateTo wizard fullscreen mit diesem Status, ohne zweiten Refresh
  → bootPhase = ready
  → kein Poll
```

Sequenz **Betrieb** (`envExists`):

```text
mount (Chrome aus bis ready)
  → refreshConfig  (Config-only; schreibt Cache und Shell-Snapshot)
  → appMode ergibt ops
  → navigateTo status, ohne zweiten Refresh
  → bootPhase = ready, Chrome an
  → ersten Runtime-Fetch auslösen und Poll starten
```

Sequenz **Config-Fail**:

```text
bootPhase = config-failed
  → View status + Chrome + heutige Status-Fehlermeldung
  → kein Wizard-Hijack, kein Runtime-Fetch, kein Poll
```

Retry ist heute „Manager neu starten“. Unverändert lassen, außer wir wollen
einen expliziten Retry-Button (nicht in diesem Plan).

### Vertrag für den Config-Boot-Fetch

Der erste Config-Fetch muss durch den Refresh-Controller laufen, damit nicht zwei
Config-Wahrheiten entstehen. Dafür bekommt er eine Config-only-Operation, zum
Beispiel:

```text
refreshConfig(): Promise<HostStatus | null>
```

- Erfolg: `lastConfig` und `configSnapshot` schreiben, `statusError` löschen,
  `HostStatus` zurückgeben.
- Fehler: `statusError` schreiben, `null` zurückgeben.
- Kein Runtime-Fetch und kein Poll als Nebeneffekt.
- `start()` ist asynchron, behandelt beide Ergebnisse selbst und lässt keine
  unbehandelte Promise-Rejection entstehen.

Der Boot-Router muss die Navigation ohne den sonst üblichen Navigation-Refresh
ausführen können. Beim Wizard wird der bereits geladene `status` übergeben; für
Status braucht Navigation eine gleichwertige `refresh: false`-Option oder einen
kleinen internen Route-Commit ohne Fetch.

### Wer darf routen

| Darf | Darf nicht |
| ----- | ---------- |
| `start()` / eine `resolveBootRoute(status)` | Config-/Runtime-Callbacks |
| `navigateTab` / Status-Button / Wizard complete/cancel | Refresh-Controller |

Refresh: Snapshots und Errors schreiben sowie die Runtime-Policy an einem neuen
erfolgreichen Config-Snapshot ausrichten. `syncShell` und `navigateTo` gehören
nicht in `onConfig`.

Die initiale Route wird genau einmal durch `start()` aufgelöst. Deshalb ist nach
Abbrechen kein `bootRouteResolved`-Ersatz nötig: spätere Config-Ergebnisse routen
grundsätzlich nicht.

### Poll

| Zustand | Sofortiger Runtime-Fetch | Poll |
| ------- | ------------------------ | ---- |
| initialer Config-Fetch / Config-Fail | aus | aus |
| `appMode === 'setup'`, jede View | aus | aus |
| `appMode === 'ops'`, jede View | an beim Übergang nach `ops` | an |

Das gilt im Betrieb auch für beide Wizard-Presentations: Der Assistent-Tab ist
embedded; der Status-Button darf weiterhin fullscreen öffnen. Fullscreen steuert
nur Chrome, nicht die Runtime-Policy.

Der Refresh-Controller braucht dafür eine explizite Policy, zum Beispiel
`setRuntimeEnabled(boolean)`. Beim Abschalten muss sie:

- den Timer löschen,
- laufende/stale Ergebnisse nicht mehr anwenden,
- ein Rescheduling im `finally` verhindern,
- noch nicht gestartete, bereits überholte Queue-Einträge vor dem API-Aufruf
  verwerfen.

Navigation im Setup-Modus verwendet Config-only statt Full-Refresh. Wenn dieser
Config-Refresh erstmals `.env` findet, wechselt der abgeleitete Modus nach `ops`,
ein Runtime-Fetch startet und der Poll wird aktiviert. Das ist insbesondere der
Pfad nach Wizard-Apply.

### `bootReady`

Entfällt als eigenes Flag. Beide terminalen Boot-Phasen dürfen eine Oberfläche
zeigen:

```text
bootSettled = bootPhase === 'ready' || bootPhase === 'config-failed'
showChrome  = bootSettled && !wizardFullscreen
showStatus  = bootSettled && activeView === 'status'
```

Damit bleibt die Status-Fehlermeldung bei `config-failed` sichtbar. Kein zweites
Gate extra erfinden.

### `immediate`

Aus `RefreshOptions` und den Aufrufen entfernen: Das Flag ist heute tot und für
den Boot-Router nicht nötig. Die bestehende Queue kann in Schnitt 1 bleiben,
muss aber vor jedem API-Aufruf stale Generationen verwerfen. Echte Parallelität
oder Abort-Signale sind ein späterer, unabhängiger Schnitt.

---

## Soll: UX nach dem Umbau (explizit)

| Ereignis | Soll |
| -------- | ---- |
| Start ohne `.env` | sofort Wizard, kein Status-Frame, kein Header-Blitz |
| Start mit `.env` | Status (Setup-Karte oder Grid), Chrome, dann Runtime/Header |
| Abbrechen fullscreen, keine `.env` | Status + Setup-Karte; **kein** Auto-Wizard in dieser Session |
| Tab Assistent, keine `.env` | fullscreen (wie `defaultWizardPresentation`) |
| Tab Assistent, `.env` da | embedded |
| Status-Button Einrichtung | fullscreen, auch mit `.env` |
| Apply fertig | Status; Config-only Refresh; Modus wird ops, danach Runtime + Poll |
| `.env` verschwindet nach erfolgreichem Boot | aktuelle View bleibt; Modus wird setup; Runtime-Poll stoppt |
| späterer Config-Fehler | letzte Config und Modus bleiben; `statusError`; bestehende Ops-Runtime-Policy bleibt |

`appMode` wird nach jedem erfolgreichen Config-Fetch neu abgeleitet. Das darf
Poll-Policy und Tab-Verfügbarkeit ändern, aber nicht die aktive View.

Abbrechen ohne `.env`: `appMode` bleibt `setup`, View aber `status`. Das ist
bewusst **View ≠ Modus**. Modus steuert Runtime und ist Eingang für die
Tab-Verfügbarkeit; Chrome folgt ausschließlich `bootSettled` und der
Wizard-Presentation.

---

## Schnitte (wenn wir loslegen)

Nicht alles auf einmal. Reihenfolge so, dass jeder Schnitt allein mergefähig ist.

### Schnitt 1 — Boot-Router (dieser Plan, zuerst)

- `start()` holt Config, leitet den Modus ab und navigiert einmal
- Hijack und `bootRouteResolved` aus `onConfig` entfernen
- Config-only Refresh mit Rückgabewert; Boot-Navigation ohne zweiten Fetch
- Runtime nicht parallel zum ersten Config-Fetch
- Runtime aus im Setup-Modus; im Ops-Modus unabhängig von der View an
- Poll-Lifecycle explizit aktivieren/deaktivieren und stale Queue-Einträge skippen
- `bootReady` durch `bootPhase` ersetzen oder gleichwertig umbenennen
- totes `immediate` entfernen
- Tests: Navigation, Host-Refresh, App-Controller (neu oder erweitert)
- README Refresh/Poll-Absatz an Soll anpassen

**Nicht** in Schnitt 1: View-Unmount, IPC, `requireApi`.

### Schnitt 2 — Refresh-Concurrency / Abort (optional)

Nur bei messbarem Bedarf: laufende Requests wirklich abbrechen oder User-Refresh
parallel zu einem langsamen Poll ausführen. Nicht für korrekten Boot nötig.

### Schnitt 3 — eine aktive View

`App.svelte`: `{#if}` / `{#key}` statt vier `hidden`-Bäume. Session-`generation`
kann bleiben. Größerer Svelte-Diff, eigener Review.

### Schnitt 4 — IPC-Facade

Ein Wrapper für Dialog-Handler; HTTP weiter über `SETUP_API_CALL`.
`IPC_FETCH_SETUP_STATUS` in denselben Proxy (Verhalten gleich). Kein
Produktnutzen, weniger Datei-Rauschen.

### Schnitt 5 — `requireApi` einmal

Kleines Modul, vier Kopien weg. Unabhängig.

---

## Vergleichsliste vor dem ersten Patch

Beim Lesen des Codes abhaken. Wenn etwas nicht stimmt: Plan ändern, nicht den
Code „passend machen“ ohne Gespräch.

- [x] `start()` geht nur auf Status (`manager-app-controller.ts`)
- [x] Erster Fetch ist full = Config **und** Runtime parallel
- [x] `onConfig` enthält den einzigen Auto-Wizard
- [x] `bootRouteResolved` verhindert zweiten Hijack nach Abbrechen
- [x] `showChrome` = `bootReady && !wizardFullscreen`
- [x] Status extra `!bootReady`
- [x] README „nicht im Wizard“ ≠ Test Poll-im-Wizard
- [x] `shouldAutoStartFullscreenWizard` nur `.env`, nicht Setup-Karte
- [x] `isSetupEntryStatus` ist die Status-Karte, nicht der Auto-Wizard
- [x] Vier Views in `App.svelte` ohne `{#if}`
- [x] `RefreshOptions.immediate` ungenutzt in `performRefresh`
- [x] Wizard-Session: Navigation darf zweiten Status-Fetch skippen, wenn `status` in Options
- [x] Main wartet Health, bevor das Fenster lädt

---

## Tests, die sich bewegen (Schnitt 1)

| Datei | Erwartung |
| ------ | --------- |
| `manager-navigation.test.ts` | Boot-Navigation überspringt zweiten Refresh; Wizard nutzt bereitgestellten Status weiter |
| `host-refresh-controller.test.ts` | Config-only schreibt Cache ohne Runtime; Runtime-Policy stoppt Timer und Reschedule; ops pollt in jeder View |
| neu: App-Controller / Boot-Route | ohne `.env` → wizard fullscreen, kein Runtime; mit `.env` → status, dann Runtime; Config-Fehler → sichtbarer Status-Fehler ohne Wizard/Poll |
| neu: Session-Vertrag | Cancel ohne `.env` → Status + Chrome ohne Re-Hijack; Apply → setup→ops + erster Runtime-Fetch |
| neu: spätere Config | `.env` entfernt → Poll stoppt ohne Route; Config-Fehler behält letzten Modus |
| `manager-navigation.test.ts` „wizard reuses provided status“ | bleibt |

Für die Orchestrierungs-Tests bekommt `createManagerAppController` schmale
injizierbare Abhängigkeiten (API, Refresh, Shell-Aktionen) oder der Boot-Ablauf
wird als kleiner injizierbarer Controller extrahiert. Ein reiner
`bootModeFromStatus`-Test reicht nicht, weil auch die Reihenfolge
Config → Route → Runtime abgesichert werden muss.

Kein E2E-Electron in diesem Plan; Node-Tests der Controller reichen. Baseline beim
Review: 227 Manager-Tests grün.

---

## Festgelegte Entscheidungen

1. Poll im Ops-Modus ist in jeder View an, auch in beiden Wizard-Presentations.
2. Initialer Config-Fail zeigt Status + Chrome und startet keine Runtime.
3. Ein späterer Config-Fail behält letzten Snapshot, Modus und Ops-Poll bei.
4. Abbrechen ohne `.env` zeigt Status + Setup-Karte + Chrome, ohne Runtime.
5. Modus wird aus dem letzten erfolgreichen Config-Snapshot abgeleitet; nur die
   Boot-Route ist einmalig.
6. Schnitt 1 und View-Unmount bleiben getrennte PRs.

**Fullscreen ist die Chrome-Regel, nicht der Modus.** Der Modus steuert Runtime;
die initiale Config entscheidet einmalig die Boot-Route.

---

## Empfehlung zum ersten PR

Nur **Schnitt 1** mit den oben festgelegten Entscheidungen:

- Start ohne `.env` → Wizard fullscreen, kein Poll, kein Status-Frame
- Abbrechen → Status + Setup-Karte + Chrome, weiterhin keine Runtime
- Start mit `.env` → Status + Chrome, danach Runtime + Poll
- Apply → Config-only; sobald `.env` sichtbar ist, Runtime + Poll starten
- Config-Fail am Start → Status + Chrome + Fehler, keine Runtime

Runtime-Bedingung = letzter erfolgreicher Config-Snapshot hat `envExists === true`,
nicht die aktive View. Chrome-Bedingung = Boot abgeschlossen und Wizard nicht
fullscreen.
