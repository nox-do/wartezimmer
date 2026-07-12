# Praxis Flow Manager

Electron-Hülle für Host-Setup, Status und Wartung. Docker-Stack steuern (Start/Stop/Neustart), Container/Logs, `.env`-Backup, Erreichbarkeit (Poll) — alles über Setup-API + IPC.

## Dev starten

Vom Repo-Root:

```bash
npm run dev:manager
```

Die Dev-Scripts setzen `ELECTRON_RUN_AS_NODE` leer (`cross-env`, Windows/macOS/Linux). Manche IDE-Terminals setzen die Variable und würden Electron sonst wie plain Node starten.

Isolierte Install-Iteration (empfohlen für Wizard-Tests):

```bash
export PRAXIS_FLOW_HOME=/tmp/pf-dev-001
export PRAXIS_FLOW_COMPOSE_PROFILE=dev
npm run setup:reset -- --yes
npm run dev:manager
```

**macOS-Menü „Electron“:** Im Dev-Modus startet die generische `Electron.app`; der sichtbare Menüname kommt aus deren `Info.plist`, nicht aus `app.setName()`. `npm run dev:manager` patcht das lokal automatisch auf **Praxis Flow** (wird bei `npm install electron` zurückgesetzt). Dauerhaft korrekt erst nach Packaging mit `productName`.

## Architektur

- **Main:** startet `@praxis-flow/setup serve` als Child (Port `9190`, override via `SETUP_HOST_PORT`); alle Setup-API-Calls über IPC-Proxy (`setup-api.ts`, Allowlist `/api/setup/host/*`, nur `127.0.0.1`)
- **Preload:** CJS, `sandbox: true` — nur IPC, **kein `fetch`**
- **Renderer (Svelte 5):** Shell mit Health-Header + Tabs (Status / Netzwerk / Wartung / Assistent). Koordination über `manager-shell-state` (Sessions, Loading) und `createManagerAppController()` → `mount(App)` → `start()`. Browser-Handoff per `shell.openExternal`.

### Refresh / Poll

- **Full refresh** (Tab-Wechsel, Mutation): `fetchSetupStatus` + `fetchRuntimeHealth`
- **Runtime-Poll** alle **12s** (nicht im Wizard): nur `fetchRuntimeHealth` — aktualisiert Header und überlappt live Felder in `hostStatus` (Compose, Probes, Docker, …)
- Config-Felder (LAN-Kandidaten, Geräte-URLs, Ordner, …) kommen aus dem Full-Refresh

### Install-Wizard (Assistent)

1. Voraussetzungen (Docker, ggf. Release-Paket)
2. Netzwerk — LAN-IP wählen (`GET /network`)
3. Praxis — Anzeigename + Routing-Modus (`GET|POST /routing-mode`)
4. Gast-WLAN / Gateway (optional)
5. Import- & Export-Hostordner
6. Vorschau (`POST /plan`) — Geräte-URLs
7. Anwenden (`POST /apply`) + Abschluss (Probes, Link zu IT-Einstellungen / Status)

Ersteinrichtung ohne `.env` läuft fullscreen ohne Tabs; Re-Run eingebettet unter „Assistent“.

### Status-Screen

- Setup-Einstieg, wenn Einrichtung noch nicht fertig (Docker / Release / LAN)
- DHCP-Hinweis bei `network.lanIpStale`
- Geräte-URLs mit Kopieren / Öffnen
- Status-Grid: Install-Home, Compose-Projektname, Docker-Kurzstatus, `.env`, WLAN/LAN
- **Stack läuft / gestoppt** und Probe-Kacheln: Health-Header (aus Runtime-Poll)

### Netzwerk-Tab

- LAN-IP und Gateway (gleiche Panels wie Wizard), `POST /network` mit optionalem Stack-Neustart
- Topology-Übersicht + Binding-Checks

### Wartung

- Stack: Start / Stop / Neustart / Neu bauen & starten (Stop ohne Volume-Löschung; Bestätigung bei Stop/Neustart)
- **Neustart bei gestopptem Stack** = Start ohne Build (`compose up -d`)
- **Neu bauen & starten:** `POST /compose { action: "restart", build: true }`
- Logs pro Service (`GET /compose/logs`)
- `.env`-Backup (`POST /backup { target: "env" }`) — keine DB/Staff-PINs
- Import-/Export-Hostordner (`POST /storage`)
- Staff-PIN-Reset MFA/Ops (`POST /reset-staff-pins`)
- **Routing-Modus** Simple/Complex (`GET|POST /routing-mode`) — kein Ops-PIN (Manager-Vertrauenskanal)

### Routing-Modus

