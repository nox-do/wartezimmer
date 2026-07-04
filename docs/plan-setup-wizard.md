# Setup-Wizard — Gesamtplan (Host + In-App)

Stand: 2026-06-04

## Problem

Praxis-IT scheitert an **zwei Schichten**, die der Browser in `/ops/setup` nicht lösen kann:

| Schicht    | Beispiele                                                                  | Werkzeug                                             |
| ---------- | -------------------------------------------------------------------------- | ---------------------------------------------------- |
| **Host**   | Docker installieren, `.env` + Secrets, LAN-IPs, `compose up`, File Sharing | **Setup-Host** (`setup/`, lokal)                     |
| **In-App** | CSV/Mapping, SMS-Credentials, Mount-Checks                                 | **Ops-Assistent** (`/ops/setup`, läuft in Container) |

## Zielbild

```text
[1] npm run setup          →  Host-CLI/API (Keys, Netz, Docker, Probes)
         ↓
[2] Container läuft        →  http://<LAN>:8080 (ohne Proxy) bzw. http(s)://<host> (mit Proxy 80/443)
         ↓
[3] /ops/setup im Browser  →  CSV, SMS, Verify, Abschluss
         ↓
[4] Geräte bookmarken      →  /terminal, /mfa, /tv (URLs aus Schritt 1 / CANONICAL_BASE_URL)
```

## Host-Assistent (`@praxis-flow/setup`)

**Install-Home:** Repo-Modus im Monorepo; Delivery/Test über `PRAXIS_FLOW_HOME` (z. B. `/tmp/pf-dev-001`). Reset: `npm run setup:reset`. Details: [`plan-praxis-flow-manager.md`](plan-praxis-flow-manager.md).

### Schritte (CLI v1, API gleiche Daten)

1. **Voraussetzungen** — Docker/Compose installiert und Daemon läuft; sonst Install-Hinweise (OS-spezifisch).
2. **Netzwerk** — `os.networkInterfaces()`; Auswahl **LAN-IP** für Terminal/TV/MFA/Ops; optional **Gast-WLAN** (Interface-Name, `GATEWAY_IP`, Portal-IP).
3. **Praxis** — Stammdaten (Name, Adresse, Kontakt) in Ops-Settings / Wizard (`/ops/practice`).
4. **Secrets** — App-Secret, `SANDBOX_INTERNAL_TOKEN`, `OPENNDS_FAS_KEY` (bei Gateway); Staff-PINs werden beim ersten App-Start in der DB geseedet (Default **0000**), nicht in `.env`.
5. **`.env` schreiben** — aus `.env.example` + Plan; Backup wenn vorhanden.
6. **Ordner** — `~/praxis-flow-imports`, `~/praxis-flow-exports`.
7. **Docker starten** — `docker compose up -d --build` (Dev) oder Delivery-Compose wenn Image-Tags gesetzt.
8. **Verbindungstests** — `GET /api/v1/ops/health`, optional `GET /api/v1/ops/settings/onboarding` mit Ops-Key, optional Gateway-Bridge.
9. **Handoff** — URLs + Hinweis Standard-PIN `0000`; Browser: `/ops/setup`. Keine Ops-Keys in Terminalausgabe, Logs oder Browser-UI.

### URL-Plan (aus LAN-IP)

Ohne Reverse-Proxy (aktueller Stand): direkter App-Port `:8080`. Mit Proxy (siehe `docs/plan-proxy-container.md`): kanonische Basis `http://<host>` oder `https://<host>` auf Port 80/443 — keine `:8080`-Links mehr an Endgeräte.

| Rolle              | Pfad         | Beispiel (ohne Proxy)                    |
| ------------------ | ------------ | ---------------------------------------- |
| Terminal           | `/terminal`  | `http://192.168.1.50:8080/terminal`      |
| MFA                | `/mfa`       | `http://192.168.1.50:8080/mfa`           |
| Wartezimmer (TV)   | `/tv`        | `http://192.168.1.50:8080/tv`            |
| Ops / Assistent    | `/ops/setup` | `http://192.168.1.50:8080/ops/setup`     |
| Portal (Gast-WLAN) | `/portal`    | `APP_PORTAL_URL` (oft andere IP als LAN) |

Gateway-Defaults siehe `docs/gateway-captive-portal.md`. `GATEWAY_AUTH_BRIDGE_URL`: Linux `http://172.17.0.1:9100`, macOS/Windows `http://host.docker.internal:9100`.

### Lokale API (für späteres Electron-UI)

- Bind nur `127.0.0.1:9190`
- `GET /api/setup/host/status`
- `GET /api/setup/host/network`
- `POST /api/setup/host/plan` → URL-Plan + Snippet
- `POST /api/setup/host/apply` → `.env`, Ordner, optional `compose up`
- `POST /api/setup/host/probes`

Start: `npm run setup:serve`

## In-App-Assistent (bestehend)

Route `/ops/setup` — Schritte: welcome → practice → storage → contacts → messaging → **portal** → verify.

Pflicht-Checks für Abschluss: Praxisname, Storage, Kontakt-CSV. SMS optional. **Portal:** nur aktiv/inaktiv (`portal_enabled` in DB) — keine Gateway-Konfiguration im Container.

**Grenze:** Gast-WLAN, Gateway-Container, `.env` (`GATEWAY_*`) → **Praxis Flow Manager** (Host-Setup). Ops-Assistent verweist darauf, prüft Bridge nicht mehr.

