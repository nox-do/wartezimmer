# Arbeitsstand (intern)

Stand: 2026-09-03

## 2026-09-03 — DB-Schicht Review (app/src/shared/db)

- Review ohne Codefix: Reset mit FK OFF hinterlässt Waisen (host_state/sessions/docs)
- Timer vs. TX (Recall/Assist); Session-GET schreibt; Schema dreifach; waiting_room_full tot
- Canvas: db-layer-review
- Plan: [`docs/plan-db-layer-hygiene.md`](docs/plan-db-layer-hygiene.md)
- Schnitt 1: `clearFlowCoreVisitRuntime` mit FK an; Host/Portal vor visits; Tests Gen-1 + Baseline ohne Visit-CASCADE
- Als Nächstes: Schnitt 2 (Timer nach COMMIT)

## 2026-09-02

## 2026-09-02 — Wizard Review-Fixes

- Routing-Load-Fehler: Meldung + Retry auf Schritt 2 (kein Dead-End, Lizenz-Fail-open weg)
- Apply-Throw auf Schritt 8: Button „Anwenden“, FSM-Retry
- Release-Import: Status-Refresh-Fehler gefangen
- Lint: SSE-Ping-Timer const; MFA-Day-Watch ohne tote Assignment; ungenutztes a.btn-primary CSS
- pfupdate Apply: Fixture echte SQLite; Grant-Copy ohne HTTP bei 0 Zeilen

## 2026-09-02 — Wizard-Lifecycle

- Generation pro `show()`/`hide()`; UI-Writes und Progress nur für den aktuellen Lauf
- Confirm beim Session-Ende tot; Apply ruft `onHostMutated` trotzdem genau einmal
- Kein Wizard-FSM-Umbau, kein Split von busy/error

## 2026-09-02 — Manager bindet nur seine Setup-API

- Eigener Child-Prozess, ephemerer Loopback-Port, Start-Token, Health-Handshake (protocolVersion / Build-ID / Install-Home)
- `app.requestSingleInstanceLock()` — Prod eine Instanz; Dev pro Install-Home
- Fremde API nur mit `PRAXIS_FLOW_SETUP_ATTACH=1`
- Review: Packager-Import/Smoke (isoliertes Temp-Verzeichnis), Ready-Puffer, Spawn-error; npm-Tree-Kill später

## 2026-09-02 — Netzwerk- und TLS-Mutationen verriegelt

- Gemeinsamer Tab-Lock; Hydrate single-flight (hostname+LAN); Confirm beim Session-Ende tot
- TLS-Controller bleibt über Tab-Wechsel; kein Draft-Reset
- Host-Write-Latch überlebt hide(); Hydrate merkt den Versuch pro Identität (`lastHydrateKey`)
- Als Nächstes: Manager-Cleanup weiter

## 2026-09-01 — IPv6: kein Publish, kein Blocker

- Portal bindet v1 nur IPv4; `[::]` verboten; IPv6-Adresse auf der NIC ok
- PoC muss zeigen, dass IPv6 von außen nichts erreicht
- [`docs/plan-portal-lan-isolation.md`](docs/plan-portal-lan-isolation.md) §5.3, §6.3
- Als Nächstes: TLS-Umbau ist entscheidungsfrei genug zum Vorbereiten

## 2026-09-01 — Kein Reiserouter-Beschaffungshinweis

- §4.1 entfernt; zweite NIC bleibt Praxis-IT ohne Modellliste
- [`docs/plan-portal-lan-isolation.md`](docs/plan-portal-lan-isolation.md)
- Als Nächstes: Entscheidungen nacheinander

## 2026-09-01 — Portal-IP: alle Adapter, virtuelle warnen

- docker/VPN/utun nicht verstecken, Warnung + Bestätigung
- [`docs/plan-portal-lan-isolation.md`](docs/plan-portal-lan-isolation.md) §9.1
- Als Nächstes: Entscheidungen nacheinander

## 2026-09-01 — Custom-TLS ohne Prefixes bis Portal

- TLS-Umbau: Custom bleibt ein FQDN wie heute; staff./portal. nur Betreiberzone
- Zwei-Namen-PEM erst bei Portal-Aktivierung; Staff-FQDN bleibt, Prefix-Vorschlag `portal.`
- Custom-Portal: A-Record auf Portal-IP, kein CNAME auf Staff
- [`docs/plan-portal-lan-isolation.md`](docs/plan-portal-lan-isolation.md) §5.2
- Als Nächstes: Entscheidungen nacheinander

