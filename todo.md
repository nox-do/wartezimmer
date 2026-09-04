# Arbeitsstand (intern)

Stand: 2026-09-04

## 2026-09-04 — Slice-1 Fixes: Meta-Review (Auto)

- Verdict: Fixes zu P1-01/02 und OpenAPI-Drifts ok; keine Regression im Diff
- S1-P2-02 Pairing-DoS: Residual ok, aber schon Rate-Limit + `DEVICE_PAIRING_MAX_PENDING=50`
- Offen: PORTAL_DISABLED-403 OpenAPI, Captive/Health, Pairing-Start-DoS (Residual)
- Testlücke: kein Test „fremde documentId → kein Sandbox-Purge“
- MFA-Discard (`documents-routes`) noch purge-vor-Check — Slice Documents, nicht Slice-1-Regression

## 2026-09-04 — Slice-1 Fixes (Portal/Public Review)

- Patient-Delete: Ownership/Status **vor** Sandbox-Purge (`assertPatientDocumentDiscardable`)
- Room-Panel: außen **ohne** PIN (Domain-Policy); innen PIN; Docs `apis.md`/`flows.md` + UI Login
- OpenAPI: `practice/profile` + `patient-locales` → `security: []`; resolve-ticket **429**; forms **503**; PIN optional
- Portal `/sessions/me`: **kein** `checkinPhone` mehr; Anamnese Tippen; kein Server-Prefill aus Check-in
- Bewusst offen: Pairing-Start-DoS (Residual); PORTAL_DISABLED-403 OpenAPI; Captive/Health
- Generate: `npm run generate:api`

## 2026-09-04 — API/OpenAPI Review (Slice-Plan)

- Scope: Inkonsistenzen, Duplikate, tote Pfade, Security — OpenAPI + Handler + ACL + `apis.md`
- Fläche: ~80 `/api/v1`-Routen (ACL), ~78 OpenAPI-Ops; Drift-Checks grün; SSE bewusst nur ACL
- Auth-Schicht (`client-auth`/ACL) schon stichprobenartig reviewed; Residual Portal-Auth in `session-auth.ts`
- Slice 1 (Public/Portal): Prompt an anderen Bot; Findings später hier reviewen — kein Auto-Fix

## 2026-09-04 — Reassign nach Hop-Complete: so lassen (A)

- Reassign = temporärer Raum im Hop; Continue/Call-next folgt Journey (Lesart B)
- Kein Flag-Clear, kein Abandon; Kommentar an `reassignVisitRoom` ergänzt
- Routing-Entscheidungsrunde P0–P2 damit durch (P3 optional Aufräumen)

## 2026-09-04 — Template-Lock nur active Journeys (Option A)

- Count/Lock: `journey_template_id` + `journey_state = 'active'` + nicht-terminal
- Abandoned (z. B. nach Redirect) sperrt Template-Edit nicht; ID darf für Historie bleiben

## 2026-09-04 — done mid-Journey → abandoned (Option A)

- Terminales `done` bei noch `journeyState: active` → `abandoned` + Event (wie Cancel)
- Advance bei `completedWhen: done` + Folgeschritt unverändert; normales Journey-Ende → `completed`

## 2026-09-04 — Lizenz Runtime: bewusst fail-open (Stub)

- Prod: ohne `COMPLEX_ROUTING_LICENSED=true` → Manager Complex nicht wählbar (`NODE_ENV=production`)
- Freischalten derzeit nur per `.env` (+ App-Neustart); echte Lizenz-Infra offen
- Runtime fail-open (Mode schon complex) bewusst ok bis Lizenz-Entscheidung

## 2026-09-04 — Setup Mode-Fallback gestrichen

- `setRoutingMode` nur noch Maintenance-API (:8082) inkl. Catalog-Sync
- SQLite-Direktwrite + Unauthorized-Fallback entfernt (Drift Mode vs Catalog)
- Read-Pfad darf weiter aus DB lesen wenn API down

## 2026-09-04 — Redirect vs Reassign: bewusst offen + Kommentar

- Entscheidung: Arztpraxis braucht Redirect selten; Reassign bleibt „Raum im Hop“
- Redirect ≠ Topic-Wechsel (Supersede); Core hat Redirect, Host/MFA nicht
- Marker: Kommentar an `reassignVisitRoom` + Pointer in queue-visit-transitions + routing.md §7
- Kein Host-Redirect verdrahtet (nur Stolperstein für später)

## 2026-09-04 — Entscheidung: return_to_waiting = Lesart B