## Lokale Auth & Geräte-Pairing

### Staff-PIN (MFA / Ops)

- **Delivery-Default:** MFA und Ops nutzen PIN **`0000`** (bewusst dokumentiert, nicht geheim).
- Hashes liegen in der **Datenbank** (`auth_settings`); der PIN steht **nicht** im UI-Bundle und **nicht** in `.env`.
- **Ändern:** MFA → Betrieb (MFA- und Panel-PIN); Ops-PIN unter System → PIN & Sicherheit (jeweils aktuelle PIN der Rolle).
- **Zurücksetzen (MFA/Ops vergessen):** Praxis Flow Manager → Wartung → Staff-PINs (nur DB; Raum-Panel-PIN unverändert).
- Kein Production-Start-Blocker wegen Default-PIN; Schutzmodell: lokales Praxis-LAN + OS-Zugang + Rate-Limit beim Login.
- Optional später: Status-Hinweis „Standard-PIN noch aktiv“ in Health/Onboarding (`pinConfigUsesDefaultStaffPins`).

### Sessions & Browser

- Cookies brauchen `SameSite=Strict` (oder begründet `Lax`), `Secure` sobald HTTPS aktiv ist, Logout/Revoke, Idle-Timeout und absolute Laufzeit.
- Mutierende Staff-/Device-Routen brauchen Session-Rolle plus CSRF-Token oder strikte serverseitige Origin-Prüfung; kein Wildcard-CORS.

### MFA

- MFA nutzt lokale Anmeldung statt statischem Rollen-Key.
- Login prüft PIN/Credential im Backend, begrenzt Fehlversuche und setzt eine Session mit Rolle `mfa`.
- MFA lädt Rolle und Sessionstatus über `/api/v1/auth/me` oder `/api/v1/auth/session`.
- Privilegierte MFA-Aktionen prüfen serverseitig die Session-Rolle.

### TV

- Die URL/Origin ist keine Geräteidentität, sondern nur ein streng geprüfter Local-Mode-Hinweis.
- TV bleibt ohne Pairing nur im explizit konfigurierten Same-Origin-Local-Modus erlaubt, wenn die effektive Request-Origin exakt der konfigurierten lokalen MFA-Origin entspricht.
- Fehlende, fremde oder nicht eindeutig prüfbare Origin führt zu Pairing.
- Bei abweichender Origin startet TV einen Pairing-Flow: TV zeigt einen kurzlebigen Einmal-Code, MFA gibt diesen ein und bestätigt.
- Danach erstellt das Backend eine lesende TV-Device-Session (`pf_tv_device_session`). Der Code ist kein dauerhafter Key.
- Same-Origin-TV bleibt strikt read-only.
- **Echtzeit (Ist):** MFA erfährt Pairing-Prompt und Presence über Ops-Stream (`device.pairing`, `device.presence`) — siehe **`docs/realtime-streams.md`**. Nicht über REST-Poll.

### Terminal

- Terminal erhält keine MFA/Ops-Privilegien und keine privilegierten Browser-Keys.
- Terminal darf fachlich mutieren (Check-in, Notfall), deshalb müssen Terminal-APIs langfristig eine Terminal-Device-Session oder explizit konfigurierte lokale Terminal-Freigabe prüfen.
- Mutierende Terminal-APIs ohne gültige Terminal-Berechtigung liefern 401/403.
- Device-Cookie: `pf_terminal_device_session`. Pairing-/Presence-Push an MFA: **`docs/realtime-streams.md`**.

### Ops

- Ops nutzt keine statischen Browser-Keys mehr.
- `/ops/setup` verwendet Session/Auth-Status; Anmeldung mit Standard-PIN `0000` oder geändertem PIN.
- Wartungsaktionen können später zusätzliche Bestätigung verlangen; das ist fachlich separat zu entscheiden.

## Wichtige Grenzen

- **Image-Build:** Privilegierte Rollen-Keys dürfen nicht mehr in die UI gebacken werden. `VITE_*` bleibt nur für nicht-sensitive Build-Konfiguration. Nach der Auth-Umstellung sollte Key-Rotation keinen SPA-Rebuild mehr erfordern.
- **Gateway:** Kein Gateway-Setup im App-Container; Host über Manager (`@praxis-flow/setup`). Ops speichert nur `portal_enabled`.
- **Kein Docker-Socket** im App-Container.

## Implementierung

| Teil                       | Status                                |
| -------------------------- | ------------------------------------- |
| Ops-API `setup/*`          | erledigt                              |
| Ops-UI Wizard Kern         | erledigt                              |
| Ops-UI Verify-Schritt      | erledigt (`POST …/onboarding/verify`) |
| `@praxis-flow/setup` Paket | v1 CLI + API                          |
| Electron-Installer         | später (nutzt gleiche API)            |

## Portal HTTPS / DNS (spaeter)

Oeffentlich nur `/portal` + TLS; im LAN alle Rollen ueber Proxy `80`/`443`. DynDNS, eigene Domain, ACME — siehe `docs/plan-proxy-container.md` (Abschnitt **P6**).

## Referenzen

- `todo.md` (Ops-Wartung Backlog, Remediation-Plan)
- `docs/realtime-streams.md` (Echtzeit Pairing/Presence)
- `docs/plan-proxy-container.md` (Reverse Proxy, TLS-Modi, Portal-Whitelist extern)
- `docs/deployment-docker.md`
- `docs/gateway-captive-portal.md`
- `setup/src/*`