## 2026-09-01 — Portal-Allowlist nur Caddy

- v1: Positivliste nur am Proxy; App-Origin-Gate später
- [`docs/plan-portal-lan-isolation.md`](docs/plan-portal-lan-isolation.md) §6.2
- Als Nächstes: Custom-TLS-Namen (staff./portal. unter eigener Domain)

## 2026-09-01 — Portal-Vorschau auf staff.

- `https://staff.<raum>/portal` bleibt dauerhaft interne Vorschau
- Patienteneingang nach Aktivierung nur `https://portal.<raum>`
- [`docs/plan-portal-lan-isolation.md`](docs/plan-portal-lan-isolation.md) §1, §6.2, §8.1
- Als Nächstes: Entscheidungen nacheinander (App-Origin-Gate als Nächstes)

## 2026-09-01 — Portal TLS zuerst

- Vorbereitung: TLS-Stack zuerst auf Wildcard + staff./portal.; unabhängig von F1
- Ein Challenge-CNAME am Installationsraum; Portal-A erst bei Aktivierung, kein Extra-Renew
- [`docs/plan-portal-lan-isolation.md`](docs/plan-portal-lan-isolation.md) §5.2, §13
- Als Nächstes: unverändert Recherche, noch kein Produktumbau

## 2026-09-01 — Portal F1 präzisiert

- F1 = nachweisbar fail-closed erreichbar nur aus vorgesehenen Segmenten (Win/mac)
- Compose-Host-IP laut Spec, auf Desktop keine Isolationsgrenze; Firewall + externer Scan Pflicht
- [`docs/plan-portal-lan-isolation.md`](docs/plan-portal-lan-isolation.md) §6.3
- Als Nächstes: unverändert Recherche, noch kein Produktumbau

## 2026-09-01 — Portal Same-NIC festgehalten

- Same-NIC nach Bestätigung + dauerhafter Warnung erlaubt (Demos / eine NIC)
- Keine Isolationszusage; Manager sieht fremdes Routing nicht
- [`docs/plan-portal-lan-isolation.md`](docs/plan-portal-lan-isolation.md) §1, §8.1, §11
- Als Nächstes: unverändert Recherche, noch kein Produktumbau

## 2026-09-01 — Portal vs. Staff-URLs (Recherche)

- Brainstorming: [`docs/plan-portal-lan-isolation.md`](docs/plan-portal-lan-isolation.md)
- Als Nächstes: Prompt/Best-Practice entscheiden, noch kein Produktumbau

## 2026-09-01 — Ops-Storage-Text

- Ordner anlegen/ändern nur im Manager; Status = ob die App den Host-Ordner erreicht
- Als Nächstes: unverändert Release-Cutover

## 2026-09-01 — PIN-Feld nach Fehlversuch

- Login/PIN-Dialog: Feld leeren, Fokus zurück, Inhalt bei Fokus markieren
- Room-Panel: PIN nach fehlgeschlagenem Login ebenfalls leer
- Als Nächstes: unverändert Release-Cutover

## 2026-09-01 — PIN-Wechsel falsche aktuelle PIN

- Falsche aktuelle MFA/OPS-PIN: 400 statt 401, Staff-Session bleibt
- OpenAPI: `auth.yaml` + `generate:api` (Typen/Bundle)
- Als Nächstes: unverändert Release-Cutover

## 2026-09-01 — Stack 0.4.0

- Minor: Root/App/UI/Setup/Sandbox/Packages `0.4.0`; Manager bleibt `0.3.0`
- Als Nächstes: Release-Cutover (Geräte einmal neu koppeln)

## 2026-09-01 — Docs Ist nach Device-Authorizations

- `apis.md` / `flows.md`: Panel-PIN außen+innen; Grant statt Staff-Session
- `realtime.md`: Presence löscht kein Pairing; Poll schreibt Grant
- `backup.md` / `delivery.md` / `system.md`: Restore leer, Update kopiert, Tagesreset unangetastet
- Als Nächstes: unverändert Release-Cutover

## 2026-09-01 — Device-Authorizations OpenAPI-Text

- GET/Revoke `device-authorizations`: YAML-Summary erwähnt Panels (Schnitt-3-Ist)
- Als Nächstes: unverändert Release-Cutover

