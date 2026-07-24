# Praxis Flow

Lokales Praxis-System: Check-in am Terminal, Warteschlange (MFA), Wartezimmer-TV, Patient-Portal (Upload/Anamnese), Dokument-Export — als Docker-Stack ohne Cloud.

**Stack:** `app` (Fastify + SQLite + UI), `ui` (Svelte 5), `sandbox` (Preview/Form2PDF, ClamAV). WLAN/Captive: Praxis-IT + geplante dünne Adapter — kein eigener Gateway-Container im Produkt.

## Status

Basisentwicklung — lokaler Dev-Stack und Docker-Compose sind der Hauptweg. Kunden-Delivery (versionierte Images, Manager, `.pfupdate`): [`docs/delivery.md`](docs/delivery.md).

## Voraussetzungen

- **Node.js 22+** und npm (Workspaces-Monorepo)
- **Docker Desktop** mit Compose v2 (empfohlener Dev-Weg)
- Port **8080** frei auf dem Host
- Optional: Ordner `~/praxis-flow-imports` und `~/praxis-flow-exports` (Compose-Defaults; siehe `.env.example`)

## Schnellstart (Docker)

```bash
npm install
cp .env.example .env          # mindestens Secrets anpassen (siehe .env.example)
npm run docker:up               # Build + Start: app + sandbox auf :8080
```

**Dev-Login:** MFA und Ops — PIN **0000** (in der Datenbank; auch Delivery-Standard nach Erststart/`npm run setup`).

Stoppen / Logs:

```bash
npm run docker:down
docker compose logs -f app
```

Images lokal: `praxis-flow/app:local`, `praxis-flow/sandbox:local`. Betrieb und Updates: [`docs/deployment-docker.md`](docs/deployment-docker.md).

## Entwicklung ohne Docker

Für schnelle UI- und API-Iteration — **ohne** Sandbox, ClamAV und volle Container-Nähe:

```bash
npm run dev:app                 # Backend :8080 (Terminal braucht oft noch laufendes UI-Build)
npm run dev:ui                  # SvelteKit-Devserver mit Proxy auf :8080
```

Dokument-Preview, Form2PDF und Malware-Scan: Stack mit `npm run docker:up` (mindestens `app` + `sandbox`). Selten nativ: `npm run dev:sandbox` (nur Sandbox; App/API weiter separat).

Erstinstallation & Manager: [`docs/delivery.md`](docs/delivery.md) · [`manager/README.md`](manager/README.md).  
CLI: `npm run setup` · Test-Install: `PRAXIS_FLOW_HOME=/tmp/pf-dev-001 npm run setup` · Reset: `npm run setup:reset`

## Alltagsbefehle

```bash
npm run verify                  # lint + typecheck + tests + UI-Build + Secret-Scan
npm run generate:api            # nach Änderungen an openapi/*.yaml
npm run smoke:all               # Integration — braucht laufenden Stack auf :8080
```

## URLs (nach Start)

Basis: `http://localhost:8080`

| Rolle          | URL                             |
| -------------- | ------------------------------- |
| Terminal       | http://localhost:8080/terminal  |
| MFA            | http://localhost:8080/mfa       |
| TV             | http://localhost:8080/tv        |
| Portal         | http://localhost:8080/portal    |
| Ops-Setup      | http://localhost:8080/ops/setup |
| API-Docs (Dev) | http://localhost:8080/api/docs  |

## Dokumentation

Einstieg nach Rolle: **[`docs/README.md`](docs/README.md)**

| Thema             | Datei                                                            |
| ----------------- | ---------------------------------------------------------------- |
| Produktinfo       | [`docs/product.md`](docs/product.md)                             |
| Fachliche Abläufe | [`docs/flows.md`](docs/flows.md)                                 |
| Architektur       | [`docs/architecture.md`](docs/architecture.md)                   |
| API-Vertrag       | `openapi/*.yaml` (+ [`docs/apis.md`](docs/apis.md) Rollenmatrix) |
| Echtzeit (SSE)    | [`docs/realtime-streams.md`](docs/realtime-streams.md)           |
| Build & Release   | [`docs/delivery.md`](docs/delivery.md)                           |
| Docker-Betrieb    | [`docs/deployment-docker.md`](docs/deployment-docker.md)         |
| Manager           | [`manager/README.md`](manager/README.md)                         |
| WLAN / Portal     | [`docs/integrations.md`](docs/integrations.md)                   |

Env-Variablen: [`.env.example`](.env.example) — nicht hier duplizieren.

Kundenbetrieb: `docker-compose.delivery.yml` — Runtime [`docs/deployment-docker.md`](docs/deployment-docker.md), Build/Release [`docs/delivery.md`](docs/delivery.md).

## Repo-Struktur

```text
app/                    Backend (Fastify) + ausgelieferte UI (dist)
ui/                     SvelteKit → Build nach app/dist/ui-static
sandbox/                Dokument-Preview, ClamAV, Form2PDF
packages/domain/        Geteilte Fachlogik / Typen
packages/server-shared/ Geteilte Server-Helfer (Logger, …)
setup/                  Host-CLI + Setup-API (:9190)
manager/                Electron-App: Wizard, Wartung, Updates
gateway/                Lab-Referenz openNDS (nicht Produktkern)
openapi/                API-Spezifikation (Source of Truth)
docs/                   Fach- und Architektur-Doku

docker-compose.yml              Dev: Build + Start (app, sandbox)
docker-compose.delivery.yml     Kunden: nur Image-Tags aus Registry
```
