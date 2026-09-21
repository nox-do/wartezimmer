# Archiv

Historische Pläne und Arbeitsstände. **Nicht fortschreiben.** Geltende Specs liegen eine Ebene höher unter `docs/`.

| Datei                                                                                          | Warum hier                                                                                                              |
| ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| [`plan-auth-session-slots.md`](plan-auth-session-slots.md)                                     | Auth-Slots umgesetzt. Vertrag: [`../architecture/apis.md`](../architecture/apis.md), `openapi/auth.yaml`                |
| [`plan-manager-https.md`](plan-manager-https.md)                                               | HTTPS-UI-Aufräumen erledigt. Ops-Ist: [`../operations/tls.md`](../operations/tls.md)                                    |
| [`plan-proxy-tls.md`](plan-proxy-tls.md)                                                       | Historischer TLS-Ausgangsplan. Wildcard-Ist: [`../operations/tls.md`](../operations/tls.md)                             |
| [`plan-proxy-tls-manager.md`](plan-proxy-tls-manager.md)                                       | Historischer Manager-TLS-Plan; HTTPS lebt heute ausschließlich im Netzwerk-Tab                                          |
| [`plan-backup-v2.md`](plan-backup-v2.md)                                                       | Format 2 umgesetzt. Vertrag: [`../operations/backup.md`](../operations/backup.md)                                       |
| [`plan-reinstall-recovery.md`](plan-reinstall-recovery.md)                                     | Reinstall-Recovery umgesetzt. Vertrag: [`../operations/reinstall-recovery.md`](../operations/reinstall-recovery.md)     |
| [`reinstall-recovery-implementation-prompts.md`](reinstall-recovery-implementation-prompts.md) | Abgearbeitete Implementierungspakete für Reinstall-Recovery                                                             |
| [`plan-routing-mode-ops-settings.md`](plan-routing-mode-ops-settings.md)                       | Routing-Konfiguration nach Ops verschoben. Ist: [`../architecture/routing.md`](../architecture/routing.md)              |
| [`todo-2026-08-31--09-04.md`](todo-2026-08-31--09-04.md)                                       | Historisches Arbeitsjournal; keine aktuelle Aufgabenliste                                                               |
| [`gateway-captive-portal.md`](gateway-captive-portal.md)                                       | openNDS-Lab (Stack 2026-09 aus Repo entfernt). Grenze: [`../operations/integrations.md`](../operations/integrations.md) |
| [`roadmap-captive-portal-adapters.md`](roadmap-captive-portal-adapters.md)                     | Captive-Adapter-Entwurf (nicht v1). Ist-Grenze: [`../operations/integrations.md`](../operations/integrations.md)        |
| [`audit-dopplungen-altlasten.md`](audit-dopplungen-altlasten.md)                               | Zweite Audit-Welle abgeschlossen; OK-Liste gegen Drive-by-Refactors                                                     |
| [`tls-lab.md`](tls-lab.md)                                                                     | Opt-in Pebble/acme-dns/CoreDNS-Lab (Smoke/`docker-compose.tls-lab*.yml` bleiben)                                        |