- Nach Hop-Complete + Zurück-in-WZ: Schritt bleibt **erledigt** (`journeyStepCompletedAt` behalten)
- MFA-Intent: Aufgabe fertig → kurz WZ → später neue Aktion/Ziel (Continue / Call-next)
- P0 „Flag clearen“ ist **kein Fix** (wäre falsch); heutiges Core-Verhalten passt
- Residual: MFA-Button „Aufrufen“ darf nicht wie „nochmal gleicher Raum“ wirken — Advance ist gewollt; UX/Label ggf. nachziehen
- Offen unverändert: done→abandon, Lizenz Runtime, Template-Lock abandoned, Reassign nach Hop-Complete

## 2026-09-04 — Routing: sichere Fixes (ohne Semantik-Risiko)

- `callVisit`: nach `start_next` nur `call` wenn `canTransition`; sonst Status des Hops; beide Schritte in `runInTransaction`
- `JOURNEY_TEMPLATE_LOCKED` → HTTP 409
- `validateCatalogIntegrity`: nur **aktive** Journey-Templates
- Check-in/Supersede: Step-`instructionText` über `stepToVisitPatch`
- Bewusst offen (Produktentscheid): done→abandon, Lizenz Runtime fail-open, Template-Lock/Reassign-nach-Complete

## 2026-09-04 — Routing-Findings Verification (Code-Beleg)

- Alle P0–P3 aus Review **bestätigt** am Code (kein Widerlegen)
- P0 Präzisierung: Skip nur wenn `journeyStepCompletedAt` schon gesetzt (nach Hop-Complete), nicht bei purem Recall vor Complete
- Template-Lock nach Redirect: Visit bleibt open + `journey_template_id` bleibt → Lock; Cancel terminal → kein Lock
- Offen: Fixes priorisieren mit User (kein Auto-Umbau)

## 2026-09-04 — Routing-Review (fachlich + Best Practice)

- Verdict fachlich: Kernpfade simple/complex + Check-in-Projektion solide; Journey-Ops am MFA unvollständig/fehleranfällig
- P0/P1: `return_to_waiting` lässt `journeyStepCompletedAt` stehen → nächster Call überspringt Hop; `callVisit` chained start_next+call blind
- P1: kein Host-Redirect (nur Reassign); Setup Mode-Fallback ohne Catalog-Sync; Lizenz nur am Mode-Wechsel, Runtime fail-open; compose default NODE_ENV=development
- P2: simple lässt journey_* aktiv → Integrity kann Settings-Sync hart abbrechen; Reassign nach Hop-Complete inkohärent; done mid-journey ohne abandon; Template-Lock zählt abandoned; JOURNEY_TEMPLATE_LOCKED → 400 statt 409
- Offen: Fixes priorisieren mit User (kein Auto-Umbau)

## 2026-09-04 — Routing-System (Review + Doku)

- Scope: Domänen-Routing (`simple`/`complex`), Catalog-Rules, Journeys, Redirect, Mode-/Lizenz-Guards — nicht HTTP-Routes
- Neu: `docs/architecture/routing.md` (funktional + nichtfunktional, Code-Karte, Drift-Risiken)
- Verlinkt: architecture README/domain/system/apis, `packages/flow-core/README.md`
- Cleanup: veralteter „Paket 5“-Kommentar an `isSimpleRoutingMode`
- Offen beobachtet (nur Doku, kein Fix): stale `journey_*` nach Wechsel auf simple; `routingSimulator`-Flag ohne Produktfläche

## 2026-09-04 — Auth Cleanup (Captive-Doku + Session/Grants)

- Captive: Docs/OpenAPI/Kommentar als Adapter-Hook (kein Gateway); Surface unverändert
- `refreshSession` entfernt; Staff-Manager nur noch `StaffSession`
- Typen: `DeviceGrant` / `RoomPanelGrant` ohne Fake-TTL; Barrel `session-grants.ts` (+ `session-grant-types.ts`)
- Alt: `staff-session-auth.ts` / `staff-session-types.ts` gelöscht; Imports umgestellt
- Bugbot (uncommitted + Auth-Kontext): keine Findings

## 2026-09-04 — Review app/src/auth (stichprobenartig)

- Scope: `client-auth`, ACL, PIN, Staff-Session-Manager, Cookies/Slots; Kontext Docs `apis.md` + Wiring `app.ts`
- Gut: fail-closed ACL + Drift-Check; Cookie-Slots + `x-client-role`; CSRF Origin bei Cookie-Mutationen; Prod-Guards; Device-Grants vs. In-Memory Staff getrennt
- Cleanup erledigt: Fake-TTL, `refreshSession`, Barrel-Rename, Captive-Doku
- Residual: Cookie-Helfer heißen weiter `*SessionCookie`; Portal-Auth weiter in `routes/session-auth.ts`