## 2026-09-01 — Device-Authorizations Schnitt 3

- Room-Panels: PIN-Enrollment (außen+innen), Cookie 365d, Auth über `device_authorizations`
- SSE ohne Absolute-Timer/`refreshSession`; Ping prüft Grant + Raum/Placement
- Group-Revoke: Raum/Placement/PIN-Wechsel alle Panels; Relogin-Hotspot = diese ID
- MFA-Liste enthält Panels (Raum, Placement, `createdAt`); IP-Cap und Blind-Auto-Login ohne PIN entfernt
- Panel-SSE: Ping schreibt `session-revoked` wie TV, dann Stream zu
- Als Nächstes: Release (siehe `things-to-do-before-release.md` Enrollment-Hinweis)

## 2026-09-01 — Device-Authorizations Schnitt 2

- TV/Terminal-Auth liest `device_authorizations`; Device-Sessions aus Staff-Manager entfernt
- Pairing: Confirm nur Registry; Replace beim Poll; Cookie Max-Age 365d gleitet
- Poll nach Confirm ignoriert Pairing-TTL (nur unbestätigt expired)
- SSE writeHead Set-Cookie; Ping prüft Revoke
- MFA-Liste + Entkoppeln in Quicksettings; nach Confirm warten auf Poll-Grant
- 403 startet kein Re-Pair
- `database-device-authorizations.ts` leicht gestrafft
- Als Nächstes: Schnitt 3 Room-Panels

## 2026-09-01 — Device-Authorizations Schnitt 1

- Tabelle `device_authorizations` in Baseline; DB-Funktionen; Maintenance-Import
- Update-Cutover kopiert aus Aside via `:8082`; Restore ohne Hook
- Dev-Volume/SQLite neu anlegen (nicht live)
- Als Nächstes: Schnitt 2 TV/Terminal-Auth

## 2026-09-01 — Device-Authorizations (Plan nachgezogen)

- Nicht live: Schema in Baseline, lokale Dev-DB neu initialisieren
- Copy: Setup liest Aside, Maintenance `:8082` schreibt; kein cp auf WAL
- Confirmed-Pairing nur Poll-Grace, nicht Pairing-`expiresAtMs`

## 2026-09-01 — Device-Authorizations (Plan-Review)

- Review gegen Ist-Code; Canvas: plan-device-authorizations-review
- Kein P0. Vor Code drei P1: Poll-only INSERT (Unique), Cookie = Sliding Max-Age, Copy-Flag nur Update-Cutover
- P2: SSE-Hijack Set-Cookie; PIN-Reset alle Panels + OpenAPI; Client 403 ≠ Re-Pair

## 2026-09-01 — Device-Authorizations (Plan reduziert)

- Vertrag: [`docs/plan-device-authorizations.md`](docs/plan-device-authorizations.md)
- Gestrichen: Snapshot-Feld, Renew-Endpoint, Dual-Presence, In-Process-Event, 5 Schnitte, Service-Schicht
- Cookie rollt an normalen Responses + SSE-Eröffnung (nicht am Ping)
- Update kopiert aktive Zeilen aus alter SQLite; Restore/Tagesreset nicht
- Gestohlenes Cookie gilt bis MFA-Widerruf (LAN/TLS bewusst)
- Schnitte: 1 Schema → 2 TV/Terminal + MFA-Liste → 3 Panels + Aufräumen

## 2026-09-01 — Device-Pairing / Sleep (Logs)

- Logs: TV 401 nach Wake, Terminal Heartbeats overnight ~16–34 min 200 → Asymmetrie Idle-Refresh, nicht „Terminal überlebt Deep-Sleep >2h“

## 2026-08-31 — Architecture i18n.md + `_sources/` entfernt

- Patienten- vs. Staff-Locales, Domain-SSOT, Beitragsregeln (Ist)
- Alle Architecture-Themenseiten 1–6 ausgearbeitet
- `docs/architecture/_sources/` gelöscht (Inhalt übernommen)

## 2026-08-31 — Architecture documents.md

- Sandbox-API/Container/Pipeline, Anamnese-Template-Konvention (Ist)

## 2026-08-31 — Bugbot realtime SSE

