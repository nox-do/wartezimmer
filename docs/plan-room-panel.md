# Plan — Raum-Panel

**Status:** fachlich/technischer Plan  
**Stand:** 2026-06-18  
**Bezug:** `docs/flows.md`, `docs/domain-model.md`, `docs/apis.md`, `docs/realtime-streams.md`

Ziel: Ein Tablet am oder im Behandlungsraum zeigt Patienten und Team, welche Wartenummer fuer diesen Raum erwartet wird. Das Panel ist **Orientierung zuerst**, Statusaktion optional. Es ersetzt nicht die MFA.

Nicht Teil dieses Plans: eGK, PVS-Integration, Elektro-/Tablet-Mounting, WLAN/Captive-Portal.

---

## Fachliche Leitlinien

1. **Patientenorientierung:** Patient sieht am Raum: „Hier bin ich richtig, meine Wartenummer steht hier.“
2. **Kein Pflichtschritt:** Die Praxis darf das Panel nur als Anzeige nutzen oder aktiv fuer Ankunft/Entlassung einsetzen.
3. **Kein Nachweis:** Ein Klick am Raum ist nur ein Statussignal zur Wartenummer.
4. **Datenschutz per Default:** Im Flur keine Namen. Namen nur, wenn die Praxis es pro Raum bewusst einschaltet.
5. **MFA bleibt fuehrend:** MFA kann immer alles steuern; Raum-Panel ist eine eingeschraenkte Ansicht/Aktion fuer genau einen Raum.
6. **Tablet-first:** Billige Android-Tablets, PWA/Kiosk-Browser, Hoch- und Querformat.

---

## Betriebsmodi pro Raum

Konfiguration pro `room`:

| Modus          | Zweck                            | Patient sieht                     | Aktionen                       |
| -------------- | -------------------------------- | --------------------------------- | ------------------------------ |
| `display_only` | Tuer-/Flur-Anzeige               | Raumname + relevante Wartenummern | keine                          |
| `arrival`      | Ankunft wird am Panel bestaetigt | grosse Nummer + Button            | placement-abhaengig            |
| `staff_full`   | kleines Raum-Cockpit             | Nummern, optional Namen           | `Patient angekommen`, `Fertig` |

Empfohlener Default: `display_only`.

**Check-out / Fertig:** API-seitig vorsehen, aber UI nur in `staff_full` zeigen. Patienten sollen sich nicht selbst „fertig“ setzen.

Es gibt keinen eigenen Mitarbeiter-Anwesenheitsstatus. Fachlich relevant ist nur, ob die Wartenummer am Raum angekommen ist (`in_room`) und ob der Fall fertig ist (`done`).

---

## Texte am Raum

V1 bleibt deutschsprachig wie die Staff-/Praxis-UI; kein eigenes i18n fuer das Raum-Panel. Die Praxis soll Standardtexte waehlen koennen plus eigene Texte. UI-Idee: Dropdown fuer Vorlagen + Input/Textarea fuer eigene Formulierung.

Technisch in Svelte 5 gut umsetzbar:

```svelte
<select bind:value={selectedTemplateId}>
  {#each templates as template}
    <option value={template.id}>{template.label}</option>
  {/each}
  <option value="custom">Eigener Text</option>
</select>

{#if selectedTemplateId === 'custom'}
  <input bind:value={customText} maxlength="80" />
{/if}
```

Empfohlene Vorlagen:

| Kontext                    | Text                                    | Piktogramm        |
| -------------------------- | --------------------------------------- | ----------------- |
| korrekter Raum             | `Sie sind hier richtig.`                | Haken / Standort  |
| warten am Raum             | `Bitte hier warten.`                    | Uhr / Stuhl       |
| eintreten                  | `Bitte eintreten.`                      | Tuer / Pfeil      |
| allgemeiner Empfangsausweg | `Bitte wenden Sie sich an den Empfang.` | Info / Empfang    |
| Mitarbeiter-Ankunft        | `Patient angekommen`                    | Haken             |
| Patient-Ankunft            | `Ich bin da`                            | Hand / Haken      |
| Fertig                     | `Fertig`                                | Check-out / Haken |

