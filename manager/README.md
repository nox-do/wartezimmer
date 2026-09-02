# Praxis Flow Manager

Electron-Hülle für Host-Setup, Status und Wartung. Docker-Stack steuern (Start/Stop/Neustart), Container/Logs, `.pfbackup`, Erreichbarkeit (Poll) — alles über Setup-API + IPC.

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

- **Main:** startet `@praxis-flow/setup serve` als eigenen Child-Prozess (ephemerer Loopback-Port, Override via `SETUP_HOST_PORT`); Health-Handshake (`protocolVersion`, Build-ID, Install-Home) plus einmaliges Start-Token. Alle Setup-API-Calls über IPC-Proxy (`setup-api.ts`, Allowlist `/api/setup/host/*`, nur `127.0.0.1`)
- **Preload:** CJS, `sandbox: true` — nur IPC, **kein `fetch`**
- **Renderer (Svelte 5):** Shell mit Health-Header + Tabs (Status / Netzwerk / Wartung / Assistent). Koordination über `manager-shell-state` (Sessions, Loading) und `createManagerAppController()` → `mount(App)` → `start()`. Browser-Handoff per `shell.openExternal`.

### Refresh / Poll

- **Config-only** (`scope: 'config'`): nur `fetchSetupStatus` — erster Boot, Apply und andere Mutationen. Kein Runtime-Fetch als Nebeneffekt.
- **Full refresh** (Tab-Wechsel): Config immer; Runtime parallel nur wenn der letzte erfolgreiche Config-Snapshot `.env` hat (`envExists`). Ein Fail verwirft den anderen nicht.
- **Runtime-Poll** alle **12s** wenn `lastConfig.envExists` — **jede View**, einschließlich beider Wizard-Presentations. Ohne `.env` kein Timer. Config-Fehler am Start: kein Runtime, kein Poll; späterer Config-Fehler behält den letzten Snapshot und dessen Poll-Regel.
- **Config** (`configSnapshot`): nur erfolgreicher Config-Fetch; Runtime-Poll schreibt nicht hinein
- Fehler getrennt: `statusError` (Config) vs. `runtimeError` (Health-Header); Statusseite bleibt bei Health-Fehlern sichtbar
- Überlappende Felder: reine Selektoren (`effectiveCompose`, …) — keine Mischkopie

### Install-Wizard (Assistent)

1. Voraussetzungen (Docker, ggf. Release-Paket, Port-Checks)
2. Routing — Routing-Modus (Praxisname erst in Ops `/ops/setup`)
3. Import & Export — Host-Ordner (Kontakte / MFA-Exporte)
4. Netzwerk — LAN-IP & Erreichbarkeit
5. Zugang — optional Port 80 (Proxy); Gateway im Manager immer aus
6. HTTPS — nur mit Proxy; Mail/PEM im Assistenten, Cutover unter Netzwerk ([`docs/operations/tls.md`](../docs/operations/tls.md))
7. Vorschau (`POST /plan`) — Geräte-URLs
8. Anwenden (`POST /apply`) + Abschluss (Probes)

Ops-Detail Erstinstall: [`docs/operations/delivery.md`](../docs/operations/delivery.md) §4.  
Ersteinrichtung ohne `.env` läuft fullscreen ohne Tabs; Re-Run eingebettet unter „Assistent“.

### Status-Screen

- Setup-Einstieg, wenn Einrichtung noch nicht fertig (Docker / Release / LAN)
- DHCP-Hinweis bei `network.lanIpStale`
- Geräte-URLs mit Kopieren / Öffnen
- Status-Grid: Install-Home, Compose-Projektname, Docker-Kurzstatus, `.env`, WLAN/LAN
- **Stack läuft / gestoppt** und Probe-Kacheln: Health-Header (aus Runtime-Poll)

### Netzwerk-Tab

- LAN-IP und optional Proxy (`POST /network` mit optionalem Stack-Neustart)
- Topology-Übersicht + Binding-Checks

### Wartung

- Stack: Start / Stop / Neustart (Stop ohne Volume-Löschung; Bestätigung bei Stop/Neustart)
- **Neustart bei gestopptem Stack** = Start (`compose up -d`)
- Logs pro Service (`GET /compose/logs`)
- Backup/Restore `.pfbackup` (`POST /backup`, validate, restore) — Vertrag: [`docs/operations/backup.md`](../docs/operations/backup.md)
- Import-/Export-Hostordner (`POST /storage`)
- Staff-PIN-Reset MFA/Ops (`POST /reset-staff-pins`)
- **Routing-Modus** Simple/Complex (`GET|POST /routing-mode`) — kein Ops-PIN (Manager-Vertrauenskanal)

### Routing-Modus

- **Konfigurationsoberfläche:** Praxis Flow Manager (nicht MFA/Ops-Web-UI).
- **Auth:** Kein Ops-PIN im Manager — Setup-API auf localhost; App akzeptiert `X-Praxis-Manager-Local: 1` nur von loopback für `routingMode`-PATCH.
- **Wizard:** Schritt 3 — Wert erst nach `getRoutingMode()` (kein Fake-Default); nach `apply` persistiert.
- **Wartung:** Sektion „Routing-Modus“ mit Speichern (ebenfalls erst nach Hydrate).
- **Lizenz:** `features.complexRoutingLicensed` in Capabilities (Stub: Dev erlaubt, Prod bis Lizenz-Infrastruktur).