## 2026-09-04 — Leere Ordner / Reste (Scan + Cleanup)

- Scope: Repo ohne `node_modules`, `dist`, `.svelte-kit`, `build`, `.tmp`
- Entfernt (waren leer, nicht in Git):
  - `packages/flow-core/src/ui/`
  - `ui/scripts/`
  - `ui/src/lib/mfa/generated/`
  - `ui/src/lib/portal/anamnese-layouts/`
  - `ui/src/lib/terminal/name-keyboard/`
  - `ui/src/routes/mfa/documents/[ticketId]/`
  - `ui/src/routes/ops/outbox/`
  - `ui/static/esheep/`
- Bewusst belassen: `state/` (lokal; `.gitignore` hat `state/tls/`)

## 2026-09-04 — visit-queue-bridge.test.ts Types

- `panels` + `journeySettings` in `sampleSettings`; Session-Stubs `*ByVisitStmt` (Ticket→Visit Rename)
- Gleiche Stub-Rename in: `room-panel-queue-snapshot`, `tv-queue-snapshot`, `flow-core-checkin`, `terminal-assist-pending`, `queue-routes` Tests

## 2026-09-04 — Logging-Policy + Pino-Root

- Policy: `docs/architecture/logging.md` (wer nutzt `request.log` / `createModuleLogger` / sandbox-log / console)
- `buildFastifyLoggerOptions` liefert jetzt den gemeinsamen Pino-Root; `createModuleLogger` für Background
- App-`createLogger` (console-Wrapper) entfernt; Caller auf Pino-Konvention `(obj, msg)` umgestellt
- Review-Lücken: paralleler App-Logger war die einzige echte Abweichung — behoben; CLI/UI/sandbox-bootstrap ok
- Manager Logs-Dropdown: `gateway` → `proxy` (Container-Liste)

## 2026-09-04 — Cleanup: openNDS-Gateway / Auth-Bridge

- Entfernt: `gateway/` Lab-Stack, `docker-compose.gateway*.yml`, `app/.../gateway-auth-bridge-client.ts`
- App: `POST .../captive-authorize` stubbt immer `wlanAuthorized: false` (Hook für spätere Adapter)
- Compose/App-Env: `GATEWAY_AUTH_BRIDGE_URL` raus; Setup Compose startet Gateway nie mehr; CLI ohne Gast-WLAN-Fragen
- pfupdate: `--with-gateway` entfernt; Manager-Packaging ohne Gateway-Compose
- Docs: integrations/runtime/delivery/system/archive + README angepasst
- Bewusst belassen: `AUTH_KEY_CAPTIVE`, Setup-API-`gateway`-Plan-Felder (Manager `DISABLED_GATEWAY_PLAN`), Legacy-pfupdate-Validierung für alte Pakete

## 2026-09-04 — Docker-Review (Doku-Abgleich, noch keine Fixes)

- Scope: Dockerfiles + Compose (+ `.dockerignore`) vs. aktuelle Docker Best Practices
- Schon gut: Multi-Stage, SBOM/Provenance, Secret-Required-Env, Log-Rotation, Digest-Pins (Proxy-Runtime/TLS-Lab), Delivery-Overlays
- Offen / Nachlässig (Priorität):
  1. App/Sandbox laufen als root — widerspricht eigener Isolation-Plan-Zusage (Non-Root / `no-new-privileges` / cap_drop)
  2. `.dockerignore` lässt `manager/` (~300MB) + `lab/` im Build-Context
  3. Base-Images `node:22-alpine` / `debian:bookworm-slim` / `caddy:…-builder` nicht digest-gepinnt
  4. Gateway: `privileged: true` + `network_mode: host` (+ redundantes `cap_add`); Default-FAS-Key
  5. Healthchecks ohne `start_period`; Proxy ohne Healthcheck; Delivery `pull_policy: never` nur am Proxy
  6. Kein `# syntax=docker/dockerfile:1`, keine npm BuildKit-Cache-Mounts, keine Resource-Limits
- Nächster Schritt: mit User priorisieren, was gefixt wird (kein Auto-Umbau)

## 2026-09-04 — App Crash: OpenAPI in Compose-Dev

