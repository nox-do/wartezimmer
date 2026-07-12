# Plan — Raum-Panel v2

Stand: 2026-07-12

**Ziel:** Pro Raum zwei unabhaengige Panels: **Tuer** (`outside`) und **im Raum** (`inside`). Inside kann optional Patienten aufrufen; WZ-TV-Ankuendigung und Flow-Guards bleiben Pflicht.

---

## Leitentscheidungen

- `placement` wird Teil der Panel-Identitaet: Auth, Session, Device Presence, Revoke, Login-Liste, UI-Badges.
- Breaking Umbau: `room.panel` wird durch `room.panels.outside` + `room.panels.inside` ersetzt. Keine Legacy-Migration, bis das Feature fertig ist.
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

- Neues Modell ist verbindlich; alte `panel`-Form wird nicht parallel unterstuetzt.
- Beide Placements haben zentrale Defaults: disabled, `display_only`, keine Namen, kein Aufruf.
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
  - Placement **deaktiviert** -> nur dieses Placement (`revokeRoomPanelSessionPlacement`)
  - Placement-Config (Modus, allowCalling, Texte, Namen) -> live ohne Re-Login; Session bleibt, Snapshot/403 erzwingen neu
  - PIN-Wechsel -> alle inside-Sessions

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
- [x] `visitTargetsRoom` status-aware schaerfen
- [x] Domain-Types fuer `RoomPanelsSettings`
- [x] Defaults fuer `RoomPanelPlacementConfig` + `RoomPanelsSettings`
- [x] Normalizer nur fuer neues `panels`-Modell; kein Legacy-Wrapper
- [x] Capabilities bei `enabled: false` auf false normalisieren (`requiresPin` bleibt Placement-Eigenschaft)

### P1 — Dual-Placement Daten/API

- [x] Breaking Schema/Mapper: `panel` entfernen, `panels` verwenden
- [x] DB/Ops Mapper/OpenAPI anpassen
- [x] Catalog-Surface aktiv, wenn `outside` oder `inside` aktiv
- [x] Catalog `supportsCalling` dynamisch setzen, wenn ein inside-Panel `allowCalling` hat
- [x] Tests fuer Defaults, neues Schema und Outside-Normalisierung

### P2 — Auth, Session, Device Identity

- [x] Login-Body/OpenAPI: `roomId + placement`, `pin?` (P1-Nachzug: Ambiguität bei Dual-Placement)
- [ ] Login-Liste flach pro Placement (API erledigt; UI-Labels → P5)
- [x] Device Presence IDs pro Placement (`room-panel:${roomId}:${placement}`)
- [x] `resolveRoomPanelForSession(roomId, placement)` auf `panels[placement]` (P1)
- [x] Placement-granularer Session-Revoke bei Disable (`revokeRoomPanelSessionPlacement`)
- [x] P2-Tests (Stand 2026-07-12):
  - [x] parallel outside+inside: Login beider Placements (`auth-routes.test.ts`), parallele Sessions + Revoke nur ein Placement (`client-auth.test.ts`)
  - [x] falsches/fehlendes Placement: `placement` fehlt → 400; nicht aktives Placement → 404; Session stale nach Disable → 403 Queue (`auth-routes`, `queue-routes`, `room-panel-policy`)
  - [x] PIN nur inside: outside ohne PIN ok; inside ohne/falscher PIN → 401 (`auth-routes.test.ts`, `room-panel-login.test.ts`)

### P3 — Backend Aufruf & Snapshot

- [x] `applyRoomPanelQueueVisitTransition`: `call` nur mit `canCall`
- [x] WZ-TV/Capacity/Flow-Core Guards fuer Panel-Call wiederverwenden
- [x] Snapshot mit `capabilities`, Actions und optional `callCandidates`
- [x] Tests: 403 outside, 403 ohne `allowCalling`, 409 TV offline (Capacity/Race via Flow-Core-Pfad)

### P4 — MFA Settings UI

- [x] `RoomsEditor` zu Expander/Accordion umbauen
- [x] Raum-Basisdaten im Expander statt schwerem Edit-Modal
- [x] Sektionen: `Tuer-Panel` und `Raum-Panel`
- [x] Pro Placement: aktiv, Modus, Texte, Status-Badge, Setup/Login-Hinweis
- [x] Inside zusaetzlich: Namen anzeigen, Patienten aufrufen (nur `staff_full`)
- [x] Modal nur noch fuer Hinzufuegen/Loeschen oder riskante Confirm-Flows

### P5 — Panel Live/Login UI

- [x] Login zeigt Placement: `Labor - Tuer`, `Labor - im Raum`
- [x] Live-Panel zeigt Actions aus Snapshot
- [x] Inside-Aufruf-UX: Auswahl-Liste aus `callCandidates` (Backend-FIFO)
- [x] Race/409 als Toast + Snapshot refresh; 403 Capability refresh ohne Auto-Logout

### P6 — Doku

- [ ] `docs/flows.md`: Room-Panel Rollen/Aktionen
- [ ] `docs/apis.md`: Login/Snapshot/Transitions
- [ ] OpenAPI-Typen regenerieren

---

## Offen

1. Aufruf-UX final: Auswahl-Liste reicht erstmal; "Naechster fuer diesen Raum" spaeter.
2. ~~Soll `callCandidates` im normalen Snapshot liegen oder eigener Endpoint werden?~~ → im Snapshot wenn `canCall`

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