Fachliche Benennung: eher **Ankunft bestaetigen** als **Check-in**, damit es nicht nach formaler Anmeldung klingt.

Piktogramme sind wichtig, weil das Panel nicht mehrsprachig ist und im Vorbeigehen verstanden werden muss. Umsetzung analog Themen-Icons mit Lucide, aber als feste, kleine Preset-Liste.

---

## Anzeige-Regeln

Raum-Panel zeigt nur Tickets mit `roomId === panel.roomId` und Status:

| Status    | Anzeige               |
| --------- | --------------------- |
| `called`  | erwartet / aufgerufen |
| `in_room` | angekommen / im Raum  |

Nicht anzeigen:

- `waiting`: noch nicht fuer diesen Raum aufgerufen
- `absent_*`: gelbe Zone bleibt MFA-Thema
- `done`: erledigt, vom Panel entfernen

Reihenfolge: rein chronologisch nach Aufrufzeit, aeltester Aufruf oben. `called` und `in_room`
werden dabei nicht gegeneinander priorisiert; fehlt die Aufrufzeit, gilt die Check-in-Zeit.

Default ohne Namen:

```text
Sprechzimmer 2

A-042
Bitte eintreten.
```

Optional mit Namen nur bei Raum-Setting `showPatientNames: true`:

```text
Sprechzimmer 2

A-042
M. Beispiel
Bitte eintreten.
```

---

## Settings-Modell

Bestehende `rooms[]` erweitern:

```ts
type RoomPanelPlacement = 'outside' | 'inside';
type RoomPanelMode = 'display_only' | 'arrival' | 'staff_full';

type RoomPanelTextPreset =
  | 'you_are_right'
  | 'please_wait_here'
  | 'please_enter'
  | 'go_to_reception'
  | 'custom';

type Room = {
  roomId: string;
  roomLabel: string;
  enabled: boolean;
  defaultCallTarget?: boolean;
  maxOccupancy?: number | null;
  panel?: {
    enabled: boolean;
    placement: RoomPanelPlacement;
    mode: RoomPanelMode;
    showPatientNames: boolean;
    calledTextPreset: RoomPanelTextPreset;
    calledTextCustom?: string | null;
    arrivedTextPreset: RoomPanelTextPreset;
    arrivedTextCustom?: string | null;
  };
};
```

Validierung:

- `placement` default `outside`; ausserhalb gilt serverseitig immer `showPatientNames: false`
- `showPatientNames` default `false` und nur bei `inside` erlaubt
- Bei Auswahl von `staff_full` darf die UI `showPatientNames` vorauswaehlen, weil dieser Modus fuer Tablets im Raum gedacht ist. Die Option bleibt sichtbar und abschaltbar.
- Custom-Texte trimmen, max. 80 Zeichen
- `arrival` nur `check_in_room`, kein `check_out_room`; der Button lautet ausserhalb „Ich bin da“, im Raum „Patient ist da“
- `staff_full` darf `check_out_room`
- `staff_full` ist nur bei `inside` erlaubt

---

## Rolle / Claim

Neue Client-Rolle:

```text
room-panel
```

Warum eigene Rolle:

- Schnittmenge aus `tv` und `mfa`: Queue lesen wie TV/MFA, aber Aktionen nur fuer einen Raum.
- Kein Zugriff auf Dokumente, Settings, Identity-Listen, Ops-Wartung.
- Optional Namen nur, wenn Raumsetting es erlaubt.

Architektur-Hinweis: `room-panel` ist nicht nur ein weiterer `tv`- oder `mfa`-Fall. Die bestehende Auth-Schicht muss erweitert werden:

