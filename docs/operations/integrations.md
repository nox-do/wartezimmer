# Integrationen — Grenzen

Stand: 2026-09-04 · Abgleich [`product.md`](../product.md), Code/Manager, Archive

**Scope:** Was Praxis Flow anbindet oder bewusst **nicht** ist.  
Status: **implementiert** · **geplant** · **Discovery**

Nicht: LAN-TLS/Proxy → [`tls.md`](tls.md) · Compose-Alltag → [`runtime.md`](runtime.md)

## 1. Guest-WLAN / Captive — Grenze + später Adapter

|                       |                                                                                                                                                                                                                                                                                   |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Wir liefern**       | Portal-UI (`/portal/*`), Wartenummer-Prüfung, Session-API                                                                                                                                                                                                                         |
| **Wir liefern nicht** | Router, AP, Captive-Hardware, eigenen Captive-Datenpfad (DHCP/Firewall/`ndsctl`)                                                                                                                                                                                                  |
| **Später (nicht v1)** | Erweiterbare Liste **schlanker** Captive-Adapter (von uns gepflegt) mit **Auswahl im Manager**; Praxis-IT bleibt Betreiber von AP/Controller                                                                                                                                      |
| **Session-Hooks**     | `sessions/captive-authorize` (Portal → App; `wlanAuthorized` immer `false` bis Adapter), `sessions/verify-ticket-code` (S2S Bearer `AUTH_KEY_CAPTIVE` / Rolle `captive`)                                                                                                          |
| **Manager heute**     | Gateway stets `enabled: false` (`DISABLED_GATEWAY_PLAN`); Fokus Restricted-Netz / Portal-URL — kein Captive-Wizard in Portal-v1                                                                                                                                                   |
| **Lab**               | openNDS-Gateway-Stack **entfernt** aus dem Repo (Compose/`gateway/`); Historie: [`../archive/gateway-captive-portal.md`](../archive/gateway-captive-portal.md); Adapter-Entwurf: [`../archive/roadmap-captive-portal-adapters.md`](../archive/roadmap-captive-portal-adapters.md) |

WLAN-Hardware bleibt Praxis-IT. Internet-Portal/Whitelist = **nicht Produkt** (Outlook).
Restricted-IP-/Listener-Grenze (Portal-v1) ist davon getrennt:
[`plan-portal-lan-isolation.md`](../plan-portal-lan-isolation.md) und
[`plan-manager-restricted-network-access.md`](../plan-manager-restricted-network-access.md).

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

| Thema                          | Dokument                                                                                                                                                                         |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fachliche Abläufe              | [`../flows.md`](../flows.md)                                                                                                                                                     |
| Produkt-Abgrenzung             | [`../product.md`](../product.md)                                                                                                                                                 |
| API / OpenAPI                  | [`../architecture/apis.md`](../architecture/apis.md), `openapi/`                                                                                                                 |
| Captive-Lab / Adapter-Entwurf  | [`../archive/gateway-captive-portal.md`](../archive/gateway-captive-portal.md), [`../archive/roadmap-captive-portal-adapters.md`](../archive/roadmap-captive-portal-adapters.md) |
| Docs-Übersicht „nicht Produkt“ | [`../README.md`](../README.md)                                                                                                                                                   |
