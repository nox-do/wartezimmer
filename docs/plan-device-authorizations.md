# Plan: Persistente Gerätefreigaben (TV, Terminal & Room-Panel)

Stand: 2026-09-01

Status: **Schnitt 1 und 2 erledigt.** Vertrag ist dieses Dokument.

Vertrag in einem Satz: Tabelle + Auth liest Zeile statt Staff-Session + Cookie
Max-Age gleitet am bestehenden Traffic (Token gleich) + Ping prüft Revoke +
Update kopiert aus alter DB + Restore nicht.

Kein Code in diesem Dokument. Kein TTL-Hotfix vor diesem Umbau. Idle-Refresh am
Room-Panel-SSE existiert bereits und löst weder Absolute-12h noch App-Restarts.

Verwandt:

- Ist-Realtime / Presence ≠ Pairing: [`architecture/realtime.md`](architecture/realtime.md)
- Fresh DB + Settings-Import: [`operations/backup.md`](operations/backup.md)
- Auth-Rollen: [`architecture/apis.md`](architecture/apis.md)
- Device-IDs: `packages/domain/src/device-ids.ts`
- Abarbeitung: drei Schnitte unten; Fortschrittstabelle am Ende pflegen

---

## Fachliches Ziel

TV, Terminal und Room-Panel sind **Gerätefreigaben**, keine Staff-Login-Sessions.

Nach einmaligem Enrollment/Pairing bleibt das Gerät autorisiert über Sleep/Wake,
App-/Container-Neustarts und normale Produkt-Updates.

Neues Enrollment/Pairing nur noch nach explizitem Entkoppeln (MFA oder
Relogin-Hotspot am Panel), gelöschten Browserdaten, geänderter Origin,
Raum-/Placement-Deaktivierung bzw. PIN-Reset (Panels), Backup-Restore,
Sicherheitsvorfall, oder dem **einmaligen Cutover** (alte In-Memory-Token sind
nicht migrierbar).

Staff (MFA/OPS) bleibt beim bestehenden Session-Modell (Idle/Absolute-TTL
unverändert).

---

## Code-Befund (kurz)

Room-Panel sitzt auf `createStaffSessionManager` (2h/12h). Queue-SSE refreshed
Idle und beendet bei Absolute-TTL. Außen-Auto-Login kaschiert Sessionverlust.
Mehrere Sessions pro room+placement sind erlaubt. Presence aggregiert
`room-panel:<roomId>:<placement>`. Snapshot enthält PIN-Hashes, keine
Gerätefreigaben. Pairing-Registry hat bereits eine Confirmed-Poll-Grace
(~60s).

Urteil: **Kein Room-Panel-TTL-Fix.** Eine persistente Freigabe für alle drei
Geräteklassen.

---

## Festgelegt

### Modell

1. Eine Tabelle `device_authorizations`, getrennt vom Staff-Session-Manager.
   Persistenz im bestehenden `database-*.ts`-Stil — keine extra
   Service-/Repository-Schicht.
2. Keine Idle-/Absolute-Expiration. `last_seen_at` ist Audit (throttled,
   nicht pro SSE-Ping).
3. Dauerhaft nur Token-Hash. Roh-Token nur kurz bei Pairing-Übergabe bzw.
   einmalig beim Panel-Enrollment (Cookie, nicht in Logs).
4. Soft-revoke (`revoked_at`); Hard-delete nicht in v1.
5. Presence und Authorization bleiben getrennt. Aggregat-Slots bleiben
   (`waiting-room`, `checkin-terminal`, `room-panel:<roomId>:<placement>`).
   Keine Presence pro `authorization_id` in v1. Gezielter Widerruf liest die
   Tabelle.

### Cookie

6. Langes Device-/Panel-Cookie (z. B. 365d). **Rollen = Sliding Max-Age,
   Token unverändert** — kein Secret-Rotate, keine zweite Hash-Spalte.
   **Kein** `/auth/device/renew`.