- Connection-Budget MFA 2 SSE/Tab; HTTP/1.1 vs TLS/h2
- Presence: streamConnected sofort, status erst nach 5s/10s; TV-Liveness = Queue-SSE
- Outbox-Namen `DocumentPreviewRequested` / `DocumentRenamed`
- MFA Queue Stale-Fallback 3s/25s/5s

## 2026-08-31 — Architecture realtime.md

- SSE-Streams, Presence≠Pairing, REST-Rest, Outbox-Audit (Ist)
- `_sources/realtime-streams.md` + `events.md` → Stubs
- Offen: documents · i18n

## 2026-08-31 — Architecture apis.md Codegen

- §2: `generate:api` Schritte, Outputs, Drift-Checks, Workflow YAML→Handler→ACL

## 2026-08-31 — Architecture apis.md

- Rollenmatrix, Auth-Mechanismen, Raum-Panel, Portal-Session, Settings-PATCH-Split (Ist)
- Portal nicht als Fake-`ClientRole`; ACL-SoT = `route-access-rules.ts`
- Offen: realtime · documents · i18n

## 2026-08-31 — Bugbot system+domain

- Aufrufziel: Check-in setzt oft schon `targetLocation`; Call = Body → Snapshot (kein Quicksettings/`defaultCallTarget`-Pfad)
- system.md Domänen-Kurztext angepasst

## 2026-08-31 — Architecture domain.md

- Begriffe, Invarianten, Aufrufziel, Entitäten, Catalog-Wahrheit (Ist)
- `_sources/domain-model.md` + `catalog-source-of-truth.md` → Stubs
- Offen: apis · realtime · documents · i18n

## 2026-08-31 — Architecture Stil Ist-Sprache

- `system.md`: kein „Zielbild“; WLAN klar Nicht-Produkt; README-Stilregel
- Abgleich war inhaltlich am Code (Routes/Day-Lifecycle); Formulierungen aus alter Overview-Rhetorik bereinigt

## 2026-08-31 — Architecture system.md

- Stack, Komponenten, Code-Schnitt, Persistenz/Tagesreset in `architecture/system.md`
- `_sources/overview.md` → Stub
- Offen: domain · apis · realtime · documents · i18n

## 2026-08-31 — Architecture-Struktur (Skelett)

- Neuer Faden: system · domain · apis · realtime · documents · i18n
- Alte Dateien → `docs/architecture/_sources/`
- Links in README/product/flows/archive/Code-Kommentaren angepasst
- Nächster Schritt: thematisch füllen (vermutlich `system.md` zuerst)

## 2026-08-31 — Ops `_sources/` entfernt

- Stubs gelöscht; History bleibt in Git
- delivery.md / ops README: `_sources`-Verweise weg

## 2026-08-31 — Bugbot Ops-Nachzug

- runtime §3: korrekte `docker-compose.tls-lab*.yml`-Namen
- runtime §8: Support-Fallback inkl. Proxy/TLS-Overlays
- tls §6/§9: Lab-Dateinamen angeglichen

## 2026-08-31 — Ops integrations.md ausgearbeitet

- WLAN/Captive-Grenze, SMS/WhatsApp, CSV vs. PVS, eGK Discovery; keine `roadmap.md`
- `_sources/integrations.md` → Stub
- Ops-Lifecycle-Dokumente damit inhaltlich durch (`delivery`, `runtime`, `tls`, `backup`, `integrations`)

## 2026-08-31 — Ops runtime.md ausgearbeitet

- Services, Compose-Stacking, Persistenz, Ports, Tagesbetrieb, Proxy-Hinweis, CLI-Fallback
- `_sources/deployment-docker.md` → Stub
- Offen Ops: `integrations.md`

## 2026-08-31 — Ops backup.md ausgearbeitet

- Prinzip, `.pfbackup`, Klassifikation, Manager-Flows, TLS-Grenze, Cutover mit Update
- Manager-README: Backup-Routen von „env-Backup“ auf `.pfbackup` korrigiert
- `_sources/settings-backup-classification.md` → Stub (übernommen)
- Offen Ops: `runtime.md`, `integrations.md`

## 2026-08-31 — Ops tls §8–10 fertig

- §8 Backup/Sidecar-Gate, §9 Lab-Abgrenzung, §10 Pläne vs. Ops-Ist
- `operations/tls.md` damit inhaltlich durch; nächstes Ops: runtime / backup / integrations