- Ursache: Compose `NODE_ENV=development` → Docs an, Swagger im Image fehlt → Restart-Loop
- Fix: `OPENAPI_DOCS_ENABLED` default `false` in `docker-compose.yml`; registerOpenApiDocs soft-fail ohne Packages/Bundle

## 2026-09-04 — Build-Strip / OpenAPI nur Dev

- OpenAPI: Swagger-Deps → app `devDependencies`; dynamic import; kein `openapi/bundle.json` im Runtime-Image
- `removeComments: true` in `tsconfig.base.json`; Sandbox `exclude` `*.test.ts`
- Strip: zusätzlich `.css.map`, `*.test.js` / `*.test.mjs`
- Docs: apis.md / system.md — Swagger nur Dev/local

## 2026-09-04 — Build-Artefakte / Strip / Image-Inhalt (Analyse)

- Strip-Script im Docker: entfernt `.js.map`, `.d.ts(.map)`, `.ts/.tsx`, `src`/`test`; UI-Vite: minifiziert, keine Maps (Ist)
- Server: `tsc` lesbar, kein Minify, `removeComments` nicht gesetzt; Packages `declarationMap: false` (lokale `.d.ts.map` oft Altlast)
- Gaps: Strip kennt kein `.css.map` / `*.test.js`; Sandbox-tsconfig excludet Tests nicht; `test-runtime-mocks.js` landet in app-Image; `openapi/bundle.json` (~850KB) + swagger-Deps trotz Docs-off in Prod
- node_modules nach prune: Vendor-`.map` bleiben (z. B. tldts) — optional nachsäubern
- RE ohne Obfuscation: keine Source Maps (gut); UI minifiziert (gut); Backend-JS + OpenAPI-Bundle = größte Lesbarkeit

## 2026-09-04 — Docker-Findings Schnitte 1–3

