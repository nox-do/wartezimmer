# Integrationen — externe Systeme

Übersicht, was Praxis Flow **nicht selbst ist**, sondern anbindet oder optional mitliefert.

Status-Legende: **implementiert** · **geplant** · **Discovery**

## Guest-WLAN / Captive Portal — **implementiert (v1 Scaffold)**

| Aspekt                | Details                                                                                 |
| --------------------- | --------------------------------------------------------------------------------------- |
| **Wir liefern**       | Optionaler `gateway`-Container (openNDS + dnsmasq + Auth-Bridge)                        |
| **Wir liefern nicht** | Access Point, Praxis-Router, Internet-Anschluss                                         |
| **Portal-UI**         | `app`-Container, Route `/portal/*`                                                      |
| **Session**           | Wartenummer = WLAN-Session; API `sessions/resolve-ticket`, `sessions/captive-authorize` |
| **Setup**             | **`docs/gateway-captive-portal.md`** (End-to-End)                                       |
| **Technik**           | `gateway/README.md`, Compose-Overlays `docker-compose.gateway*.yml`                     |

Offen für Produktionsreife: HTTPS im LAN, Gast-VLAN-Referenzdesign pro Praxis, Feldtest mit echter AP-Kombination.

## eGK — **Discovery (Phase 3)**

| Aspekt            | Skizze                                                                      |
| ----------------- | --------------------------------------------------------------------------- |
| **Zweck**         | Check-in am Terminal per eGK statt Rufnummer/Geburtsdatum                   |
| **Rolle**         | Adapter, nicht Kern der Patient-UI                                          |
| **Blocker**       | Terminal-Hardware, Kartenterminal-API, Compliance — siehe `docs/roadmap.md` |
| **API (geplant)** | `POST /api/v1/identity/egk-lookup` (in `docs/apis.md` skizziert)            |

## PVS — **geplant (Phase 3)**

| Aspekt       | Skizze                                                                                           |
| ------------ | ------------------------------------------------------------------------------------------------ |
| **Zweck**    | Stammdaten, Termine, Übernahme exportierter Dokumente ins Fachsystem                             |
| **Aktuell**  | Import-Ordner (`contactLookupFolderPath`), rekursiver CSV-Scan, Preview + Spalten-Mapping in Ops |
| **Richtung** | Adapter pro PVS-Produkt; keine direkte PVS-UI im Patientenportal                                 |

## SMS / Messenger — **teilweise implementiert**

| Provider   | Stand                                                  |
| ---------- | ------------------------------------------------------ |
| `mock`     | Dev/Test                                               |
| `seven.io` | SMS + WhatsApp (Recall) über `ops/messaging/providers` |

Siehe `docs/apis.md` (Messaging) und Smoke `npm run smoke:messaging-recall`.

## Verweise

- Fachliche Flows: `docs/flows.md`
- API: `docs/apis.md`, `openapi/`
- Roadmap-Phasen: `docs/roadmap.md`
