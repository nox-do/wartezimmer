# Integrationen — externe Systeme

Übersicht, was Praxis Flow **nicht selbst ist**, sondern anbindet oder optional mitliefert.

Status-Legende: **implementiert** · **geplant** · **Discovery**

## Guest-WLAN / Captive Portal — **Produktgrenze (Adapter, geplant)**

| Aspekt                | Details                                                                                            |
| --------------------- | -------------------------------------------------------------------------------------------------- |
| **Wir liefern**       | Portal-UI (`/portal/*`), Wartenummer-Prüfung, Session-API; später dünne Vendor-Adapter             |
| **Wir liefern nicht** | Router, Access Point, Captive-Portal-Hardware, eigenen Captive-Datenpfad (DHCP/Firewall/`ndsctl`)  |
| **Adapter-Formen**    | Outbound: nach gültiger Wartenummer URL/API beim Controller; Inbound: Request mit ja/nein          |
| **Session**           | Wartenummer = Portal-Session; `sessions/resolve-ticket`, `sessions/captive-authorize` (Hook)       |
| **Lab-Referenz**      | Früherer openNDS-`gateway`-Container: `docs/archive/gateway-captive-portal.md` (nicht Produktkern) |

WLAN-Infrastruktur (Omada, UniFi, …) bleibt Sache der Praxis-IT. Praxis Flow prüft Wartenummern und spricht Freigabe nur über Adapter an.

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
