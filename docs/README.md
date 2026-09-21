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

## Produkt & Abläufe

| Datei                      | Inhalt                                     |
| -------------------------- | ------------------------------------------ |
| [`product.md`](product.md) | Was wir sind / nicht sind, Abgrenzungen    |
| [`flows.md`](flows.md)     | Patienten- und MFA-Abläufe; Betrieb-Rahmen |

## Architektur · Betrieb

| Ordner                                         | Für wen                                        | Einstieg                                           |
| ---------------------------------------------- | ---------------------------------------------- | -------------------------------------------------- |
| [`architecture/`](architecture/)               | Entwickler — wie es intern funktioniert        | [`architecture/README.md`](architecture/README.md) |
| [`operations/`](operations/)                   | IT / Release — Install, Compose, TLS, Backup   | [`operations/README.md`](operations/README.md)     |
| [`../manager/README.md`](../manager/README.md) | Manager (Electron): Wizard, Setup-API, Wartung | —                                                  |

## Plattformstatus und offene Abnahme

Der aktuelle Betriebsvertrag steht unter [`operations/`](operations/);
abgeschlossene Implementierungspläne und Labs liegen im
[`Archiv`](archive/README.md). Für das Portal bleibt es bewusst bei einem
gemeinsamen Frontend- und App-Stack. Die Sicherheitsgrenze bilden die
Restricted-Proxy-Positivliste und die serverseitige API-Autorisierung.

Die bisherige praktische Freigabe für explizite Staff-/Restricted-Bindings
bezieht sich auf die dokumentierte macOS-/Docker-Desktop-Kombination. Vor einer
Windows-Freigabe müssen noch nachgezogen werden:

- Windows-Manager paketieren und installieren; unterstützte Windows- und
  Docker-Desktop-Mindestversionen festlegen;
- spezifische Host-IP-Publishes mit gleichzeitigem Staff- und
  Restricted-Listener auf Port 443 nachweisen;
- von getrennten Geräten beziehungsweise Netzen Staff positiv sowie
  Kreuzzugriffe, globale Bindings und IPv6 negativ prüfen;
- Docker-Neustart, Host-Reboot, Adressverlust und Repair mit aktivem TLS
  einschließlich Fail-closed-Verhalten abnehmen;
- Update, Restore und Rollback auf derselben Plattform prüfen und das Ergebnis
  als Windows-Release-Gate automatisieren.

## API-Vertrag

**Source of Truth:** `openapi/*.yaml` → `npm run generate:api` → Fastify-Schemas + TS-Typen.

- Swagger UI (Dev): `http://localhost:8080/api/docs`
- Bundle: `openapi/bundle.json`
- Rollen/Regeln: [`architecture/apis.md`](architecture/apis.md)