## 2026-08-31 — tls §7.2 Renew-Zeitachse

- Caddy ~⅓ / ~30 Tage vor LE-Ablauf; UI-Warnung 21 Tage; Custom ohne Auto-Renew

## 2026-08-31 — Ops tls §7 Betrieb nach Cutover

- Canonical/Geräte/301, Renew (21 Tage), Fehlerklassen, Fallstricke in `operations/tls.md`
- Offen: §8 Backup-Grenze, §9 Lab, §10 Pläne

## 2026-08-31 — Ops tls §6 Compose/State

- Overlays, Wann `proxy-tls`, Image/Ports, `state/tls/`, generiertes Caddyfile, Fallstricke
- Offen: §7 Betrieb nach Cutover, §8 Backup-Grenze, Lab, Pläne

## 2026-08-31 — TLS-Doku Deep-Review Fixes

- §2/§3/§4/§5: Proxy-Persistenz-Gate für `prepare`; Reset vor/nach Cutover; Apply-Fail ≠ Repair; Skelett-Verweis weg
- Offen: §6 Compose/State …

## 2026-08-31 — TLS-Doku Deep-Review (§1–5)

Befunde (Code-backed, gefixt):

- high: Wizard `prepare` braucht persistierten Proxy — Checkbox allein reicht nicht (`PROXY_ENABLED` erst bei Apply)
- medium: `tls/reset` nach Cutover ≠ Abbruch (custom sperrt; managed re-issue gleiche ID)
- medium: Apply-Fail → Retry `apply`, nicht `repair` (`applyReady` bleibt)
- low: §2 verweist noch auf „§4–5 Skelett“
- Residual: §6–8 fehlen → Compose-State, Betrieb nach Cutover, Backup-Grenze

## 2026-08-31 — Ops tls §5 Setup-API

- Routen, TlsStatus, Fehlerklassen, Network-Abgrenzung in `operations/tls.md`
- Offen: §6 Compose/State, §7 Betrieb, §8 Backup-Grenze, Lab

## 2026-08-31 — Bugbot-Fixes Ops-Doku

- delivery: Sidecar-Dateinamen, Compose-Projektname Default, pfupdate-Template-Namen
- tls §1: Einmal-Token auch auf Disk (`state/tls/operator-token`)

## 2026-08-31 — Ops tls §4 UI-Strecken

- Assistent HTTPS-Phasen, Netzwerk Resume/Cutover, managed vs custom in `operations/tls.md`
- Offen: §5 Setup-API / TlsStatus

## 2026-08-31 — Ops tls §3 Proxy

- HTTP-Proxy als TLS-Voraussetzung, Env, Compose-Stacking, Network-Save-Guard in `operations/tls.md`
- Offen: §4 Aktivierungsstrecken (Wizard + Netzwerk)

## 2026-08-31 — Ops tls §1–2

- Produktmodell (Hostname→private IPv4, DNS-01/custom, Zone `lan.notaus.de`) + Rollen in `operations/tls.md`
- Am Code: `TLS_OPERATOR_ZONE_DEFAULT`, `tls-identity.ts` Namensmodi
- Offen: §3 Proxy-Voraussetzung, §4 UI-Strecken, …

## 2026-08-31 — Ops delivery §5 Update

- `.pfupdate` Inspect/Apply, Kompatibilität, Phasen, Fallstricke in `operations/delivery.md`
- delivery-Kapitel damit inhaltlich durch; nächstes Ops-Thema z. B. runtime oder tls

## 2026-08-31 — Ops delivery §4 Erstinstall

- Voraussetzungen, Install-Home, Wizard 8 Schritte, CLI/Dev, Fallstricke in `operations/delivery.md`
- Manager-README: Wizard + Backup-Hinweis an Ist angeglichen
- Offen: §5 Update-Phasen

## 2026-08-31 — Ops delivery §6 Build

- Pipelines Erstinstall `.tar.gz`, `.pfupdate`, Manager-DMG + Checkliste in `operations/delivery.md`
- Offen: §4 Erstinstall-Wizard-Ist, §5 Update-Phasen

## 2026-08-31 — Ops delivery §1–3

- Prinzip, Versionen, Artefakte/Images in `operations/delivery.md` ausgearbeitet (Code-Abgleich pfupdate/release-scripts)
- Architektur nur Verweis, keine parallele Release-Doku
- Offen: §4 Erstinstall (Wizard-Ist), §5 Update, §6 Build kürzen

