# Bewusste Modulgrenzen

Konsolidierter Entscheidungsstand, 2026-09-30. Diese Begründungen ersetzen die
OK-Liste des abgeschlossenen Altlasten-Audits. Ähnlicher Code ist allein kein
Grund für eine gemeinsame Abstraktion.

| Grenze                           | Begründung                                                                                                                                                                                                                                                        |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Generierte App-/UI-OpenAPI-Typen | Getrennte Consumer und Build-Grenzen; gemeinsame Quelle sind YAML und Codegen-/Drift-Prüfungen, kein zusätzliches Generated-Package.                                                                                                                              |
| Raumkapazitäts-Adapter           | Fachlogik in `@praxis-flow/domain`; App/UI adaptieren verschiedene Datenformen und behalten ihre Validierungs-/Darstellungsaufgaben.                                                                                                                              |
| Lokale Domain-Re-Exports         | Stabilisieren interne Importgrenzen. Direkte Workspace-Imports sind keine allgemeine Ersatzregel.                                                                                                                                                                 |
| Expiry-Timer                     | Terminal-Assist und Recall haben unterschiedliche Ablaufaktionen, Datenquellen und Resync-Regeln. Erst bei gemeinsamem Verhalten abstrahieren.                                                                                                                    |
| Aufruf-Erreichbarkeit            | Backend entscheidet anhand autoritativer Presence; UI zeigt Hinweise aus dem SSE-Zustand. Beide Prüfungen haben einen eigenen Zweck.                                                                                                                              |
| Restore-/Update-Fortschritt      | Gemeinsamer Cutover, aber unterschiedliche öffentliche Fortschrittsbegriffe. Kleine explizite Projektionen bleiben nachvollziehbar.                                                                                                                               |
| Dev-/Delivery-Proxy-Compose      | Getrennte Dateinamen sind Teil von Auswahl und Packaging. Gemeinsame Verhaltensänderungen an beiden Varianten prüfen; kein Zusammenlegen allein wegen ähnlichem YAML.                                                                                             |
| Root-Suche in Setup/Manager      | Setup darf ohne Repository laufen; Manager braucht Repo-Suche nur im Dev-Pfad. Keine gegenseitige Library-Abhängigkeit für kleine Host-Helfer.                                                                                                                    |
| Release-Skripte                  | CLI-Abläufe bleiben getrennt. App-Build-Argumente und Proxy-Image-Vorbereitung sind bereits in `scripts/release-app-image.mjs` und `scripts/release-proxy-image.mjs` geteilt; weitere Abstraktion braucht gemeinsamen Vertrag, nicht nur ähnliche Prozessaufrufe. |

Produktentscheidungen stehen bei ihren jeweiligen Verträgen: [API/Auth](apis.md),
[Echtzeit](realtime.md), [Betriebsmodi](manager-operating-modes.md) und
[Betriebsdokumentation](../operations/README.md).

Windows-Vorbereitung (2026-09-30): Plattformdetails bleiben an Prozess-, Docker-
und Dateisystemgrenzen (`process-command`, `docker-cli`, `maintenance-files`,
`windows-host-path`). Keine allgemeine Betriebssystemabstraktion. NSIS x64
und privates Benutzer-Home sind vom Docker-Datenlebenszyklus getrennt.
Bestehende macOS-Defaults bleiben erhalten. Restricted-Plattformfreigabe ist
weiterhin ein eigener Netzwerknachweis; [Audit und Betrieb](../operations/delivery.md#8-windows-vorbereitung-2026-09-30-noch-keine-plattformfreigabe).
