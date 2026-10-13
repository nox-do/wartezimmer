# Logging

**Scope:** Welche Logger-Schicht wo gilt, Level/`LOG_LEVEL`, Abgrenzung CLI/UI.  
Nicht: Container-Log-Rotation → [`../operations/runtime.md`](../operations/runtime.md)

## 1. Logger pro Kontext

Ein **gemeinsamer Pino-Root** pro Prozess (über `buildFastifyLoggerOptions` /
`createModuleLogger` in `@wartezimmer/server-shared/logger`). Fastify und Hintergrundcode
teilen denselben Logger — kein paralleler `console`-Wrapper in der App.

| Kontext                                                         | Nutzen                                              | Nicht                                      |
| --------------------------------------------------------------- | --------------------------------------------------- | ------------------------------------------ |
| HTTP-Handler / Hooks                                            | `request.log` oder `app.log` (Pino, Request-Kind)   | eigener Module-Logger nur für Request-Pfad |
| Hintergrund im App-Prozess (Worker, DB-Helfer, Export, Cleanup) | `createModuleLogger('module.name')`                 | `console.*`                                |
| Sandbox **vor** Fastify (Entrypoint/Bootstrap)                  | `sandbox-log` (`logSandboxWarn` / `logSandboxInfo`) | App-`createModuleLogger`                   |
| Sandbox **nach** Fastify                                        | `request.log` / `app.log`                           | —                                          |
| Setup-/Manager-CLI, Smoke, Build-Scripts                        | `console` bzw. Clack/`p.log`                        | Server-Pino                                |
| UI (Browser)                                                    | —                                                   | kein Server-Logger                         |

Startup-Banner außerhalb von Fastify (z. B. Maintenance-URL in `server.ts`)
dürfen `console` bleiben.

## 2. Level & Env

- Steuerung: `LOG_LEVEL` (`debug` \| `info` \| `warn` \| `error` \| `fatal` \| `silent`)
- Default: `warn` bei `NODE_ENV=production`, sonst `info`
- Docker-Compose (Dev und Delivery) setzt für App und Sandbox explizit
  `LOG_LEVEL=${LOG_LEVEL:-warn}`. Damit bleibt auch die lokale Docker-App mit
  `NODE_ENV=development` ruhig; Warnungen und Fehler bleiben sichtbar.
- Für eine zeitlich begrenzte Diagnose `LOG_LEVEL=info` oder `debug` setzen und
  die Container neu erstellen. Fastify schreibt dann auch für statische Assets
  jeweils `incoming request` und `request completed`. Danach wieder auf `warn`
  zurückstellen und erneut erstellen. Ein bloßer Container-Neustart übernimmt
  geänderte Umgebungsvariablen nicht.
- High-Frequency-Probes: `SILENT_ROUTE_LOG` (`logLevel: 'silent'`) an der Route

Pino-Konvention: **Objekt zuerst**, dann Message — `log.warn({ err }, '…')`, nicht
`(message, meta)`.

## 3. Modul-Namen

`createModuleLogger` setzt `module` als Child-Feld, z. B. `outbox.worker`,
`db.core`, `documents.export`. Kurze, stabile Punkt-Pfade — keine Request-IDs
dort (die kommen nur über `request.log`).

## 4. Was nicht geloggt wird

Keine Klartext-PII (Name, Mobil, DOB), keine Secrets (`AUTH_KEY_*`, PINs,
Tokens), keine vollständigen Dokument-/Upload-Inhalte. Fehlertexte und IDs
(Visit/Document/Event) sind ok, wenn fachlich nötig.
