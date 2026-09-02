# Dokumentation — Einstieg

Kurzüberblick: **was wann lesen**. Technische Details stehen in den verlinkten Dateien — nicht alles auf einmal.

## Produktstand

Kein öffentliches Store-Release. Auslieferung über versionierte Images, Manager und `.pfupdate`.

| Rolle | Start hier |
| --- | --- |
| **IT in der Praxis** | [`operations/`](operations/) → [`../manager/README.md`](../manager/README.md) |
| **Fachlichkeit** | [`product.md`](product.md) → [`flows.md`](flows.md) |
| **Entwickler** | [`architecture/`](architecture/) · [`operations/`](operations/) |

**Im Produkt:** Terminal, MFA, TV, Raum-Panel, Portal (LAN), Manager, optional HTTP-Proxy Port 80, **LAN-TLS/443**, Backup/Restore, `.pfupdate`.

**Nicht Produkt (weiterhin):** eGK-Hardware, PVS-Vendor-Adapter, Captive-/Gateway-Produkt, Internet-Portal (Whitelist), Manager-Auto-Update.

LAN-TLS: [`operations/tls.md`](operations/tls.md).

## Produkt & Abläufe

| Datei | Inhalt |
| --- | --- |
| [`product.md`](product.md) | Was wir sind / nicht sind, Abgrenzungen |
| [`flows.md`](flows.md) | Patienten- und MFA-Abläufe; Betrieb-Rahmen |

## Architektur · Betrieb

| Ordner | Für wen | Einstieg |
| --- | --- | --- |
| [`architecture/`](architecture/) | Entwickler — wie es intern funktioniert | [`architecture/README.md`](architecture/README.md) |
| [`operations/`](operations/) | IT / Release — Install, Compose, TLS, Backup | [`operations/README.md`](operations/README.md) |
| [`../manager/README.md`](../manager/README.md) | Manager (Electron): Wizard, Setup-API, Wartung | — |

## Intern — Pläne

Arbeitsstände und Entwürfe. Historie: [`archive/README.md`](archive/README.md).  
TLS-Ops-Ist: [`operations/tls.md`](operations/tls.md) — die TLS-Pläne unten sind Quellen bis zur Einarbeitung.

| Datei | Inhalt |
| --- | --- |
| [`../todo.md`](../todo.md) | Aktuelle Arbeitsliste (intern) |
| [`plan-proxy-tls.md`](plan-proxy-tls.md) | LAN-TLS — Architektur (Quelle → `operations/tls.md`) |
| [`plan-proxy-tls-manager.md`](plan-proxy-tls-manager.md) | Manager-UX TLS (Quelle → `operations/tls.md`) |
| [`plan-manager-https.md`](plan-manager-https.md) | Manager HTTPS aufräumen |
| [`plan-manager-installer-cleanup.md`](plan-manager-installer-cleanup.md) | Manager Renderer: Wartung-Mutex, Generation |
| [`plan-backup-v2.md`](plan-backup-v2.md) | `.pfbackup` v2 (Entwurf) |
| [`plan-device-authorizations.md`](plan-device-authorizations.md) | TV/Terminal/Room-Panel: persistente Gerätefreigaben (Festgeschrieben) |
| [`plan-portal-lan-isolation.md`](plan-portal-lan-isolation.md) | Discovery: Portal vs. Staff-URLs im Fritzbox-LAN (kein Beschluss) |
| [`archive/README.md`](archive/README.md) | Auth-Slots, Gateway-Lab, Audit-OK-Liste, TLS-Lab |

## API-Vertrag

**Source of Truth:** `openapi/*.yaml` → `npm run generate:api` → Fastify-Schemas + TS-Typen.

- Swagger UI (Dev): `http://localhost:8080/api/docs`
- Bundle: `openapi/bundle.json`
- Rollen/Regeln: [`architecture/apis.md`](architecture/apis.md)
