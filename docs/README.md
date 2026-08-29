# Dokumentation — Einstieg

Kurzüberblick: **was wann lesen**. Technische Details stehen in den verlinkten Dateien — nicht alles auf einmal.

## Kunden-Test (jetzt)

Kein öffentliches Release. Ziel: eine Praxis-IT kann den Stack **installieren, im LAN betreiben und ein Update einspielen**.

| Rolle                       | Start hier                                                                                                                     |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| **Beta / IT in der Praxis** | [`delivery.md`](delivery.md) → [`deployment-docker.md`](deployment-docker.md) → [`../manager/README.md`](../manager/README.md) |
| **Fachlichkeit vor Ort**    | [`product.md`](product.md) → [`flows.md`](flows.md)                                                                            |
| **Scope / Nicht-Ziele**     | [`roadmap.md`](roadmap.md)                                                                                                     |

**In diesem Test:** Terminal, MFA, TV, Raum-Panel, Portal (LAN), Manager, optional HTTP-Proxy Port 80, Backup/Restore, `.pfupdate`.

**Nicht in diesem Test:** eGK, PVS-Adapter, Captive-/Gateway-Produkt, TLS/443, Internet-Portal, Manager-Auto-Update.

## Kerndokumente

| Datei                                          | Inhalt                                                     |
| ---------------------------------------------- | ---------------------------------------------------------- |
| [`product.md`](product.md)                     | Produktinfo: was wir sind / nicht sind, Abgrenzungen       |
| [`flows.md`](flows.md)                         | Patienten- und MFA-Abläufe; Betrieb-Rahmen (Manager/Proxy) |
| [`architecture.md`](architecture.md)           | Container, Module, Persistenz, Tagesreset                  |
| [`apis.md`](apis.md)                           | Rollenmatrix, fachliche API-Regeln (Vertrag: OpenAPI)      |
| [`realtime-streams.md`](realtime-streams.md)   | SSE: Queue, Ops-Stream, Presence, Pairing                  |
| [`delivery.md`](delivery.md)                   | Build, Erstinstallation, Updates, Release                  |
| [`deployment-docker.md`](deployment-docker.md) | Compose, Volumes, Betrieb (Runtime)                        |
| [`domain-model.md`](domain-model.md)           | Nummernkreis, Themen, Räume                                |
| [`events.md`](events.md)                       | Outbox, interne Events                                     |
| [`roadmap.md`](roadmap.md)                     | Kunden-Test-Scope, danach                                  |

## Setup & Netzwerk

| Datei                                                                    | Inhalt                                         |
| ------------------------------------------------------------------------ | ---------------------------------------------- |
| [`../manager/README.md`](../manager/README.md)                           | Manager (Electron): Wizard, Setup-API, Wartung |
| [`integrations.md`](integrations.md)                                     | Externe Systeme: WLAN-Grenze, eGK, PVS, SMS    |
| [`settings-backup-classification.md`](settings-backup-classification.md) | Was Backup/Restore/Update erhält               |

## Sandbox & Formulare

| Datei                                            | Inhalt                       |
| ------------------------------------------------ | ---------------------------- |
| [`sandbox-interface.md`](sandbox-interface.md)   | App↔Sandbox API              |
| [`sandbox-container.md`](sandbox-container.md)   | Container, Pipeline, Volumes |
| [`anamnese-templates.md`](anamnese-templates.md) | Erstanamnese-Vorlagen        |

## Intern — nicht für den Kunden-Test

Pläne und Arbeitsstände. Historische Dateien: [`archive/README.md`](archive/README.md).

| Datei                                                            | Inhalt                                                 |
| ---------------------------------------------------------------- | ------------------------------------------------------ |
| [`../todo.md`](../todo.md)                                       | Aktuelle Arbeitsliste (intern)                         |
| [`i18n.md`](i18n.md)                                             | Sprachen Terminal/Portal vs. Staff                     |
| [`business-revenue-model.md`](business-revenue-model.md)         | Preis-/Lizenz-Skizze                                   |
| [`catalog-source-of-truth.md`](catalog-source-of-truth.md)       | `ops_settings` vs. flow-core-Catalog                   |
| [`plan-proxy-tls.md`](plan-proxy-tls.md)                         | LAN-TLS — Architektur, nicht Kunden-Test               |
| [`plan-proxy-tls-manager.md`](plan-proxy-tls-manager.md)         | Manager-UX für LAN-TLS — nicht Kunden-Test             |
| [`plan-manager-https.md`](plan-manager-https.md)                 | Manager HTTPS aufräumen — Fail vs. Warten, zwei Flächen |
| [`plan-manager-installer-cleanup.md`](plan-manager-installer-cleanup.md) | Manager Renderer: Wartung-Mutex, Generation, Svelte-Brücke |
| [`archive/README.md`](archive/README.md)                         | Routing-Pläne, Auth-Slots, HTTP-Proxy-Ist, Gateway-Lab |

## API-Vertrag

**Source of Truth:** `openapi/*.yaml` → `npm run generate:api` → Fastify-Schemas + TS-Typen.

- Swagger UI (Dev): `http://localhost:8080/api/docs`
- Bundle: `openapi/bundle.json`
