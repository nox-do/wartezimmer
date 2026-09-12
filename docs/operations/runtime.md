# Runtime — Compose, Host, Tagesbetrieb

Stand: 2026-08-31 · am Code geprüft (`setup/src/docker.ts`, Compose Delivery/Dev)

**Scope:** Was nach der Installation läuft — Services, Compose-Stacking, Ports/Volumes, Alltag.  
Nicht: Release-Bau → [`delivery.md`](delivery.md) · LAN-TLS → [`tls.md`](tls.md) · Backup → [`backup.md`](backup.md) · Anbindungen → [`integrations.md`](integrations.md)

## 1. Zielbild

- Wenige Container, ein klarer Einstieg, **Manager-first** (Setup-API / Wartung)
- Praxis: versionierte Images starten — **kein** lokales `docker compose build`
- Delivery-Compose: nur `image:`, kein `build:` (`docker-compose.delivery.yml`)
- Kein Kubernetes, kein externer Broker, kein separater DB-Container (SQLite in `app`)

## 2. Product-Services

| Service            | Rolle                                      | Sichtbarkeit                                        |
| ------------------ | ------------------------------------------ | --------------------------------------------------- |
| `app`              | API + UI (Terminal/MFA/TV/Portal) + SQLite | LAN-Port(s); hinter Proxy ggf. nur Loopback `:8080` |
| `sandbox`          | Dokumentenvorschau / Form2PDF, ClamAV      | nur Docker-Netz (`expose 8081`)                     |
| `proxy` (optional) | Caddy HTTP und ggf. HTTPS                  | `:80` / `:443` — [`tls.md`](tls.md)                 |

**Nicht Produktkern:** TLS-Lab (`pebble` / `acme-dns` / `coredns`) → [`../archive/tls-lab.md`](../archive/tls-lab.md). openNDS-Gateway-Stack entfernt → [`../archive/gateway-captive-portal.md`](../archive/gateway-captive-portal.md).

UI-Rollen laufen als statische Assets aus dem `app`-Image. Praxisname/Kontakte: DB (Ops), nicht Wizard. Auth-Secrets nur serverseitig in `.env`.

## 3. Compose-Stacking (Ist)

Resolver: `resolveComposeFiles` / `resolveComposeFileList` in `setup/src/docker.ts`.

| Schicht   | Dev                                                               | Delivery                      | Wann                                  |
| --------- | ----------------------------------------------------------------- | ----------------------------- | ------------------------------------- |
| Base      | `docker-compose.yml`                                              | `docker-compose.delivery.yml` | immer                                 |
| Proxy     | `docker-compose.proxy.yml`                                        | `….proxy.delivery.yml`        | `PROXY_ENABLED` + Mode `http`/`tls-*` |
| Proxy-TLS | `….proxy-tls.yml`                                                 | `….proxy-tls.delivery.yml`    | Mode `tls-*` **oder** `TLS_STATE≠off` |
| TLS-Lab   | `docker-compose.tls-lab.yml` + `docker-compose.tls-lab-proxy.yml` | —                             | nur Dev + `TLS_ACME_DIRECTORY=pebble` |

openNDS-Gateway-Compose ist entfernt (nicht Produkt). Historie: [`../archive/gateway-captive-portal.md`](../archive/gateway-captive-portal.md).

TLS-Overlay nur nach Proxy-Overlay. Default-Compose-Projektname typisch `praxis-flow` (Volumes z. B. `praxis-flow_app_data`).

Leitplanken: `restart: unless-stopped`, Healthchecks, **feste Image-Tags** (kein `latest` im Praxisbetrieb).

## 4. Persistenz & Host-Pfade

| Name                                  | Inhalt                                               |
| ------------------------------------- | ---------------------------------------------------- |
| Volume `app_data`                     | SQLite + Runtime-Status (`/var/lib/praxis-flow/app`) |
| Volume `sandbox_intake_data`          | Dokument-Intake (Tagesreset: purge)                  |
| Volume `clamav_db`                    | ClamAV-Signaturen                                    |
| Bind `EXPORTS_HOST_PATH` → `/exports` | Exporte bleiben liegen                               |
| Bind `IMPORTS_HOST_PATH` → `/imports` | z. B. CSV-Kontaktlookup                              |