7. SSE-Ping kann das Cookie **nicht** rollen (Response-Header sind dann
   schon gesendet). Rollen gilt:
   - bei normalen authentifizierten Responses,
   - beim Aufbau bzw. Reconnect des SSE (`Set-Cookie` an der Stream-Eröffnung),
   - bei dauerhaft offenen Streams gelegentlich kontrolliert reconnecten
     **oder** den bestehenden `/queue`-Request auf Mount/Wake verwenden.
8. `Secure` am Cookie weiter nur bei HTTPS. LAN-TLS empfohlen.

### Auth & SSE

9. Authenticate: Cookie-Token → SHA-256 → aktive Zeile (`revoked_at IS NULL`).
   Am Request reicht die gelesene Zeile; Staff-Session-Manager nur noch MFA/OPS.
10. SSE-Ping prüft `revoked_at` (Panels zusätzlich: Raum/Placement noch
    enabled). Widerruf wirkt spätestens am nächsten Ping; Stream zu → Client
    Pairing/Enrollment. Kein `refreshSession()` für diese Rollen.
11. Nur eindeutiges `401` (fehlende/widerrufene Freigabe) bzw. Panel-`403`
    (Raum/Placement deaktiviert) führt zurück ins Pairing/Enrollment.
    Netzwerkfehler, Timeouts und `5xx` behalten Cookie/Freigabe.

### Update, Restore, Tagesreset

12. **Update:** Fresh-DB-Cutover kopiert **aktive** Zeilen **nach**
    App-Start/Schema. Setup liest die Aside-SQLite auf dem Host (read-only);
    Maintenance `:8082` schreibt in die neue DB. Kein `cp` auf die offene
    Datei/WAL. Eigenes Flag nur im Update-Caller — Restore teilt denselben
    Cutover und darf den Hook nicht mitlaufen. Tabelle in der Aside fehlt →
    leer (einmal neu koppeln). Kein Snapshot-Feld, keine Hashes in
    `.pfbackup`.
13. **Backup-Restore:** kopiert `device_authorizations` **nicht**. Tabelle
    bleibt leer; TV, Terminal und Panels neu koppeln/enrollen.
14. **Tagesreset** verändert `device_authorizations` nicht (Regressionstest).
15. Alte In-Memory-Sessions werden nicht über den Cutover migriert.

### TV / Terminal

16. Pairing-Code-Flow bleibt. MFA-Confirm schreibt **keine** Tabellenzeile —
    Token bleibt in der Pairing-Registry. INSERT der neuen Zeile und
    Soft-Revoke der alten derselben `(role, device_id)` erst beim **ersten
    erfolgreichen Poll**, in einer Transaktion. Abgebrochene Confirm lässt
    das alte Gerät aktiv. Kein Pending-Status in der Tabelle.
    **Confirmed** Rows (`deviceToken` gesetzt) nicht über Pairing-`expiresAtMs`
    / `pruneExpiredPairings` / Status-`expired` löschen — nur über die
    bestehende Poll-Grace (~60s). Sonst fällt der Poll-INSERT aus, wenn
    Confirm kurz vor TTL kommt.
17. Höchstens eine aktive Freigabe pro `(role, device_id)` (Partial-Unique).
18. Presence löscht kein Pairing. `TV_LOCAL_ORIGIN` bleibt.

### Room-Panel

19. Mehrere aktive Freigaben pro `(room_id, placement)`. Unique nur
    `authorization_id`.
20. Enrollment einmalig: Raum + Placement, immer mit der **gemeinsamen
    Room-Panel-PIN** (außen und innen gleich). Danach PIN-frei bis Widerruf.
    Kein MFA-Bestätigungsflow für Panels in v1. Kein dauerhaftes Enrollment
    ohne PIN.
21. Group-Revoke: Raum aus → alle Panels des Raums; Placement aus → dieses
    Placement; gemeinsame PIN geändert → **alle** Room-Panel-Freigaben;
    Relogin-Hotspot → nur diese `authorization_id`. Mode/Texte/Rechte live,
    kein Logout.