- **Konfigurationsoberfläche:** Praxis Flow Manager (nicht MFA/Ops-Web-UI).
- **Auth:** Kein Ops-PIN im Manager — Setup-API auf localhost; App akzeptiert `X-Praxis-Manager-Local: 1` nur von loopback für `routingMode`-PATCH.
- **Wizard:** Schritt 3 — Wert erst nach `getRoutingMode()` (kein Fake-Default); nach `apply` persistiert.
- **Wartung:** Sektion „Routing-Modus“ mit Speichern (ebenfalls erst nach Hydrate).
- **Lizenz:** `features.complexRoutingLicensed` in Capabilities (Stub: Dev erlaubt, Prod bis Lizenz-Infrastruktur).

Setup-API (localhost `:9190`):

| Methode | Pfad                               | Zweck                                                                                  |
| ------- | ---------------------------------- | -------------------------------------------------------------------------------------- |
| GET     | `/api/setup/host/status`           | Config-Snapshot (`HostStatus`)                                                         |
| GET     | `/api/setup/host/runtime-health`   | Pollbarer Runtime-Snapshot                                                             |
| GET     | `/api/setup/host/compose`          | Container-Status                                                                       |
| GET     | `/api/setup/host/compose/logs`     | Log-Auszug                                                                             |
| POST    | `/api/setup/host/compose`          | `{ action: start\|stop\|restart, build?: boolean }`; `build` nur bei `start`/`restart` |
| GET     | `/api/setup/host/backup`           | Letztes `.env`-Backup (nur lesen)                                                      |
| POST    | `/api/setup/host/backup`           | `{ target: "env" }`                                                                    |
| POST    | `/api/setup/host/storage`          | `{ importsHostPath, exportsHostPath, restartCompose? }`                                |
| POST    | `/api/setup/host/network`          | `{ lanAppIp, gateway, restartCompose? }` — Wartung/Netzwerk LAN/Gateway                |
| POST    | `/api/setup/host/reset-staff-pins` | MFA- & Ops-PIN auf Default `0000` (DB), Stack stop → reset → start                     |
| GET     | `/api/setup/host/routing-mode`     | Capabilities inkl. `routingMode`, `complexRoutingLicensed`                             |
| POST    | `/api/setup/host/routing-mode`     | `{ routingMode: "simple"\|"complex" }` — proxied zur App-API mit Manager-Trust         |

Vollständiger Install-Reset bleibt CLI: `npm run setup:reset`.

## Internen macOS-Build erstellen

Vom Repo-Root:

```bash
npm run dist:manager:mac
```

Der Build erzeugt `manager/dist/Praxis Flow Manager-<version>-<arch>.dmg`.
Dieser erste Phase-4a-Build ist bewusst unsigned/notarisiert **nicht**; er ist für interne Tests.
Beim Packaging werden der kompilierte Setup-Server und die Delivery-Templates in die App-Ressourcen gelegt.
Im gepackten Modus startet der Manager die Setup-API aus diesen Ressourcen und nutzt standardmäßig
`~/Library/Application Support/PraxisFlow` als Install-Home.

## Dev-Hinweise

**Port bereits belegt:** Läuft auf dem Zielport schon eine Setup-API (z. B. manuell `npm run setup:serve` in anderem Terminal oder anderer `PRAXIS_FLOW_HOME`), nutzt der Manager diese Instanz still — kein eigener Child-Prozess. Status kann dann zu einer fremden Install-Home gehören.

**`Failed to fetch` / Setup-API nicht erreichbar:** Status-HTTP läuft über den **Main Process** (IPC), nicht per `fetch` im Preload — Sandbox blockiert localhost dort. Wenn der Fehler bleibt: Terminal mit `[setup]`-Logs prüfen, Port `9190` frei, ggf. `npm run setup:serve` separat testen (`curl http://127.0.0.1:9190/api/setup/host/status`).

**LAN rot nach DHCP-Wechsel:** Unter **Netzwerk** aktuelle WLAN-IP wählen und übernehmen (oder Assistent erneut).

**LAN rot, lokal grün (Dev):** Shell-`HTTP_PROXY` leitet auch `192.168.*` um, wenn `NO_PROXY` nur `localhost` enthält. `proxy-toggle` muss RFC1918 ausschließen (`192.168.0.0/16`, `10.0.0.0/8`, …) oder Proxy für Praxis-Tests aus. Setup-Probes umgehen den Proxy seit 2026-06-26 direkt (`setup/src/probes.ts`).

## Typecheck

```bash
npm run -w @praxis-flow/manager typecheck
npm run -w @praxis-flow/setup test
```