- `ClientRole` um `room-panel`
- Device-/Session-Rolle um `room-panel`
- eigener Cookie oder klar benannter Device-Session-Cookie fuer Raum-Panels
- Session-Payload mit `roomId`, `placement` und `sessionId`
- Device-Role-/Cookie-Aufloesung muss `room-panel` kennen

Session-/Claim-Inhalt:

```ts
type RoomPanelSession = {
  role: 'room-panel';
  roomId: string;
  placement: RoomPanelPlacement;
  sessionId: string;
};
```

V1 erlaubt pro Raum mehrere aktive Sessions mit demselben Panel-Profil. Dadurch kann ein PIN-freier Outside-Login keine bestehende Anzeige abmelden. Mehrere unterschiedlich konfigurierte Panel-Profile bleiben eine spaetere Erweiterung auf `panels[]`.

Zugriff:

| API                                                         | `room-panel`                                                                 |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `GET /api/v1/queue`                                         | nur Raum-Snapshot                                                            |
| `GET /api/v1/queue/stream`                                  | nur Raum-Snapshot                                                            |
| `POST /api/v1/queue/:ticket/transition type=check_in_room`  | ja, mit `actingRoomId = session.roomId`                                      |
| `POST /api/v1/queue/:ticket/transition type=check_out_room` | nur aktuell konfiguriertes `staff_full`, mit `actingRoomId = session.roomId` |
| Dokumente / Ops / Settings                                  | nein                                                                         |

Bestehender Backend-Guard `actingRoomId` passt fachlich: falscher Raum gibt `QUEUE_ROOM_MISMATCH`.

Wichtig: Der Server darf bei `room-panel` nicht dem Request-Body vertrauen. Er setzt `actingRoomId` aus `request.authSession.roomId`, ignoriert/verwirft ein Body-`actingRoomId` und erlaubt nur:

- `check_in_room`
- `check_out_room` nur, wenn der aktuelle Raum-Modus `staff_full` ist

Alle anderen Transition-Typen bleiben MFA-only.

---

## API / OpenAPI

Option A: vorhandene Queue-Endpunkte rollenabhaengig erweitern.

- `GET /api/v1/queue` bei `room-panel` liefert:

```ts
type RoomPanelQueueSnapshot = {
  view: 'room-panel';
  roomId: string;
  roomLabel: string;
  revision: number;
  serverTime: string;
  panel: {
    mode: RoomPanelMode;
    placement: RoomPanelPlacement;
    showPatientNames: boolean;
    calledText: string;
    arrivedText: string;
  };
  items: Array<{
    ticketId: string;
    laneCode: string;
    number: number;
    status: 'called' | 'in_room';
    calledAt?: string;
    roomId: string;
    roomLabel: string;
    identityRef?: string | null; // nur wenn showPatientNames
  }>;
};
```

Option B: eigener Endpunkt `/api/v1/rooms/:roomId/panel`.

Empfehlung: **Option A**, weil Queue-Stream/Revision/Presence wiederverwendet werden. OpenAPI bekommt eine `oneOf`-Antwort fuer `mfa` / `tv` / `room-panel`.

Implementierungsanker:

- `buildRoomPanelQueueSnapshot(db, roomId, session)` als eigener Builder
- `currentRoomPanelQueueSnapshot(db, roomId, session)` im Queue-Stream-Hub
- eigene `subscribeRoomPanelQueueStream(roomId, listener)` oder Publish an alle Room-Panel-Listener mit serverseitiger Filterung
- `GET /api/v1/queue` muss explizit `role === 'room-panel'` behandeln; Default darf nicht auf MFA-Snapshot fallen
- `GET /api/v1/queue/stream` braucht einen eigenen `room-panel`-Zweig; TV-Zweig ist ungefiltert und darf nicht wiederverwendet werden
- UI-Typen diskriminieren ueber `view: 'mfa' | 'tv' | 'room-panel'`