22. IP/`clientKey` höchstens Rate-Limit, kein Cap für dauerhafte Freigaben.
23. Ein Browserprofil = ein Panel-Cookie; mehrere Kioskfenster = getrennte
    Profile (Doku, kein Multi-Cookie-Hack).

### MFA

24. Liste aktiver Freigaben und gezieltes Entkoppeln: in Schnitt 2 für
    TV/Terminal, in Schnitt 3 Panels in dieselbe Liste. Kein optionales
    `label` in v1 (Anzeige: Rolle/Slot bzw. Raum+Placement+created_at).

### Sicherheit (bewusst)

25. Ein gestohlenes Cookie bleibt **bis zum MFA-Widerruf** (oder
    Origin-/Cookie-Verlust, Group-Revoke) gültig. Das wird unter der
    LAN-/TLS-Annahme akzeptiert. Kein heimliches Absolute-TTL.
26. Rechte der Panels kommen live aus der Raumkonfiguration, nicht aus der
    Freigabezeile.

---

## Tabelle `device_authorizations`

```
device_authorizations
  authorization_id   TEXT PK
  role               TEXT NOT NULL     -- 'tv' | 'terminal' | 'room-panel'
  device_id          TEXT NULL         -- TV/Terminal Slot-ID; bei Panels immer NULL
  room_id            TEXT NULL         -- nur room-panel
  placement          TEXT NULL         -- 'outside' | 'inside'; nur room-panel
  token_hash         TEXT NOT NULL UNIQUE
  created_at         TEXT NOT NULL
  last_seen_at       TEXT NULL
  updated_at         TEXT NOT NULL
  revoked_at         TEXT NULL         -- NULL = aktiv

-- TV/Terminal: Partial-Unique auf aktive (role, device_id)
-- Room-Panel: viele aktive Zeilen pro room_id+placement
```

Constraints: TV/Terminal `device_id NOT NULL`, `room_id`/`placement` NULL;
Room-Panel umgekehrt. Replace nur am erfolgreichen Poll (siehe 16), nicht
bei Confirm.

**Schema / Dev:** Noch nicht live — Tabelle in die Baseline; lokale SQLite /
Volume hier neu initialisieren. Kein In-Place-Migrations-Theater, kein
`SCHEMA_GENERATION`-Bump extra für diese Tabelle.

---

## Schnitte

### Schnitt 1 — Schema

- Baseline: Tabelle wie oben; Dev-DB neu anlegen (Volume/SQLite löschen).
- DB-Funktionen (`database-*.ts`): create, authenticate, replace
  (TV/Terminal), enroll panel, touch (throttled), revoke by id / device /
  room / placement / all panels, list active.
- Update-Cutover: Copy-Flag; Setup liest Aside, Maintenance schreibt Zeilen.
- Restore: Flag aus; Tabelle leer.
- Tests: TV-Slot-Unique; mehrere Panels gleiches Placement; Update erhält
  Freigaben; Restore und fehlendes/altes Backup ergeben leer; Tagesreset
  lässt die Tabelle unangetastet.
- HTTP-Auth unverändert.
- Aufräumen von `database-device-authorizations.ts` (Parser/Copy-Typen, dünne
  Revoke-Wrapper) **nicht** hier — in Schnitt 2.

**Done wenn:** Schema+DB-Funktionen grün; App-Verhalten nach außen unverändert.

### Schnitt 2 — TV/Terminal

- Auth liest Authorization statt Staff-Session; Device-Sessions aus dem
  Staff-Manager entfernen.
- Pairing: Confirm nur Registry; Replace erst beim erfolgreichen Poll;
  confirmed nicht per Pairing-TTL prunen.
- Cookie-Max-Age am bestehenden Traffic gleiten (inkl. SSE-Eröffnung /
  Reconnect; Mount/Wake über `/queue` oder kontrollierten Reconnect).
- SSE-Ping prüft `revoked_at`.
- MFA: Liste + gezielter Revoke für TV/Terminal.
- `database-device-authorizations.ts` straffen (Import-Parser, Copy-Typ,
  Revoke-Wrapper) — in diesem Schnitt, nicht extra.
