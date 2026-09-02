# Integrationen — Grenzen

Stand: 2026-08-31 · Abgleich [`product.md`](../product.md), Code/Manager, Archive

**Scope:** Was Praxis Flow anbindet oder bewusst **nicht** ist.  
Status: **implementiert** · **geplant** · **Discovery**

Nicht: LAN-TLS/Proxy → [`tls.md`](tls.md) · Compose-Alltag → [`runtime.md`](runtime.md)

## 1. Guest-WLAN / Captive — geplant (Adapter)

|                       |                                                                                                                                                                               |
| --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Wir liefern**       | Portal-UI (`/portal/*`), Wartenummer-Prüfung, Session-API; später dünne Vendor-Adapter                                                                                        |
| **Wir liefern nicht** | Router, AP, Captive-Hardware, eigenen Captive-Datenpfad (DHCP/Firewall/`ndsctl`)                                                                                              |
| **Session-Hooks**     | u. a. `sessions/resolve-ticket`, `sessions/captive-authorize` (Freigabe über Adapter)                                                                                         |
| **Manager**           | Gateway stets `enabled: false` (`DISABLED_GATEWAY_PLAN`) — kein Produkt-Captive aus dem Wizard                                                                                |
| **Lab**               | früherer openNDS-`gateway`-Container: [`../archive/gateway-captive-portal.md`](../archive/gateway-captive-portal.md); Compose nur Linux + Env ([`runtime.md`](runtime.md) §3) |

WLAN (Omada, UniFi, …) bleibt Praxis-IT. Internet-Portal/Whitelist = **nicht Produkt** (Outlook), kein Ops-Ist.

## 2. SMS / WhatsApp — implementiert (teilweise)

| Provider         | Stand                                         |
| ---------------- | --------------------------------------------- |
| `mock`           | Dev/Test                                      |
| `seven`          | SMS (seven.io)                                |
| `seven_whatsapp` | WhatsApp-Recall über denselben Anbieter-Kanal |

Konfiguration: Ops → Messaging (`ops/messaging/providers`). Credentials Klartext in DB/Backup — [`backup.md`](backup.md).  
Fachlich: Rückhol-SMS optional beim MFA-Rückholen, nicht am Standard-Check-in ([`flows.md`](../flows.md)).  
Smoke: `npm run smoke:messaging-recall`. API-Skizze: [`../architecture/apis.md`](../architecture/apis.md).

## 3. Kontakt-CSV (PVS-nah) — implementiert; Vendor-PVS geplant

|              |                                                                                                              |
| ------------ | ------------------------------------------------------------------------------------------------------------ |
| **Heute**    | Import-Ordner (`CONTACT_LOOKUP_BASE_PATH` / Ops-Pfad), rekursiver CSV-Scan, Preview + Spalten-Mapping in Ops |
| **Nicht**    | Vendor-PVS-/KIS-Adapter, PVS-UI im Patientenportal                                                           |
| **Richtung** | Adapter pro PVS-Produkt (Discovery/geplant) — Stammdaten/Termine/Dokument-Übernahme                          |

Check-in ohne CSV-Treffer bleibt möglich ([`flows.md`](../flows.md)).

## 4. eGK — Discovery

|                  |                                                                                                                                   |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| **Zweck**        | Terminal-Check-in per eGK statt nur Rufnummer/Geburtsdatum                                                                        |
| **Rolle**        | Adapter, kein Kartenterminal-Produkt                                                                                              |
| **Blocker**      | Terminal-Hardware, Kartenterminal-API, Compliance                                                                                 |
| **API (Skizze)** | `POST /api/v1/identity/egk-lookup` in [`../architecture/apis.md`](../architecture/apis.md) — **kein** produktiver Lookup-Endpoint |

Ops-Toggle/`terminalAuthEgkEnabled` und Flow-Texte beschreiben das Zielbild; produktives TI/eGK ist bewusst Abgrenzung ([`product.md`](../product.md)).

## 5. Verweise

| Thema                          | Dokument                                                                       |
| ------------------------------ | ------------------------------------------------------------------------------ |
| Fachliche Abläufe              | [`../flows.md`](../flows.md)                                                   |
| Produkt-Abgrenzung             | [`../product.md`](../product.md)                                               |
| API / OpenAPI                  | [`../architecture/apis.md`](../architecture/apis.md), `openapi/`               |
| Captive-Lab                    | [`../archive/gateway-captive-portal.md`](../archive/gateway-captive-portal.md) |
| Docs-Übersicht „nicht Produkt“ | [`../README.md`](../README.md)                                                 |
