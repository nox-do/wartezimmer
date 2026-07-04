# Praxis Flow Manager — Plan (Electron)

Stand: 2026-06-25

## Rolle

| Komponente | Aufgabe |
| ---------- | ------- |
| **Praxis Flow Manager** (Electron) | Installation, Status, Wartung, Support — nur UX |
| **`@praxis-flow/setup`** | Single Source of Truth (CLI + API `:9190`) |
| **Docker Compose** | Runtime-Vertrag (`app`, `sandbox`, optional `gateway`) |
| **`/ops/setup`** | Fachkonfiguration nach erfolgreichem Host-Setup |

Electron dupliziert keine Setup-Logik — es ruft die lokale Setup-API auf.

## Installationsverzeichnis (Phase 0)

### Auflösung

```text
resolveSetupContext():
  1. PRAXIS_FLOW_HOME gesetzt?     → Install-Modus (Test/Dev/Delivery)
  2. sonst Monorepo gefunden?      → Repo-Modus (`npm run setup` im Entwickler-Tree)
  3. sonst                         → OS-Default (Delivery)
```

### Pfade

| Kontext | Pfad |
| ------- | ---- |
| **Test/Dev** | `PRAXIS_FLOW_HOME=/tmp/pf-dev-001` (empfohlen für wiederholte Installationen) |
| **Windows (Delivery)** | `%ProgramData%\PraxisFlow\` |
| **macOS (Delivery)** | `~/Library/Application Support/PraxisFlow/` |
| **Linux (Delivery)** | `~/.local/share/PraxisFlow/` (Appliance später: `/var/lib/praxis-flow/`) |
| **Electron-Binary** | getrennt (z. B. `%ProgramFiles%\Praxis Flow\`) — nur die App, nicht `.env` |

Import/Export sind Host-Ordner (Docker-Bind-Mounts). Default: `~/praxis-flow-imports`, `~/praxis-flow-exports` — konfigurierbar über `IMPORTS_HOST_PATH` / `EXPORTS_HOST_PATH` in `.env` (siehe Phase 3½).

### Bootstrap (Install-Modus)

Beim ersten Zugriff kopiert Setup fehlende Dateien aus dem Template-Root (Monorepo oder später Manager-Bundle):

- `.env.example`
- `docker-compose.delivery.yml`
- `docker-compose.gateway.delivery.yml`

Dev-Build in Temp-Install: `PRAXIS_FLOW_COMPOSE_PROFILE=dev` kopiert `docker-compose.yml` statt Delivery.

### Compose-Isolation

Parallele Test-Installs nutzen automatisch einen eigenen Compose-Namen:

- `COMPOSE_PROJECT_NAME` (optional)
- sonst `pf-<basename>` (z. B. `/tmp/pf-dev-001` → `pf-pf-dev-001`)

### Sauberer Zustand (Reset)

```bash
# Test-Install komplett leeren
PRAXIS_FLOW_HOME=/tmp/pf-dev-001 npm run setup:reset -- --yes