Mehrere `called` Tickets pro Raum muessen unterstuetzt werden, z. B. bei Blutabnahme. Das Panel zeigt die naechste Nummer gross und weitere Nummern in einer Liste. Wenn die Liste nicht mehr auf den Screen passt, arbeitet die UI wie die TV-Anzeige mit Pagination/Auto-Rotation.

---

## Raum-Login, PIN und Presence

Kein Device-Pairing fuer Raum-Panels. Das ist fuer billige Raum-Tablets zu schwergewichtig. Stattdessen:

- Route `/room-panel` zeigt Raum-Auswahl + PIN-Eingabe fuer Panels im Raum; ausserhalb wird direkt eine Session ohne PIN erstellt.
- Panels im Raum nutzen eine globale Raum-PIN mit Raum-Auswahl.
- **PIN-Regel:** `outside` ohne PIN, `inside` immer mit PIN. Ausserhalb sind Namen serverseitig ausgeschlossen.
- Auch ohne PIN entsteht eine normale Cookie/Session mit Rolle `room-panel` + `roomId` (kein oeffentlicher Queue-Zugriff per URL).
- MFA darf Raum-PINs in den Praxis-Settings aendern.
- PIN-Aenderung braucht die alte PIN oder eine aktive MFA-Session mit passender Berechtigung.
- Nach Login entsteht eine Cookie/Session mit Rolle `room-panel` + `roomId`.
- Mehrere Raum-Sessions koennen dasselbe Panel-Profil parallel verwenden.
- Laufende Streams verlaengern nur die Idle-Frist und enden spaetestens mit der absoluten Session-Frist; ein Widerruf entfernt den Snapshot sofort.
- Ein Wechsel der globalen Raum-PIN widerruft nur `inside`-Sessions, weil `outside`-Sessions die PIN nicht verwenden.
- PIN-Login und PIN-freie Session-Ausgabe haben getrennte Rate-Limits. Aktive `outside`-Sessions sind pro Client begrenzt (`ROOM_PANEL_OUTSIDE_SESSION_MAX_PER_CLIENT`, Default `8`).
- Presence-Events erweitern um `room-panel`.

MFA sollte pro Raum sehen:

- kein Panel angemeldet
- ein Panel online/offline
- Panel angemeldet an Raum X

Nebenbefund: Auch die MFA-PIN selbst sollte in den Praxis-Settings aenderbar werden, mit alter PIN als Bestaetigung. Das ist kein Raum-Panel-Blocker, gehoert aber in denselben Settings-Bereich.

Presence muss dynamisch werden. Die bestehende Device-Presence ist auf TV/Terminal ausgerichtet; fuer Raum-Panels braucht es entweder ein neues Event oder eine erweiterte Payload:

```ts
type RoomPanelPresence = {
  kind: 'room-panel';
  roomId: string;
  sessionId: string;
  status: 'online' | 'stale' | 'offline';
  streamConnected: boolean;
  lastSeenAt: string | null;
};
```

MFA leitet daraus ab:

- 0 aktive Panels fuer Raum
- 1 aktives Panel fuer Raum
- mehr als 1 aktives Panel fuer Raum → bestaetigungspflichtiger Hinweis/Toast

---

## Echtzeit: SSE oder Polling?

Entscheidung: **SSE verwenden**, aber schlank.

Begruendung:

- Raum-Panel muss Aufrufe sofort sehen; Polling fuehlt sich bei Tuer-/Raumanzeigen traege an oder erzeugt unnoetige Last.
- Queue-SSE existiert bereits fuer MFA/TV; Raum-Panel kann denselben Stream-Hub mit gefiltertem Snapshot nutzen.
- Pagination/Auto-Rotation bleibt reine UI-Logik; SSE aktualisiert nur die Datenbasis.
- Fallback: Wenn SSE getrennt ist, zeigt das Panel einen Offline-Hinweis und kann alle 15-30 Sekunden einen REST-Snapshot nachladen.