- Presence löscht kein Pairing. `TV_LOCAL_ORIGIN` bleibt.
- Tests: 2h/12h/Restart/Sleep ohne Re-Pair; Re-Pair ersetzt nur denselben
  Slot; abgebrochene Confirm; Poll-Grace; Revoke schließt spätestens am
  Ping; Staff-TTLs unverändert; Netzwerk-/5xx kein Re-Pair.

**Done wenn:** TV+Terminal produktiv auf Freigaben; Room-Panel noch auf altem
Session-Pfad (akzeptierte Zwischenstufe).

### Schnitt 3 — Room-Panels

- Login → einmaliges PIN-Enrollment (außen und innen).
- Panel-Auth aus dem Staff-Session-Manager; Absolute-Timer + `refreshSession`
  am Panel-SSE weg; Ping prüft Authorization + Raumkonfiguration.
- Group-Revoke wie festgelegt; Relogin-Hotspot nur diese ID.
- Dieselbe MFA-Liste um Panels erweitern.
- Aggregierte Presence beibehalten.
- IP-Cap für dauerhafte Freigaben entfernen (Rate-Limit am Enrollment ok).
- Client: nach 401/403 Enrollment statt Blind-Auto-Login ohne PIN.
- Tote Session-Pfade, Flags, Caps, Heuristik-`sessionStorage` aufräumen.
- Tests: Restart/Sleep/>12h; zwei Panels unabhängig; Raum/Placement/PIN-Reset
  widerruft die erwartete Menge; Relogin-Hotspot; Rechte live; Enrollment
  ohne PIN legt keine Zeile an; IP-Wechsel allein widerruft nicht.
- Release-Hinweis: einmal Pairing/Enrollment aller Geräte; Außen-Panels
  brauchen einmal die Room-Panel-PIN.

**Done wenn:** Außen und Innen überleben Restart/Sleep/12h; Enrollment einmalig
mit PIN; Invalidierungsmatrix wie oben.

---

## Wesentliche Tests

1. Kein TTL: autorisiert nach 2h, 12h, Restart, Sleep (Presence ändert sich).
2. Update-Copy erhält aktive Freigaben; Restore lässt die Tabelle leer.
3. Tagesreset lässt `device_authorizations` unangetastet.
4. TV/Terminal: Replace erst beim erfolgreichen Poll; Grace unabhängig von
   Pairing-TTL; Slot-Unique.
5. Revoke → nächster SSE-Ping beendet den Stream; Reconnect → 401.
6. Panel-Revoke-Matrix: Raum / Placement / PIN / einzelne ID.
7. Staff-TTLs unverändert; 5xx/Netzwerk kein erzwungenes Re-Pair.

---

## Rollout

1. Release nach Schnitt 3.
2. **Einmal** TV, Terminal und alle Room-Panels neu koppeln/enrollen.
3. Danach überleben Freigaben Sleep, Neustarts und normale Updates.
4. Nach jedem Backup-Restore neu koppeln/enrollen.
5. Außen-Panels: einmal PIN beim Cutover (Release Notes).

---

## Explizit nicht in diesem Plan

- Staff (MFA/OPS) auf Gerätefreigaben.
- Mehrere produktive TVs/Terminals in der MFA-UI (Schema erlaubt IDs; UI
  bleibt Slot-basiert).
- Presence pro `authorization_id`; optionales `label`.
- Settings-Snapshot-Feld für Freigaben.
- Dedizierter Renew-Endpunkt; Token-Rotation / Dual-Hash; In-Process-Revoke-Event
  neben dem Ping.
- Multi-Cookie in einem Browserprofil.
- TTL-Hotfix; Migration bestehender In-Memory-Sessions; In-Place-Migrate
  bestehender Live-DBs (nicht live; Dev-Volume neu).
- Übernahme von Freigaben nach Backup-Restore.

---

## Fortschritt

| Schnitt | Status |
| --- | --- |
| 1 Schema (inkl. Update-Copy / Restore-leer) | **erledigt** |
| 2 TV/Terminal + MFA-Liste | **erledigt** |
| 3 Room-Panels + Aufräumen | offen |
