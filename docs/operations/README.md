# Betrieb & Installation

Eine Installation = **eine Praxis**, ein Stack auf einem Host. Operative Hülle: **Praxis Flow Manager** (Setup-API). CLI/`docker compose` nur Support-Fallback.

Technik/Internals: [`../architecture/`](../architecture/) · Manager-UI: [`../../manager/README.md`](../../manager/README.md)

## Roter Faden (Lifecycle)

```text
1. Ausliefern     Artefakte, Versionen
2. Erstinstall    Wizard → Images → Compose up
3. Betreiben      Start/Stop, Health, Volumes, Tagesreset
4. Proxy / TLS    Port 80, LAN-HTTPS (Produkt)
5. Sichern        .pfbackup (+ TLS-Sidecar-Grenze)
6. Aktualisieren  .pfupdate (Fresh-DB + Settings wie Restore)
7. Anbinden       SMS / CSV / Portal-Hook vs. Nicht-Ziele
```

| Schritt       | Dokument                                                           | Status                                                    |
| ------------- | ------------------------------------------------------------------ | --------------------------------------------------------- |
| 1–2, 6        | [`delivery.md`](delivery.md)                                       | ausgearbeitet (Prinzip → Install → Update → Build)        |
| 3             | [`runtime.md`](runtime.md)                                         | ausgearbeitet (Services → Compose → Ports → Alltag)       |
| 4             | [`tls.md`](tls.md)                                                 | ausgearbeitet (§1–10 Ops-Ist LAN-TLS)                     |
| 5 (+ Cutover) | [`backup.md`](backup.md)                                           | ausgearbeitet (Prinzip → Artefakt → TLS-Grenze → Cutover) |
| 7             | [`integrations.md`](integrations.md)                               | ausgearbeitet (WLAN/SMS/CSV/eGK + Verweise)               |
| 7 (Plan)      | [`praxis-it-network-isolation.md`](praxis-it-network-isolation.md) | IT-Hinweise zur geplanten Portal-Netzgrenze               |

**Status:** Lifecycle-Dokumente ausgearbeitet. Pläne (`plan-proxy-tls*`, `plan-backup-v2`) bleiben Historie/Entwurf — nicht parallel als Ops-SoT.

## Nicht hier

- Fachliche Patienten-/MFA-Abläufe → [`../flows.md`](../flows.md)
- API/SSE/Domain → [`../architecture/`](../architecture/)
- Backup v2-Entwurf → [`../plan-backup-v2.md`](../plan-backup-v2.md)
- TLS-Lab (Pebble) → [`../archive/tls-lab.md`](../archive/tls-lab.md)