# Nur Container stoppen, .env behalten
PRAXIS_FLOW_HOME=/tmp/pf-dev-001 npm run setup:reset -- --keep-files --yes
```

Ohne `PRAXIS_FLOW_HOME` betrifft Reset das Monorepo (Warnung in CLI).

## MVP-Phasen

| Phase | Inhalt | Status |
| ----- | ------ | ------ |
| **0** | Install-Home, Bootstrap, Reset | erledigt |
| **1** | Electron-Hülle + Status (`GET /api/setup/host/status`) | erledigt |
| **2** | Install-Wizard (plan/apply/probes) + LAN-IP vom Host, LAN-Probe | erledigt |
| **3** | Maintenance (Start/Stop, Logs, Backup) | erledigt |
| **3½** | Import-/Export-Ordner (Bind-Mounts) konfigurieren | erledigt |
| **4** | Installer, Auto-Update | offen |

Historische Agent-Aufträge zu Phase 1–3: Git-History (`docs/plan-praxis-flow-manager-phase-*.md`, entfernt 2026-06-30).

## Setup-API — Leitlinien (Granularität)

**Prinzip:** Logik in `@praxis-flow/setup`; Manager = UI + IPC-Proxy. Alles, was vom Manager kommt, ist entweder **Setup** (Ersteinrichtung, Plan, Apply, Netzwerk, Probes, Handoff) oder **Maintenance** (Stack-Lifecycle, Logs, Backup, Staff-PIN-Reset). Keine neue Route pro UI-Button — Bündelung nach **Domäne/Ressource**, Varianten über **`action`** / **`target`** / **Body-Felder**.

### Lesen (GET, idempotent)

| Route | Zweck |
| ----- | ----- |
| `GET /api/setup/host/status` | Aggregat: Docker, `.env`, Probes, `network`, `deviceUrls`, `compose`, `folders`, … |
| `GET /api/setup/host/network` | Host-Interfaces + LAN-Kandidaten |
| `GET /api/setup/host/compose` | Container-PS |
| `GET /api/setup/host/compose/logs` | Log-Auszug (Sub-Ressource — groß/teuer) |
| `GET /api/setup/host/backup` | Letztes `.env`-Backup (Metadaten) |

**Regel:** Neuer GET nur, wenn die Antwort **groß**, **teuer** oder **anders gecacht/gepollt** werden soll. Alles andere → Felder in `status` (oder bestehende Ressource) erweitern.

### Schreiben (POST/PATCH)

| Route | Domäne | Muster |
| ----- | ------ | ------ |
| `POST /api/setup/host/plan` | Erstinstallation | URL-Plan (Wizard) |
| `POST /api/setup/host/apply` | Erstinstallation + `.env` | Schreibt `.env`, Ordner, optional `compose up` |
| `POST /api/setup/host/compose` | Maintenance: Stack-Lifecycle | `{ "action": "start"\|"stop"\|"restart", "build"?: boolean }`; `build` nur bei `start`/`restart` |
| `POST /api/setup/host/backup` | Sicherung | `{ "target": "env" }` |
| `POST /api/setup/host/storage` | Maintenance: Import-/Export-Ordner | `{ "importsHostPath": "...", "exportsHostPath": "...", "restartCompose"?: boolean }` |
| `POST /api/setup/host/network` | Maintenance: LAN-IP + Gateway | `{ "lanAppIp": "...", "gateway": { "enabled", "gatewayInterface", "gatewayIp", "portalAppIp" }, "restartCompose"?: boolean }` |
| `POST /api/setup/host/reset-staff-pins` | Wartung (selten) | MFA/Ops-PIN in DB |
| `POST /api/setup/host/probes` | Diagnose | Manuelle Health-Checks |

**Storage-Regel:** Import-/Export-Pfade laufen bewusst über `POST /api/setup/host/storage`, nicht über den Erstinstallations-`apply`-Flow. Der Wizard darf `folders` beim Apply explizit mitgeben; Maintenance ändert nur diese Storage-Keys und fragt bei laufendem Stack vor dem Neustart.

**Netzwerk-Regel:** LAN-IP und Gateway laufen über `POST /api/setup/host/network`, nicht über `apply`. Der Wizard nutzt weiterhin `plan`/`apply`; die Netzwerk-Wartungsseite sendet nur `lanAppIp` + `gateway` (kein Praxisname, keine Ordner).

**DTO-Regel:** Request/Response-Typen der Setup-Host-API leben in `@praxis-flow/server-shared` (`setup-api.ts`). Manager importiert/re-exportiert sie über `manager/src/shared/host-status.ts`. Gateway-/Practice-Defaults werden in `setup/src/setup-api-normalize.ts` zentral angewendet.

**Explizit vermeiden:** Eine Mega-Route `POST /api/setup/host` mit `type: "plan"|"compose.stop"|…` — Payloads von `plan`/`apply` sind zu unterschiedlich; Dispatcher wird undokumentiert und schwer testbar.

### Faustregel (neues Feature)

```text
Neues Feature?
  ├─ Nur Anzeige?           → status.* (oder bestehende GET-Ressource) erweitern
  ├─ .env / Host-Ordner?    → apply (Wizard) oder POST /storage (Wartung Ordner) bzw. POST /network (Wartung LAN/Gateway)
  ├─ Docker/Stack?          → Maintenance: POST /compose { action }
  ├─ Selten / destruktiv?   → eigene POST-Route nur wenn Semantik klar abgrenzt
  └─ Große/teure Daten?     → Sub-Ressource (wie compose/logs)