Kein separater WebSocket, kein komplexer bidirektionaler Kanal.

---

## UI-Routen

Neue Route:

```text
/room-panel
```

Komponenten:

```text
ui/src/routes/room-panel/+layout.svelte
ui/src/routes/room-panel/+page.svelte
ui/src/lib/room-panel/room-panel-api.ts
ui/src/lib/room-panel/room-panel-stream.ts
ui/src/lib/room-panel/room-panel-display.svelte.ts
ui/src/lib/components/room-panel/RoomPanelDisplay.svelte
ui/src/lib/components/room-panel/RoomPanelActionBar.svelte
```

Svelte 5 / Runes:

- State in `.svelte.ts` mit `$state`, `$derived`
- UI-Komponenten als dumme Komponenten mit Props/Callbacks
- keine direkte `navigator.userAgent`-Logik in Komponenten

---

## Responsive / Device Detection

Referenz: `/Users/ddeuter/dev/work/bb_pilot/`

Cherry-Picking aus `bb_pilot`, nicht 1:1 kopieren:

| Quelle                                                                                    | Was uebernehmen                                                |
| ----------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `/Users/ddeuter/dev/work/bb_pilot/src/lib/stores/deviceStore.ts`                          | zentraler Device-State mit `deviceType` und `isPortrait`       |
| `/Users/ddeuter/dev/work/bb_pilot/src/lib/services/DeviceDetectionService.ts`             | Resize-/Orientation-Listener und Device-Info-Kapselung         |
| `/Users/ddeuter/dev/work/bb_pilot/src/lib/services/interfaces/IDeviceDetectionService.ts` | kleines Interface statt direkter Browser-Checks in Komponenten |
| `/Users/ddeuter/dev/work/bb_pilot/src/app.html`                                           | `viewport-fit=cover`, PWA-/Mobile-Meta-Tags                    |
| `/Users/ddeuter/dev/work/bb_pilot/src/app.css`                                            | Safe-Area-Variablen, `100dvh`, Touch-Targets, `touch-action`   |

Prinzipien:

- zentrale Device-/Viewport-Erkennung statt ad-hoc Checks
- `deviceType` und `isPortrait` als Store/Runes-State
- `orientationchange` und `resize` sauber abonnieren
- `viewport-fit=cover`, Safe-Area-CSS-Variablen
- `100dvh` als primaere Hoehe
- Touch-Targets mindestens 44px
- `touch-action` bewusst setzen

Praxis-Flow Umsetzung:

```ts
type AppSurfaceDevice = {
  isPortrait: boolean;
  deviceType: 'mobile' | 'desktop';
  width: number;
  height: number;
};
```

Layout:

| Zustand           | Layout                                                                                           |
| ----------------- | ------------------------------------------------------------------------------------------------ |
| Hochkant Tablet   | Tuerdisplay: Raumname oben, naechste Nummer gross, weitere Nummern paginiert/klein, Button unten |
| Querformat Tablet | links Nummern/Status, rechts Aktionen; bei vielen Nummern Pagination                             |
| Desktop/Debug     | begrenzte Breite, gleiche Komponenten                                                            |

Keine Schriftgroesse per `vw`; stattdessen stabile Container, `clamp()` nur mit festen rem-Grenzen falls noetig.

---

## Datenschutz

Default:

- keine Namen
- keine Dokument-Hinweise
- keine Telefonnummern
- keine Anliegen, wenn das Panel im Flur haengt

Optional:

- `showPatientNames` pro Raum nur fuer interne Nutzung
- UI-Hinweis im Settings-Dialog: „Nur aktivieren, wenn das Panel nicht oeffentlich einsehbar ist.“

Damit entscheidet die Praxis den Einsatzort; der Anbieter liefert datensparsame Defaults.

---

## Umsetzungspakete

### A — Vertrag und Settings

