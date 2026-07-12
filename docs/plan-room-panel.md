# Plan — Raum-Panel v2

Stand: 2026-07-12

**Ziel:** Pro Raum zwei unabhaengige Panels: **Tuer** (`outside`) und **im Raum** (`inside`). Inside kann optional Patienten aufrufen; WZ-TV-Ankuendigung und Flow-Guards bleiben Pflicht.

---

## Leitentscheidungen

- `placement` wird Teil der Panel-Identitaet: Auth, Session, Device Presence, Revoke, Login-Liste, UI-Badges.
- Datenmodell: `room.panels.outside` + `room.panels.inside`; Legacy `room.panel` wird beim Load migriert.
- `outside`: kein PIN, nur `display_only | arrival`, nie Namen, nie Aufruf.
- `inside`: PIN, `display_only | arrival | staff_full`, optional Namen, optional Aufruf.
- UI: Raeume nicht mehr primaer im Modal bearbeiten, sondern als Expander/Accordion. Settings direkt im Raum-Expander.
- Wenn kein bedienbares Panel existiert, bleibt MFA die vollstaendige Primary-Action-Flaeche.

---

## Scope vs. Aktion

```text
Gehoert der Visit zu diesem Raum?     Darf dieses Panel etwas tun?
visitTargetsRoom(visit, roomId)  ->   capabilities + Flow-Core Transition
```

**Scope:** Status-aware Zielraum bestimmen:

- `waiting` / `directed`: `destinationRoomId || targetLocationId`
- `called` / `in_room`: `roomId` bevorzugen

**Aktion:** Server entscheidet final:

- `canCheckIn`: `mode !== display_only`
- `canCheckOut`: `inside + staff_full`
- `canCall`: `inside + enabled + allowCalling`
- `mayShowPatientNames`: `inside + showPatientNames`

Flow-Core prueft bei `call` weiter Status (`waiting`/`directed`), `movementMode: call`, Journey, Capacity; Host prueft WZ-TV online.

---

## Datenmodell

```ts
type RoomPanelPlacementConfig = {
  enabled: boolean;
  mode: RoomPanelMode;
  showPatientNames: boolean; // inside only
  allowCalling: boolean;     // inside only
  calledTextPreset: RoomPanelTextPreset;
  calledTextCustom: string | null;
  arrivedTextPreset: RoomPanelTextPreset;
  arrivedTextCustom: string | null;
};

type RoomPanelsSettings = {
  outside: RoomPanelPlacementConfig;
  inside: RoomPanelPlacementConfig;
};
```

Normalisierung:

- Legacy `panel.placement === outside` -> `panels.outside`
- Legacy `panel.placement === inside` -> `panels.inside`
- `outside.staff_full` -> `outside.arrival`
- `outside.showPatientNames/allowCalling` -> `false`

---

## Auth, Session, Device

- `GET /auth/room-panel/rooms`: ein Eintrag pro aktivem Placement: `{ roomId, roomLabel, placement, mode, requiresPin }`.
- `POST /auth/room-panel/login`: OpenAPI verlangt `roomId + placement`; `pin` ist optional und nur fuer `inside` erforderlich.
- Session: `{ roomId, placement, clientKey? }`; Placement nie clientseitig aus Queue-Requests ableiten.
- Device Presence: Device-ID pro `roomId + placement`, nicht nur pro Raum.
- Bestehende Rate-Limits bleiben: outside IP/session-limit, inside PIN-rate-limit.
- Revoke:
  - Raum deaktiviert/entfernt -> beide Placements
  - Placement deaktiviert/geaendert -> nur dieses Placement
  - PIN-Wechsel -> inside-Sessions

---

## Snapshot & Aktionen

Room-Panel-Snapshot liefert:

- `panel`: placement, mode, Texte, Datenschutz
- `capabilities`: aus `resolveRoomPanelCapabilities`
- `items`: aktuelle Raum-Items (`called`, `directed`, `in_room`)
- optional `callCandidates`: nur Visits mit Zielraum und erlaubter Call-Transition (`waiting`/`directed` + `movementMode: call`)

Pro Item/Kandidat nach Moeglichkeit serverseitig Actions vormerken:

