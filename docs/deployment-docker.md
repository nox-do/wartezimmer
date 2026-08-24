# Deployment mit Docker (einfach fuer Nichttechniker)

## Ziel

Der Betrieb soll fuer Praxen mit wenig IT-Aufwand stabil und vorhersagbar sein:

- so wenig Container wie moeglich
- ein klarer Einstiegspunkt
- einfache Updates und einfache Backups

## Zielbild (v1)

**Delivery-Prinzip:** Praxis Flow wird als **versionierte Container-Images** ausgeliefert.  
In der Praxis wird **nicht lokal gebaut**, sondern nur eine `.env` gepflegt und mit Compose gestartet/aktualisiert.

Verwendete Compose-Datei fuer Kundenbetrieb:

- `docker-compose.delivery.yml` (nur `image:`, kein `build:`)

## Services

- `app`
  - API + Fachlogik + Runtime-DB
  - einzige nach aussen sichtbare Service-Adresse
- `sandbox`
  - isolierte Dokumentenvorschau + Form2PDF
  - nur intern erreichbar (kein oeffentlicher Port)
- `gateway` _(Lab-Referenz, Profil `gateway` — nicht Produktkern)_
  - Früherer openNDS-Pfad; siehe `docs/integrations.md` und `docs/archive/gateway-captive-portal.md`

## Nicht in v1

- kein Kubernetes
- kein externer Message-Broker
- kein separater DB-Container

## Persistenz

- `app_data`:
  - SQLite
  - Runtime-Status (Queue/Session)
- `sandbox_intake_data`:
  - Dokument-Intake im Sandbox-Container (Tagesreset: purge + Restart)
- `clamav_db`:
  - ClamAV-Signaturen im Sandbox-Container (Dev- und Delivery-Compose gleich)
- Host-Ordner (Bind-Mounts, kein Docker-Volume):
  - `~/praxis-flow-imports` → `/imports`
  - `~/praxis-flow-exports` → `/exports` (Exporte bleiben bewusst liegen)

## Container-Logs (Rotation)

App und Sandbox loggen nach **stdout** (Fastify / `createLogger`). Docker speichert das mit dem **json-file**-Treiber und rotiert automatisch:

- Default: `max-size: 10m`, `max-file: 5` (ca. **50 MB** Obergrenze pro Container)
- Anpassung in `.env`: `DOCKER_LOG_MAX_SIZE`, `DOCKER_LOG_MAX_FILE`
- **Fastify / App-Logger:** `LOG_LEVEL` (optional). Ohne Wert: `info` in Development, `warn` in Production (`NODE_ENV=production`). Health-Probes (`GET /api/v1/ops/health`, Sandbox `/internal/health/*`) erzeugen keine Request-Zeilen.
- **Sandbox Lifecycle (Prod):** gezielte `warn`/`error` bei Malware/Scan-Fehler, Auth 401/403, `purge-day`, Scanner-Update-Fehler und Restart — ohne Access-Log pro Upload/Preview.

Nach `docker compose up -d` greift die Rotation fuer **neu erstellte** Container. Bestehende Container einmal neu anlegen (`docker compose up -d --force-recreate`), damit die Limits aktiv werden.

Es gibt **kein** separates Log-Volume mehr (`logs_data` entfernt). Nach einem Upgrade von aelteren Installationen kann ein ungenutztes Docker-Volume `praxis_flow_logs_data` noch existieren — optional mit `docker volume rm praxis_flow_logs_data` entfernen, wenn leer.

## Netzwerk und Ports

- Extern nur **ein Port** (vom `app`-Service)
- `sandbox` bleibt im internen Docker-Netz
- Portal-UI bleibt im `app`-Container (`/portal`); WLAN/Captive = Praxis-IT + geplante Adapter (`docs/integrations.md`)

## UI-Rollen im App-Image

Terminal (`/terminal`), MFA (`/mfa`) und TV (`/tv`) laufen als statische UI aus dem `app`-Container auf Port 8080.
Privilegierte Rollen-Keys werden **nicht** in das öffentliche UI-Bundle eingebettet. Das UI-Build bekommt nur nicht-sensitive Vite-Konfiguration:

- `VITE_API_BASE` (optional, normalerweise leer/relative API)

**Praxisname und Kontaktdaten** liegen in der Datenbank (Ops → Praxis & Datenschutz bzw. `/ops/setup`). `PRACTICE_DISPLAY_NAME` in `.env` ist nur noch ein optionaler Seed (z. B. CLI `npm run setup`) — der Praxis Flow Manager fragt den Namen nicht mehr ab.