- `.dockerignore`: manager/** (außer package.json), lab, .github, .vscode, licenses; Context-Probe OK (~6MB statt Manager-Ballast)
- Dockerfiles: `# syntax=docker/dockerfile:1`; app/sandbox `COPY manager/package.json`
- Delivery: `pull_policy: never` auf app/sandbox/gateway; Proxy-Healthcheck (dev+delivery) via wget :80
- Docs: delivery.md / tls.md pull_policy-Hinweis angepasst
- Offen bleibt: Non-Root/ClamAV, Digest-Pins Node, Cache-Mounts, Gateway-Privileges

## 2026-09-04 — Docker-Findings Bewertung (ohne Non-Root)

Bewertung Sinn/Aufwand (Non-Root/ClamAV separat):

| Finding | Urteil | Warum |
| --- | --- | --- |
| `.dockerignore` manager/lab/.github/dist-Reste | **ja, günstig** | Context ~300MB Manager unnötig; `npm ci` braucht höchstens `manager/package.json` (wie setup) |
| `# syntax=docker/dockerfile:1` | **ja, trivial** | Doku-Standard, schaltet moderne Frontend-Features frei |
| Digest-Pin `node`/`debian`/`builder` | **teils** | Proxy-Runtime schon gepinnt + Prozess in pfupdate; Node bei jedem Release `--pull` reicht oft; volle Digests = Pflege wie Proxy |
| `pull_policy: never` app/sandbox | **optional konsistent** | Kritisch war Proxy (Hub-Tag `caddy:…`); app/sandbox private Tags, Setup lädt via `docker load` |
| Healthcheck `start_period` | **niedrig** | Sandbox `/ready` liefert bei degraded trotzdem 200 — ClamAV-Kaltstart blockiert Compose nicht |
| Proxy-Healthcheck | **nice-to-have** | depends_on wartet nur auf app; Caddy-Fehlkonfig separat |
| Resource-Limits | **nein vorerst** | ClamAV speicherhungrig; Limits ohne Messung → OOM-Risiko auf Praxis-PCs |
| BuildKit npm-Cache-Mounts | **später / CI** | Dev-DX, kein Runtime-Gewinn; Workspace-Builds etwas fummelig |
| Gateway privileged/cap_add | **kein Produkt-Fix jetzt** | Lab/Captive; `cap_add` bei privileged redundant (Kosmetik); Root faktisch nötig |
| OPENNDS Default-Key | **klein, wenn Gateway an** | Setup setzt Secret; Compose-Default nur Fallback |
| Dev `NODE_ENV:-development` | **bewusst lassen** | Delivery ohne Override → Image `production`; Dev-Override steuert Auth/Logging lokal |
| PRACTICE_* nur in Dev-Compose | **Aufräumen optional** | Profil primär DB; Env-Fallback legacy |
| TLS-Lab Doppelkommentar | **trivial** | Copy-Paste |

Empfohlene erste Schnitte (wenn User will): dockerignore (+ ggf. `COPY manager/package.json`) → syntax-Directive → optional Proxy-Konsistenz/`pull_policy` → Rest zurückstellen.

- Sandbox/ClamAV (härtester Punkt): Alpine `clamav` = uid 100/gid 101; `node` = 1000. `/var/lib/clamav` + Log nur clamav-schreibbar. Node schreibt `freshclam-last-attempt.json` in denselben Pfad → reines `USER node` bricht. Bestehende `clamav_db`-Volumes oft root-owned nach bisherigem Betrieb → freshclam: „writable for UID 100 or GID 101“. Braucht Migration/Entrypoint-chown + User-Modell (gosu clamav für Tools / node+Gruppe / State-Datei auslagern)
- App: Named Volume `app_data` + Host-Binds `~/praxis-flow-exports|imports` (Host-UID ≠ 1000, Desktop/Linux). Setup-Utilities (`staff-pin-reset`, `app-data-volume`) mounten als root — nach UID-Wechsel Ownership-Vertrag nötig
- Gateway: Root faktisch nötig (iptables/opennds/dnsmasq/host net); Non-Root hier nicht sinnvoll als Erstes
- Proxy/Caddy: Binary hat `cap_net_bind_service`; Image-User leer (root) — eigener Schnitt, entkoppelt von App/Sandbox
- Fazit: nicht überall USER setzen; Reihenfolge App (Volume-Vertrag) → Sandbox (ClamAV-Modell) → Compose-Härtung; Gateway später/anders

## 2026-09-04 — plan-manager-https archiviert

- `docs/plan-manager-https.md` → `docs/archive/`; Verweise in `operations/tls.md`, `docs/README`, Installer-Cleanup
- Nächster TLS-Hebel unverändert: Portal-Isolation (`staff.`/`portal.`)

## 2026-09-04 — Review plan-manager-https

- Schnitte 1–3 erledigt (Gates in `tls-network-view-model`); Plan = UI-Drift-Vertrag, kein offener Bauplan
- Nächster TLS-Hebel: Portal-Isolation (`staff.`/`portal.`, Zwei-A, Wildcard) — widerspricht noch `plan-proxy-tls*`-Pilot „kein portal.“
- Ops-Ist: `operations/tls.md`; Aufräum-Plan archivierbar wie Device-Auth

## 2026-09-04 — Captive-Roadmap archiviert

- `docs/roadmap-captive-portal-adapters.md` → `docs/archive/`; Banner + Archive-README
- Genereller Verweis (Integrations/Flows/Product/Isolation): später erweiterbare schlanke Adapter-Liste (von uns) + Auswahl im Manager; nicht Portal-v1
- SoT-Grenze: `operations/integrations.md`

## 2026-09-04 — Device-Authorizations-Plan entfernt

- `docs/plan-device-authorizations.md` gelöscht (Schnitte 1–3 erledigt); Eintrag aus `docs/README.md`
- Ist: `architecture/apis.md` / `flows.md`; operativ: Release-Cutover in `things-to-do-before-release.md`
- Panel-PIN: Domain `roomPanelRequiresPin` = Auth-Ist (außen false / innen true) — Drift behoben 2026-09-04

## 2026-09-04 — DB-Hygiene-Plan abgeschlossen

- Plan entfernt (`docs/plan-db-layer-hygiene.md`): Schnitt 1–3 + Soft-Cut `waiting_room_full` erledigt
- Offen bewusst woanders: Disk-Docs nach Reset, Hard-Drop/Schema-Quellen, `BUSINESS_TZ`

## 2026-09-03 — DB-Schicht Review (app/src/shared/db)

- Review ohne Codefix: Reset mit FK OFF hinterlässt Waisen (host_state/sessions/docs)
- Timer vs. TX (Recall/Assist); Session-GET schreibt; Schema dreifach; waiting_room_full tot
- Canvas: db-layer-review
- Schnitt 1–3 + Soft-Cut erledigt (32d9410, ea2d51c, 159a377, 3aec562); Plan danach gelöscht

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

- `apis.md` / `flows.md`: Panel-PIN **innen**; außen ohne PIN (Domain-Policy; Code 2026-09-04 angeglichen)
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

- Vertrag war `docs/plan-device-authorizations.md` (2026-09-04 entfernt)
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