## 2026-08-31 — TLS = Produkt (Doku)

- Kunden-Test-Vorbehalt für TLS/443 aus README, product, flows, architecture, Manager entfernt
- Ops-Einstieg: `operations/tls.md`; Plan-Statuszeilen auf Produkt/Quelle umgestellt
- Weiterhin nicht Produkt: eGK, PVS-Adapter, Captive/Gateway, Internet-Portal, Manager-Auto-Update

## 2026-08-31 — Ops TLS-Skelett

- `docs/operations/tls.md` angelegt (Produkt-LAN-TLS); Lifecycle-Schritt 4 zeigt darauf
- Quellen: plan-proxy-tls\*.md + Setup/Manager-Code; Lab bleibt archive/tls-lab
- runtime §7 auf Verweis reduziert

## 2026-08-31 — Ops-Doku Skelett

- `docs/operations/`: README Lifecycle + Skelette `delivery` / `runtime` / `backup` / `integrations`
- Alte Langfassungen nach `docs/operations/_sources/` (Einarbeitung Abschnitt für Abschnitt)
- Nächster Schritt: ersten Abschnitt aus `_sources` füllen (vermutlich delivery § Prinzip/Versionen)

## 2026-08-31 — Docs: architecture/ + operations/

- `docs/architecture/`: overview, apis, realtime, domain, events, sandbox, catalog, i18n, anamnese
- `docs/operations/`: delivery, deployment-docker, settings-backup, integrations
- Produkt/Flows/Pläne bleiben auf `docs/`-Root; `plan-backup-v2` unberührt
- Verweise in README, Manager, Code-Kommentaren nachgezogen

## 2026-08-31 — Doku aufräumen

- Mock `docs/mocks/lan-tls-wizard/` entfernt (TLS ist im Manager)
- `docs/tls-lab.md` → `docs/archive/tls-lab.md` (Lab-Compose/Smoke bleiben)
- Archiv-Ballast gelöscht: todo-history, flow-routing-\*, plan-proxy-container
- `plan-backup-v2.md` unberührt (stale Mock-Verweis bewusst)

## 2026-08-31 — TLS-Placeholder Seidel → Muster

- TLS-UI-Placeholders, Tests, Docs/Mock: `seidel` → `muster` (kein Praxis-Seed betroffen)

## 2026-09-01 — nachfragen

MFA über Nacht/Standby: Hat der Banner „Neuen Tag starten“ ohne Refresh gegriffen? (Rechner geschlafen, Tab blieb offen und im Fokus.)

## 2026-08-31 — Beta-Review SMS/WhatsApp Rückholen

- Kontext + Review-Prompt für E2E-Feature „Abwesend / Rückholen / SMS & WhatsApp“ zusammengestellt
- Findings 2–12 geprüft: 2–7,9–10,12 bestätigt; 8 optional (kein Fix); 11 Dev-only (kein Fix)
- Fixes umgesetzt: WA-Parser (#2), fallbackFrom OpenAPI (#3), BUSINESS_TZ SMS-Zeit (#4), callbackPhone behalten (#5), 2. Recall → 409 (#6), 8s Timeout (#7), Ops-UI (#9/#10), Smoke-Telefon (#12)
- Nachzug: #6 Guard auf aktives returnUntil (nicht nur Status); WA-Sprache Draft leer (#10); TimeoutError+Body → SEVEN\_\*\_TIMEOUT (#7)

## 2026-08-31 — Re-Review E2E Kern (Defect-only)

- Canvas: recall-messaging-beta-review
- **Blocker B1:** SMS-Text nutzt visitId (UUID) statt formatTicketCode(lane, number)
- Major: WA ohne Template-Parameter; Smoke unzureichend für Live-Beta
- Minor: hasMobilePhone+identityRef; WA-Fallback maskiert SMS-Fehler
- Info: Klartext-Credentials bewusst; MFA ohne notifyChannel whatsapp (bekannt)
- Verdict: SMS-Kern nach B1-Fix beta-fähig; WA weiter API-only
- Nachzug umgesetzt: B1 Ticket-Code in SMS/WA; WA components {{1}} Zeit {{2}} Ticket; Smoke +409/no-phone/retry; hasMobilePhone ohne identityRef; SMS-error bei Dual-Fail