MFA/Ops nutzen Staff-Session-Cookies, TV und Terminal nutzen Device-Pairing mit serverseitiger Device-Session. Lokale UI-Entwicklung nutzt `npm run dev:ui` (Proxy auf `:8080`).

Auth-Keys und Session-Secrets bleiben serverseitige Runtime-Konfiguration in `.env` und erfordern keinen SPA-Rebuild.

## Compose-Leitplanken

- `restart: unless-stopped` fuer beide Services
- Healthcheck auf `app` via `GET /api/v1/ops/health`
- **feste Image-Tags** (kein `latest` im Praxisbetrieb)
- klare Volume-Mounts statt versteckter Container-Pfade
- kein taegliches Neu-Spawn der Container; Praxisoeffnung ist ein fachlicher Zustand, kein Container-Lifecycle-Event

## Docker Scout / Image-Analyse (Desktop)

Lokale Dev-Images (`docker-compose.yml`) heissen `praxis-flow/app:local`, `praxis-flow/sandbox:local` und werden mit **SBOM- + Provenance-Attestations** gebaut (`sbom: true`, `provenance: mode=max`).

Damit die Analyse in **Docker Desktop → Images** zuverlaessig funktioniert:

1. Images einmal neu bauen: `docker compose build --no-cache` (bzw. `--build` bei `up`)
2. In Docker Desktop **Settings → General → „Use containerd for pulling and storing images“** aktivieren (Attestations werden sonst oft nicht angezeigt)
3. Image in der Images-Ansicht auswaehlen — Scout-Details erscheinen nach kurzer Indexierung

CLI-Alternative (funktioniert auch ohne Desktop-UI): `docker scout quickview local://praxis-flow/app:local`

Delivery-Images aus der Registry brauchen beim Publish zusaetzlich `--sbom=true --provenance=true` am Build/Push-Pipeline-Schritt.

## Betriebsprofil fuer Nichttechniker

Ziel: so wenig Schritte wie moeglich, klarer Support-Pfad.

- **Anmeldung MFA/Ops:** Standard-PIN **`0000`** (nach Erstinstallation; MFA/Panel in MFA → Betrieb, Ops in System → PIN & Sicherheit; bei Vergessen: Praxis Flow Manager → Wartung → Staff-PINs).
- Einmalig:
  1. `.env` aus Vorlage anlegen und Werte eintragen
  2. `PRAXIS_FLOW_APP_IMAGE` und `PRAXIS_FLOW_SANDBOX_IMAGE` auf freigegebene Version setzen
  3. Exportpfad (`EXPORTS_HOST_PATH`) auf einen vorhandenen Ordner setzen
  4. Importpfad (`IMPORTS_HOST_PATH`, z. B. `~/praxis-flow-imports`) anlegen und CSV dort ablegen
  5. Docker-Freigabe fuer diese Host-Pfade aktivieren (macOS/Windows: Docker Desktop File Sharing)
- Tagesbetrieb:
  - keine Build-Kommandos
  - nur Start/Stop/Status
- Update: **Praxis Flow Manager → Wartung → Software-Update** (`.pfupdate`) — siehe [`delivery.md`](delivery.md)
- Manuell ohne Manager (nur Support-Fallback): Image-Tags in `.env` setzen, `compose pull && up -d` — kein Settings-Cutover/Rollback

## Start/Stop/Status (Kundenbetrieb)

- Start:
  - `docker compose -f docker-compose.delivery.yml --env-file .env up -d`
- Stop:
  - `docker compose -f docker-compose.delivery.yml --env-file .env down`
- Status:
  - `docker compose -f docker-compose.delivery.yml --env-file .env ps`

## Empfohlene Post-Update-Checks

- API-Health: `GET /api/v1/ops/health`
- Fachlich:
  - Check-in erfolgreich
  - `topicId=offen` Guardrails wie erwartet
  - MFA-Queue sichtbar
- Optional technisch (Support):
  - `npm run smoke:practice-hours`
  - `npm run smoke:day-lifecycle`

## Tagesbetrieb / Maintenance

- Tagesreset fachlich ueber MFA **Tag neu starten** / `ops/day-lifecycle/reset` (Tickets + Outbox leer, Sandbox purge)
- Container-Logrotation ist in Compose vorkonfiguriert (`DOCKER_LOG_*`)
- Volume-Backup vor Updates (`app_data`, optional Intake-Volume)

## Fehlerfall-Strategie

- Bei App-Neustart: Wiederherstellung aus SQLite/Runtime-Status
- Bei Day-Close: kontrollierter Reset gemaess Fachprozess
- Bei Ausfall der Sandbox: Dokumentvorschau blockieren, restlicher Betrieb laeuft weiter