- OpenAPI: Rolle `room-panel`, Snapshot-Typ, Room-Panel-Settings
- Generated Types/Schemas
- DB Settings Parse/Validate
- ACL-Regeln
- Room-Panel-Session/Cookie inkl. `roomId`, `placement`, `sessionId`
- `RoomPanelQueueSnapshot` als dritte `oneOf`-Variante fuer Queue
- Codegen: `npm run generate:api`, Drift-Checks

### B — Backend Runtime

- Raum-Snapshot aus Queue bauen
- Queue-Stream fuer `room-panel`
- Transition-Guard mit Session-`roomId`
- Presence und Raum-Session-Registry um `room-panel` erweitern
- MFA-Hinweis ausloesen, wenn mehrere aktive Panels denselben Raum nutzen
- Transition-Router: fuer `room-panel` nur erlaubte Typen, `actingRoomId` serverseitig setzen
- REST-Fallback fuer Snapshot bei getrenntem SSE

### B2 — Settings-/Storage-Risiken

- `rooms_json` Parser erweitert `panel` mit Defaults, ohne Alt-Daten zu brechen
- Settings-Mapper muss `panel`-Felder erhalten; Room-Edits duerfen Panel-Settings nicht verlieren
- Runtime-Reset erhaelt Room-Panel-Settings
- OpenAPI `rooms` erlaubt `panel` trotz `additionalProperties: false`
- Tests: „room edit preserves panel settings“, Defaults fuer alte Rooms, invalid custom text rejected

### C — MFA Settings

- Raum-Editor: Panel aktiv, Modus, Namen anzeigen, Textvorlagen + eigener Text
- Praxis-Settings: Raum-PINs verwalten und Raum-Session anzeigen

### D — Room-Panel UI

- `/room-panel` Route
- Raum-PIN-Login
- Anzeige Hoch-/Querformat
- Aktionen je Modus

### E — Tests / Smoke

- ACL: Raum-Panel darf nur erlaubte Routen
- Snapshot ohne Namen per Default
- Snapshot mit Namen nur bei Setting
- mehrere `called` Tickets werden sortiert und paginiert
- mehrere Sessions koennen dasselbe Panel-Profil verwenden, ohne sich gegenseitig abzumelden
- SSE-Snapshot ist pro Raum gefiltert; REST-Fallback liefert denselben Snapshot
- `check_in_room` mit falschem Raum blockiert
- `check_out_room` nur in `staff_full`
- `room-panel` kann kein `call`, `reassign_room`, `return_to_waiting`, `cycle_triage`, Dokument- oder Settings-API
- Body-`actingRoomId` wird bei `room-panel` ignoriert/verboten; Session-`roomId` gewinnt
- Mobile/Portrait Layout per Playwright-Screenshot, wenn E2E vorhanden

---

## Entscheidungen

1. Kein eigener Modus fuer „Personal angekommen“; das Panel verwaltet Wartenummern, nicht Mitarbeiter-Anwesenheit.
2. V1 hat pro Raum genau ein Panel-Profil, das mehrere aktive Sessions parallel verwenden duerfen.
3. `placement` ist die Sicherheitsgrenze: ausserhalb ohne PIN und Namen, im Raum mit PIN und optionalen Namen.
4. Umsetzung ueber neue Rolle `room-panel` und rollenabhaengigen Queue-Snapshot.
5. Mehrere Aufrufe pro Raum werden unterstuetzt; bei zu vielen Eintraegen nutzt das Panel Pagination/Auto-Rotation wie die TV-Anzeige.
6. Kein Raum-Panel-i18n in v1; Piktogramme unterstuetzen Warten/Eintreten/Ankunft.
7. Kein Pairing fuer Raum-Panels; stattdessen Raum-PIN-Login, aenderbar durch MFA.
8. SSE wird genutzt, weil Queue-Streams existieren und Raum-Aufrufe live erscheinen muessen; REST nur als Fallback.