Setup-API (Manager-Child auf Loopback; CLI-Default `127.0.0.1:9190`):

| Methode | Pfad                               | Zweck                                                                                                        |
| ------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| GET     | `/api/setup/host/status`           | Config-Snapshot (`HostStatus`)                                                                               |
| GET     | `/api/setup/host/runtime-health`   | Pollbarer Runtime-Snapshot                                                                                   |
| GET     | `/api/setup/host/compose`          | Container-Status                                                                                             |
| GET     | `/api/setup/host/compose/logs`     | Log-Auszug                                                                                                   |
| POST    | `/api/setup/host/compose`          | `{ action: start\|stop\|restart }`                                                                           |
| GET     | `/api/setup/host/backup`           | Info zum letzten `.pfbackup`                                                                                 |
| POST    | `/api/setup/host/backup`           | `.pfbackup` erzeugen (+ TLS-Sidecar wenn `tls.state ≠ off`)                                                  |
| POST    | `/api/setup/host/backup/validate`  | Archiv + Settings validieren                                                                                 |
| POST    | `/api/setup/host/backup/inspect`   | Inspect/Vorschau inkl. Kompatibilität & TLS-Gate                                                             |
| POST    | `/api/setup/host/backup/restore`   | Fresh-DB-Cutover + Settings-Import                                                                           |
| POST    | `/api/setup/host/storage`          | `{ importsHostPath, exportsHostPath, restartCompose? }`                                                      |
| POST    | `/api/setup/host/network`          | `{ lanAppIp, gateway, restartCompose? }` — Wartung/Netzwerk (gateway stets `{ enabled: false }` aus Manager) |
| POST    | `/api/setup/host/reset-staff-pins` | MFA- & Ops-PIN auf Default `0000` (DB), Stack stop → reset → start                                           |
| GET     | `/api/setup/host/routing-mode`     | Capabilities inkl. `routingMode`, `complexRoutingLicensed`                                                   |
| POST    | `/api/setup/host/routing-mode`     | `{ routingMode: "simple"\|"complex" }` — proxied zur App-API mit Manager-Trust                               |

| POST | `/api/setup/host/images/load` | Erstinstallation: `.tar.gz` + Sidecar (`manifest.json` / `SHA256SUMS.txt`) |
| POST | `/api/setup/host/update/inspect` | Wartung: `.pfupdate`-Datei prüfen (Release, Kompatibilität, Warnungen) |
| POST | `/api/setup/host/update/apply` | Wartung: `.pfupdate`-Datei (Pfad), Cutover + Rollback |

Vollständiger Install-Reset bleibt CLI: `npm run setup:reset`.

Build, Release-Pakete und Versionierung: **[`docs/operations/delivery.md`](../docs/operations/delivery.md)**.

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

**Zweite Manager-Instanz:** Produktiv eine Instanz. Im Dev-Modus gilt die Sperre **pro Install-Home** — parallele `PRAXIS_FLOW_HOME=…` bleiben möglich, zweimal dieselbe Home nicht.

**Fremde Setup-API:** Der Manager übernimmt **nicht** still einen Prozess auf Port 9190. Produktiv startet er immer einen eigenen Child. Expliziter Dev-Attach:

```bash
npm run setup:serve   # Terminal 1, Default :9190
PRAXIS_FLOW_SETUP_ATTACH=1 npm run dev:manager
```

Attach prüft denselben Handshake (Protokoll, Build-ID, Install-Home). Passt die Identität nicht, startet der Manager **nicht** auf der fremden API. Token: `setup:serve` ohne `PRAXIS_FLOW_SETUP_TOKEN` bleibt per curl nutzbar; ein Manager-Child verlangt das Start-Token.

**`Failed to fetch` / Setup-API nicht erreichbar:** Status-HTTP läuft über den **Main Process** (IPC), nicht per `fetch` im Preload — Sandbox blockiert localhost dort. Wenn der Fehler bleibt: Terminal mit `[setup]`-Logs prüfen, ggf. `npm run setup:serve` separat testen (`curl http://127.0.0.1:9190/api/setup/health`).

**LAN rot nach DHCP-Wechsel:** Unter **Netzwerk** aktuelle WLAN-IP wählen und übernehmen (oder Assistent erneut).

**LAN rot, lokal grün (Dev):** Shell-`HTTP_PROXY` leitet auch `192.168.*` um, wenn `NO_PROXY` nur `localhost` enthält. `proxy-toggle` muss RFC1918 ausschließen (`192.168.0.0/16`, `10.0.0.0/8`, …) oder Proxy für Praxis-Tests aus. Setup-Probes umgehen den Proxy seit 2026-06-26 direkt (`setup/src/probes.ts`).

## Typecheck

```bash
npm run -w @praxis-flow/manager typecheck
npm run -w @praxis-flow/setup test
```

LAN-TLS (Produkt): [`docs/operations/tls.md`](../docs/operations/tls.md). Detailquellen: [`docs/plan-proxy-tls.md`](../docs/plan-proxy-tls.md), [`docs/plan-proxy-tls-manager.md`](../docs/plan-proxy-tls-manager.md).
