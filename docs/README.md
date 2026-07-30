# Dokumentation — Einstieg

Kurzüberblick: **was wann lesen**. Technische Details stehen in den verlinkten Dateien — nicht alles auf einmal.

## Für wen?

| Rolle                       | Start hier                                                                                       |
| --------------------------- | ------------------------------------------------------------------------------------------------ |
| **Entwickler:in**           | [`architecture.md`](architecture.md) → `openapi/` → [`realtime-streams.md`](realtime-streams.md) |
| **Beta / IT in der Praxis** | [`delivery.md`](delivery.md) → [`deployment-docker.md`](deployment-docker.md)                    |
| **Produkt / Fachlichkeit**  | [`product.md`](product.md) → [`flows.md`](flows.md) → [`domain-model.md`](domain-model.md)       |
| **API-Integration**         | `openapi/*.yaml` (Vertrag) · [`apis.md`](apis.md) (Rollen & Regeln)                              |

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
| [`roadmap.md`](roadmap.md)                     | Phasen, nächste Schritte                                   |
| [`todo.md`](../todo.md)                        | Arbeitsstand (intern)                                      |

## Setup & Netzwerk

| Datei                                                      | Inhalt                                                                   |
| ---------------------------------------------------------- | ------------------------------------------------------------------------ |
| [`../manager/README.md`](../manager/README.md)             | Manager (Electron): Wizard, Setup-API, Wartung                           |
| [`integrations.md`](integrations.md)                       | Externe Systeme: WLAN-Adapter-Grenze, eGK, PVS, SMS                      |
| [`gateway-captive-portal.md`](gateway-captive-portal.md)   | **Lab-Referenz** — früherer openNDS-Pfad (nicht Produktkern)             |
| [`plan-proxy-container.md`](plan-proxy-container.md)       | **Plan** — Reverse Proxy, TLS-Modi (LAN + Portal extern), Manager-Status |
| [`plan-auth-session-slots.md`](plan-auth-session-slots.md) | **Plan** — Auth: Rolle ↔ Cookie, scoped Login/Me/Logout, UI-Auswirkungen |

## Sandbox & Formulare

| Datei                                            | Inhalt                       |
| ------------------------------------------------ | ---------------------------- |
| [`sandbox-interface.md`](sandbox-interface.md)   | App↔Sandbox API              |
| [`sandbox-container.md`](sandbox-container.md)   | Container, Pipeline, Volumes |
| [`anamnese-templates.md`](anamnese-templates.md) | Erstanamnese-Vorlagen        |

## Selten gebraucht

| Datei                                                            | Inhalt                                    |
| ---------------------------------------------------------------- | ----------------------------------------- |
| [`i18n.md`](i18n.md)                                             | Sprachen Terminal/Portal vs. Staff        |
| [`business-revenue-model.md`](business-revenue-model.md)         | Preis-/Lizenz-Skizze (intern)             |
| [`audit-dopplungen-altlasten.md`](audit-dopplungen-altlasten.md) | Inventur: Dopplungen / Altlasten (intern) |

## API-Vertrag

**Source of Truth:** `openapi/*.yaml` → `npm run generate:api` → Fastify-Schemas + TS-Typen.

- Swagger UI (Dev): `http://localhost:8080/api/docs`
- Bundle: `openapi/bundle.json`
