# Dokumentation — Einstieg

Kurzüberblick: **was wann lesen**. Technische Details stehen in den verlinkten Dateien — nicht alles auf einmal.

## Produktstand

Kein öffentliches Store-Release. Auslieferung über versionierte Images, Manager und `.pfupdate`.

| Rolle                | Start hier                                                                    |
| -------------------- | ----------------------------------------------------------------------------- |
| **IT in der Praxis** | [`operations/`](operations/) → [`../manager/README.md`](../manager/README.md) |
| **Fachlichkeit**     | [`product.md`](product.md) → [`flows.md`](flows.md)                           |
| **Entwickler**       | [`architecture/`](architecture/) · [`operations/`](operations/)               |

**Im Produkt:** Terminal, MFA, TV, Raum-Panel, Portal (LAN), Manager, optional HTTP-Proxy Port 80, **LAN-TLS/443**, Backup/Restore, `.pfupdate`.

**Nicht Produkt (weiterhin):** eGK-Hardware, PVS-Vendor-Adapter, Captive-/Gateway-Produkt, Internet-Portal (Whitelist), Manager-Auto-Update.

LAN-TLS: [`operations/tls.md`](operations/tls.md).

## Lizenz

Die eigene [Wartezimmer-Lizenz, Version 1.1](../LICENSE) erlaubt kostenlose Nutzung
und interne Anpassung für den eigenen Betrieb sowie beauftragte IT-Leistungen.
Öffentliche Softwareangebote bleiben den offiziellen Bezugsquellen vorbehalten,
mit der geregelten Ausnahme für GitHub-Plattformrechte, Forks, Quellcodearchive und
Projektbeiträge. Unveränderte Fassungen dürfen kostenlos und nichtöffentlich
unmittelbar an einzelne Empfänger weitergegeben werden. Weitere Downloadangebote,
sonstige Weitergabe angepasster Fassungen und fremde Softwareprodukte oder
Softwaredienste benötigen eine gesonderte Erlaubnis, auch bei kostenlosen Angeboten.
Details und Ausnahmen regelt die Lizenz. Das Projekt ist Source-available.

## Produkt & Abläufe

| Datei                      | Inhalt                                     |
| -------------------------- | ------------------------------------------ |
| [`product.md`](product.md) | Produktumfang und Abgrenzungen             |
| [`flows.md`](flows.md)     | Patienten- und MFA-Abläufe; Betrieb-Rahmen |

Geplant: [PVS-Patientenzuordnung und Dokumentübergabe](pvs-plan.md) (fachlicher Entwurf).

## Architektur · Betrieb

| Ordner                                         | Für wen                                        | Einstieg                                           |
| ---------------------------------------------- | ---------------------------------------------- | -------------------------------------------------- |
| [`architecture/`](architecture/)               | Entwickler — wie es intern funktioniert        | [`architecture/README.md`](architecture/README.md) |
| [`operations/`](operations/)                   | IT / Release — Install, Compose, TLS, Backup   | [`operations/README.md`](operations/README.md)     |
| [`../manager/README.md`](../manager/README.md) | Manager (Electron): Wizard, Setup-API, Wartung | —                                                  |

## Betrieb und Entwicklung

Installation, Netzwerk, TLS und Wiederherstellung beschreibt die
[Betriebsdokumentation](operations/README.md). Plattformvoraussetzungen und
Paketformate stehen in der [Manager-Dokumentation](../manager/README.md).
Die Netztrennung ist nach jeder Installation im konkreten Praxisnetz zu prüfen.

Portal und Staff verwenden denselben Frontend- und App-Stack. Die Zugangsgrenze
bilden die Restricted-Proxy-Positivliste und die serverseitige API-Autorisierung.

Für lokale Tests stehen [Entwicklerwerkzeuge](development/README.md) bereit.
Frühere Entwürfe und Website-Stände liegen im [Archiv](archive/README.md).

## API-Vertrag

**Source of Truth:** `openapi/*.yaml` → `npm run generate:api` → Fastify-Schemas + TS-Typen.

- Swagger UI (Dev): `http://localhost:8080/api/docs`
- Bundle: `openapi/bundle.json`
- Rollen/Regeln: [`architecture/apis.md`](architecture/apis.md)
