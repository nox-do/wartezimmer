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

## Geräteadresse

Im Wizard wird die IP-Adresse ausgewählt; der Proxy-Schalter bestimmt den HTTP-Port:
`http://<IP>:8080` ohne Proxy, `http://<IP>` mit Proxy. Eine zusätzliche Auswahl
zwischen IP, Rechnername und eigener HTTP-Domain entfällt. Die Namenswahl gehört
zur HTTPS-Einrichtung. Der Manager hält keine editierbaren `reachabilityMode`-/
`customHostname`-Felder mehr. Plan-, Apply- und Netzwerk-API akzeptieren kein
`canonicalBaseUrl` mehr; veraltete Anfragen werden vor Änderungen abgewiesen.
Backend und Vorschau verwenden dieselbe HTTP-Adressableitung. `CANONICAL_BASE_URL`
bleibt als abgeleiteter persistierter Wert für Geräte-URLs und TLS erhalten.
Bestehende eigene HTTP-Adressen werden weiterhin gelesen
und beim Laden der Netzwerkkonfiguration nicht auf IP oder einen neuen Rechnernamen umgeschrieben.

Im Netzwerk-Tab stehen die gespeicherte Geräteadresse, Öffnen/Kopieren und die
Erreichbarkeitsprüfung direkt unter „Praxisadresse dieses Rechners“. Änderungen
zeigen eine getrennte Vorschau; die Aktionen beziehen sich auf die gespeicherte
Adresse. Während der TLS-Vorbereitung und nach dem Cutover bleibt die TLS-Identität maßgeblich.

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

1. Voraussetzungen (Docker, ggf. Release-Paket, lokale Port-Checks)
2. Import & Export (Kontakte / MFA-Exporte)
3. Praxisadresse und Gerätezugriff (Adresse und zugehöriger Adapter)
4. Zugriff im Praxisnetz: initialer interner HTTP-Betrieb oder Proxy an ausgewählter Adresse
5. Optional HTTPS: Mail/PEM im Assistenten, Cutover unter Netzwerk ([`docs/operations/tls.md`](../docs/operations/tls.md))
6. Zusammenfassung des internen Betriebs (`POST /plan`)
7. Anwenden (`POST /apply`), Prüfung und Abschluss mit MFA-Einstieg

Ops-Detail Erstinstall: [`docs/operations/delivery.md`](../docs/operations/delivery.md) §4.  
Ein zentral als sauber nicht installiert erkannter Zustand startet den Assistenten
fullscreen ohne Tabs. Unklare oder unvollständige Installationen bleiben auf der
Statusseite und öffnen den Assistenten auf Wunsch eingebettet. Ältere Setup-Hosts
ohne Lifecycle-Feld behalten die bisherige Einstiegslogik.

### Status-Screen

- Betriebsmodus aus der zentralen Setup-Auswertung, getrennt von Runtime und offenen
  Portaländerungen; [Vertrag und Grenzen](../docs/architecture/manager-operating-modes.md)
- Bewusster Setup-Einstieg bei unklarer oder widersprüchlicher Einrichtung;
  Docker-Ausfall einer bestehenden Installation bleibt ein Betriebsproblem
- DHCP-Hinweis bei `network.lanIpStale`
- Interne Zugänge mit Kopieren / Öffnen; Portal ausdrücklich für interne Nutzung
- Zugangszusammenfassung: Praxisadresse/Adapter, HTTP/HTTPS, Publikationsumfang,
  Laufzustand und letzte Host-Prüfung; Patientenzugang bleibt separat noch nicht eingerichtet
- Installationsdetails aufklappbar: Install-Home, Compose-Projektname, Docker, `.env`
- **Stack läuft / gestoppt** und Probe-Kacheln: Health-Header (aus Runtime-Poll)

### Netzwerk-Tab

- Staff-Adresse samt Adapter und optional Proxy (`POST /network` mit optionalem Stack-Neustart)
- ohne Proxy bewusst offener initialer interner Betrieb auf `0.0.0.0:8080`
- mit Proxy App nur auf Loopback und Port 80/443 nur an der Staff-Adresse;
  Netzwerkdiagramm + tatsächliche Runtime-Binding-Checks