Docker Desktop: File Sharing für Host-Pfade. Kein Log-Volume — stdout + json-file-Rotation:

- Default `DOCKER_LOG_MAX_SIZE=10m`, `DOCKER_LOG_MAX_FILE=5`
- Greift für **neu erstellte** Container (`--force-recreate` nach Limit-Änderung)
- Altlast `praxis_flow_logs_data` ggf. manuell löschen wenn leer

## 5. Netz & Ports

| Port         | Wer                           | Hinweis                                                                                   |
| ------------ | ----------------------------- | ----------------------------------------------------------------------------------------- |
| `8080`       | App                           | ohne Proxy im LAN; mit Proxy typisch `APP_BIND_ADDRESS=127.0.0.1`                         |
| `8082`       | Maintenance                   | nur `127.0.0.1` am Host — Backup/Import ([`backup.md`](backup.md))                        |
| `9190`       | Setup-API (CLI `setup:serve`) | Default nur für manuelles Serve; der Manager bindet einen eigenen ephemeren Loopback-Port |
| `80` / `443` | Proxy                         | optional; TLS ab prepare/cutover — [`tls.md`](tls.md)                                     |

Sandbox ohne öffentlichen Host-Port. Portal unter `/portal` im `app`-Container.

## 6. Tagesbetrieb

**Produktweg:** Praxis Flow Manager → Status / Wartung.

| Aktion                  | Bedeutung                                                                                  |
| ----------------------- | ------------------------------------------------------------------------------------------ |
| Start / Stop / Neustart | Compose up / **stop** (Volumes bleiben) / restart; Stop bei schon gestopptem Stack → Start |
| Logs                    | pro Service über Setup-API                                                                 |
| Health                  | `GET /api/v1/ops/health` (Compose-Healthcheck + Support)                                   |
| Update                  | Wartung → `.pfupdate` ([`delivery.md`](delivery.md) §5)                                    |
| Backup                  | Wartung → `.pfbackup` ([`backup.md`](backup.md))                                           |
| Staff-PIN               | Standard nach Install **`0000`**; Reset in Manager-Wartung                                 |

**Fachlicher Tagesreset** (MFA „Tag neu starten“ / Day-Lifecycle) ≠ Container neu spawnen — Tickets/Outbox/Sandbox-Intake, Stack bleibt stehen.

Nach Update (Stichprobe): Health OK, Check-in, MFA-Queue; optional Smoke `smoke:practice-hours` / `smoke:day-lifecycle`.

## 7. Proxy / TLS

HTTP-Proxy (Port 80) ist optionaler Endzustand und **Voraussetzung** für LAN-HTTPS. Stacking/Ports hier; Aktivierung, Cutover, `state/tls/`: [`tls.md`](tls.md). Lab-ACME nicht in den Produktbetrieb mischen.

## 8. Support-Fallback (ohne Manager)

Nur Notfall — **kein** Settings-Cutover/Rollback wie beim `.pfupdate`.

```bash
# Delivery-Beispiel (cwd = Install-Home, .env gesetzt)
# Base immer; bei PROXY_ENABLED zusätzlich Proxy-Overlay; bei TLS_STATE≠off / tls-* auch proxy-tls
# (gleiche Reihenfolge wie setup/src/docker.ts — sonst kein Caddy auf 80/443, App oft nur Loopback)

docker compose \
  -f docker-compose.delivery.yml \
  -f docker-compose.proxy.delivery.yml \
  -f docker-compose.proxy-tls.delivery.yml \
  --env-file .env up -d

# Nur HTTP-Proxy (kein TLS prepared/active): proxy-tls-Zeile weglassen
# Ohne Proxy: nur docker-compose.delivery.yml

docker compose -f docker-compose.delivery.yml -f docker-compose.proxy.delivery.yml \
  -f docker-compose.proxy-tls.delivery.yml --env-file .env ps
docker compose -f docker-compose.delivery.yml -f docker-compose.proxy.delivery.yml \
  -f docker-compose.proxy-tls.delivery.yml --env-file .env stop   # Volumes bleiben
```

`compose down` entfernt Container/Netz; Volumes mit Default-`down` typisch nicht — trotzdem Manager-`stop` bevorzugen. Image-Tags nur in `.env` tauschen ist kein Produkt-Update. Overlay-Auswahl: §3 bzw. Manager.