```ts
actions: {
  canCall?: boolean;
  canArrive?: boolean;
  canCheckOut?: boolean;
  disabledReason?: string;
}
```

UI nutzt diese Actions fuer Buttons; Server bleibt autoritativ und antwortet bei Race/Guard mit 403/409.
Namensbruecke: UI `canArrive` fuehrt API `check_in_room` aus; Core behandelt das als `arrive`.

---

## Was das Panel nicht darf

Bleibt MFA:

- `reassign_room`
- `return_to_waiting`
- Triage
- Supersede
- pickup-hop Aktionen

---

## Arbeitspakete

### P0 — Plan & Domain-Schaerfung

- [x] Capabilities: `canCall`, `mayShowPatientNames`, `requiresPin`
- [ ] `visitTargetsRoom` status-aware schaerfen
- [ ] Domain-Types fuer `RoomPanelsSettings`

### P1 — Dual-Placement Daten/API

- [ ] Settings normalisieren: `panel` -> `panels`
- [ ] DB/Ops Mapper/OpenAPI anpassen
- [ ] Catalog-Surface aktiv, wenn `outside` oder `inside` aktiv
- [ ] Catalog `supportsCalling` dynamisch setzen, wenn ein inside-Panel `allowCalling` hat
- [ ] Tests fuer Legacy-Migration und Outside-Normalisierung

### P2 — Auth, Session, Device Identity

- [ ] Login-Liste flach pro Placement
- [ ] Login-Body/OpenAPI: `roomId + placement`, `pin?`
- [ ] `resolveRoomPanelForSession(roomId, placement)` auf `panels[placement]`
- [ ] Device Presence IDs pro Placement
- [ ] Placement-granularer Session-Revoke
- [ ] Tests: parallel outside+inside, falsches Placement, PIN nur inside

### P3 — Backend Aufruf & Snapshot

- [ ] `applyRoomPanelQueueVisitTransition`: `call` nur mit `canCall`
- [ ] WZ-TV/Capacity/Flow-Core Guards fuer Panel-Call wiederverwenden
- [ ] Snapshot mit `capabilities`, Actions und optional `callCandidates`
- [ ] Tests: 403 outside, 403 ohne `allowCalling`, 409 TV offline, 409 capacity, Race

### P4 — MFA Settings UI

- [ ] `RoomsEditor` zu Expander/Accordion umbauen
- [ ] Raum-Basisdaten im Expander statt schwerem Edit-Modal
- [ ] Sektionen: `Tuer-Panel` und `Raum-Panel`
- [ ] Pro Placement: aktiv, Modus, Texte, Status-Badge, Setup/Login-Hinweis
- [ ] Inside zusaetzlich: Namen anzeigen, Patienten aufrufen
- [ ] Modal nur noch fuer Hinzufuegen/Loeschen oder riskante Confirm-Flows

### P5 — Panel Live/Login UI

- [ ] Login zeigt Placement: `Labor - Tuer`, `Labor - im Raum`
- [ ] Live-Panel zeigt Actions aus Snapshot
- [ ] Inside-Aufruf-UX: erst Auswahl-Liste; spaeter optional "Naechster"
- [ ] Race/409 als Toast + Snapshot refresh

### P6 — Doku

- [ ] `docs/flows.md`: Room-Panel Rollen/Aktionen
- [ ] `docs/apis.md`: Login/Snapshot/Transitions
- [ ] OpenAPI-Typen regenerieren

---

## Offen

1. Aufruf-UX final: Auswahl-Liste reicht erstmal; "Naechster fuer diesen Raum" spaeter.
2. Soll `callCandidates` im normalen Snapshot liegen oder eigener Endpoint werden?

---

## Code-Referenzen

| Bereich | Pfad |
|---------|------|
| Policy | `packages/domain/src/room-panel-policy.ts` |
| Settings | `packages/domain/src/room-panel-settings.ts` |
| Queue | `app/src/routes/queue-routes.ts` |
| Snapshot | `app/src/shared/queue/room-panel-queue-snapshot.ts` |
| Auth | `app/src/routes/auth-routes.ts` |
| UI Settings | `ui/src/lib/components/mfa/RoomsEditor.svelte` |
| UI Modal alt | `ui/src/lib/components/mfa/RoomEditorModal.svelte` |