- Proxy-Wiederherstellung auch nach HTTPS-Cutover; offene Entwürfe zuerst übernehmen/verwerfen
- Docker/Caddy als Produktgrenze; Host-Firewall und Netztrennung bleiben bei Praxis-IT
- „HTTPS eingerichtet“ wird nicht mit einem tatsächlich laufenden Proxy gleichgesetzt

### Wartung

- Stack: Start / Stop / Neustart (Stop ohne Volume-Löschung; Bestätigung bei Stop/Neustart)
- **Neustart bei gestopptem Stack** = Start (`compose up -d`)
- Logs pro Service (`GET /compose/logs`)
- Backup/Restore `.pfbackup` (`POST /backup`, validate, restore) — Vertrag: [`docs/operations/backup.md`](../docs/operations/backup.md)
- Import-/Export-Hostordner (`POST /storage`)
- Staff-PIN-Reset MFA/Ops (`POST /reset-staff-pins`)
- **Routing-Modus:** wird ausschließlich in der Ops-Web-App konfiguriert. Der Manager enthält keinen Routing-Dialog.
- **Technischer Kompatibilitätspfad:** Der lokale Setup-Endpunkt `/routing-mode` bleibt für bestehende Host-/Restore-Abläufe verfügbar, ist aber keine zweite fachliche Konfigurationsoberfläche.

### Routing-Modus

- **Fachliche Autorität:** Ops Settings unter `/ops/routing`; dort werden `GET/PATCH /api/v1/ops/settings` und die Routing-Capabilities verwendet.
- **Manager:** Host-Setup, Docker, Netzwerk, Backup und Wartung. Der interaktive Wizard schreibt den Routing-Modus nicht mehr.
- **Kompatibilität:** Der lokale Setup-Endpunkt darf für technische Restore-/Host-Abläufe bestehen bleiben; er ist explizit kein regulärer UI-Pfad.
- **Serverregeln:** Moduswechsel werden serverseitig bei offenen Visits abgelehnt. Complex Routing ist standardmäßig erlaubt; nur `COMPLEX_ROUTING_LICENSED=false` optet explizit aus.

Setup-API (Manager-Child auf Loopback; CLI-Default `127.0.0.1:9190`):

| Methode | Pfad                               | Zweck                                                                                                  |
| ------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------ |
| GET     | `/api/setup/host/status`           | Config-Snapshot (`HostStatus`)                                                                         |
| GET     | `/api/setup/host/runtime-health`   | Pollbarer Runtime-Snapshot                                                                             |
| GET     | `/api/setup/host/compose`          | Container-Status                                                                                       |
| GET     | `/api/setup/host/compose/logs`     | Log-Auszug                                                                                             |
| POST    | `/api/setup/host/compose`          | `{ action: start\|stop\|restart }`                                                                     |
| GET     | `/api/setup/host/backup`           | Info zum letzten `.pfbackup`                                                                           |
| POST    | `/api/setup/host/backup`           | `.pfbackup` erzeugen (+ TLS-Sidecar wenn `tls.state ≠ off`)                                            |
| POST    | `/api/setup/host/backup/validate`  | Archiv + Settings validieren                                                                           |
| POST    | `/api/setup/host/backup/inspect`   | Inspect/Vorschau inkl. Kompatibilität & TLS-Gate                                                       |
| POST    | `/api/setup/host/backup/restore`   | Fresh-DB-Cutover + Settings-Import                                                                     |
| POST    | `/api/setup/host/storage`          | `{ importsHostPath, exportsHostPath, restartCompose? }`                                                |
| POST    | `/api/setup/host/network`          | `{ lanAppIp, proxy?, gateway, restartCompose? }` — Staff-/Proxy-Binding (gateway im Manager stets aus) |
| POST    | `/api/setup/host/reset-staff-pins` | MFA- & Ops-PIN auf Default `0000` (DB), Stack stop → reset → start                                     |
| GET     | `/api/setup/host/routing-mode`     | Kompatibilitätsroute: Capabilities inkl. `routingMode`, `complexRoutingLicensed`                       |
| POST    | `/api/setup/host/routing-mode`     | Kompatibilitätsroute: `{ routingMode: "simple"\|"complex" }` — proxied zur App-API mit Manager-Trust   |

| POST | `/api/setup/host/images/load` | Erstinstallation: `.pfinstall` mit versioniertem Manifest |
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