```

### Manager / IPC

Die Allowlist ist **`/api/setup/host/*`** — Route-Anzahl im Preload ist kein Engpass. Trotzdem: **semantische Bündelung** in Setup-Core und Doku, damit CLI, Smoke-Tests und spätere Phasen konsistent bleiben.

Ordner-Dialoge (Speichern unter, Ordner wählen) bleiben **Electron Main** (IPC), nicht Setup-API — die API bekommt nur den gewählten Pfad.

## Import-/Export-Ordner (Bind-Mounts)

**Umgesetzt (Phase 3½):** Manager zeigt Pfade, Ordner wählen, `.env`-Keys `IMPORTS_HOST_PATH` / `EXPORTS_HOST_PATH`, File-Sharing-Hinweis macOS/Windows, optional Stack-Neustart.

### API (kein Routen-Sprawl)

| Aktion | Route | Änderung |
| ------ | ----- | -------- |
| Lesen | `GET /status` | `folders`: `{ imports, exports }` |
| Schreiben | `POST /storage` | `{ importsHostPath, exportsHostPath, restartCompose?: boolean }` |

Der Wizard gibt Storage-Pfade bei `POST /apply` explizit mit. Wartung nutzt bewusst `POST /storage`, damit nur die Mount-Pfade geändert werden und der Erstinstallations-Flow schlank bleibt.

### Manager-UI

- Wartung (oder Wizard-Schritt): aktuelle Pfade, Button „Ordner wählen“ (Electron `showOpenDialog`)
- Hinweis Docker File Sharing (macOS/Windows)
- Nach Speichern: optional Neustart anbieten

### Nicht in 3½

- Datenmigration beim Pfadwechsel (alte Exporte bleiben am alten Ort — Hinweis im UI)
- NAS/Special-Cases nur dokumentieren, nicht automatisieren

## Staff-PIN

Delivery-Default: **`0000`** (MFA + Ops). MFA/Panel-PIN in MFA → Betrieb; Ops-PIN in System → PIN & Sicherheit. Reset: Manager → Wartung → Staff-PINs (nur MFA/Ops, DB).

## LAN-Erreichbarkeit & Geräte-URLs

Praxis-Szenario: **ein Host-PC** mit Docker; Terminal, TV, MFA und Raum-Panels kommen **über WLAN/LAN** — nicht über `localhost`. Zwei getrennte Fragen:

| Frage | Prüfung | Probe-ID / Status |
| ----- | ------- | ----------------- |
| Läuft der Stack auf diesem PC? | `http://127.0.0.1:8080/api/v1/ops/health` | `app.health.local` |
| Erreichen Geräte den Host im LAN? | `http://<LAN-IP>:8080/api/v1/ops/health` | `app.health.lan` |
| Stimmt die konfigurierte IP noch? | Host-Interfaces vs. `SETUP_LAN_APP_IP` / `APP_PORTAL_URL` | `network.lanIpStale` + Hinweis im Manager |
| Ist Port 8080 am LAN erreichbar? | TCP auf konfigurierter LAN-IP (optional, später) | `network.port8080` — Phase 2: HTTP-Health via `app.health.lan` |

Ohne grüne **LAN**-Prüfung sind Lesezeichen für `/terminal`, `/tv`, `/mfa` und Raum-Panels wirkungslos — auch wenn Docker lokal läuft.

### Anzeige im Manager (Ziel)

1. **Vom Host:** aktuelle LAN-Kandidaten (`GET /api/setup/host/network` — bereits in Setup-Core).
2. **Konfiguriert:** IP/URLs aus `.env` / `buildDeviceUrls` (Terminal, MFA, TV, Ops, Portal).
3. **Abgleich:** Wenn `192.168.1.23` in `.env`, Host aber `192.168.1.13` hat → gelber Hinweis, Setup neu ausführen oder IP anpassen.
4. **Port-Check:** HTTP Health auf LAN-IP; optional später TCP-Listen-Hinweis (Firewall, anderer Prozess auf 8080).

### Umsetzung

- Logik in `@praxis-flow/setup` (`probes.ts`, `host-state.ts`) — Manager nur UI.
- Install-Wizard: LAN-IP **vom Host wählen** (`listLanIpv4Candidates`), nach `apply` LAN-Probe.
- Wartung/Status: Geräte-URLs + „LAN-Erreichbarkeit testen“.

### Gast-WLAN / Gateway (Wizard)

- Eigener Schritt nach Praxis: aktiv/inaktiv, `GATEWAY_INTERFACE`, `GATEWAY_IP`, Portal-IP (Default = LAN-IP).
- `plan`/`apply` mit `gateway`-Payload (wie CLI); Vorausfüllung aus `.env` via `status.gateway`.
- macOS/Windows: `.env` vorbereiten, Compose-Profil `gateway` übersprungen (`gatewayComposeSkipped`).
- Praxis-IT-Hinweis (Option B): Gast-Traffic → Gateway-IP — kein AP-UI im Manager.
- Fachlich „Portal nutzen“ bleibt im Ops-Assistenten (`portalEnabled`).

**Wartung:** Stack, Import/Export, Logs, Backup, PIN-Reset. **Netzwerk:** eigene Seite (LAN + Gast-WLAN/Gateway) mit Schaubild.

```text
[Manager Status]
  App (lokal)     ✓ 127.0.0.1:8080
  App (LAN)       ✗ 192.168.1.23:8080 — Geräte kommen nicht an
  WLAN jetzt      192.168.1.13 (en0)   → „IP in Einstellungen aktualisieren“
  Terminal-URL    http://192.168.1.23:8080/terminal
  TV-URL          http://192.168.1.23:8080/tv
```

## Referenzen

- [`plan-setup-wizard.md`](plan-setup-wizard.md) — Host + In-App Assistent
- [`deployment-docker.md`](deployment-docker.md) — Compose, Volumes, Updates
- `setup/src/install-home.ts`, `setup/src/setup-context.ts`
