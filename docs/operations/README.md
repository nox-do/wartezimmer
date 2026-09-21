# Betrieb & Installation

Eine Installation = **eine Praxis**, ein Stack auf einem Host. Operative Hülle: **Praxis Flow Manager** (Setup-API). CLI/`docker compose` nur Support-Fallback.

Technik/Internals: [`../architecture/`](../architecture/) · Manager-UI: [`../../manager/README.md`](../../manager/README.md)

## Roter Faden (Lifecycle)

```text
1. Ausliefern     Artefakte, Versionen
2. Erstinstall    Wizard → Images → Compose up
3. Betreiben      Start/Stop, Health, Volumes, Tagesreset
4. Proxy / TLS    Port 80, LAN-HTTPS (Produkt)
5. Sichern        eine .pfbackup v2 inkl. optional eingebettetem TLS-Archiv
6. Aktualisieren  .pfupdate (Fresh-DB + Settings wie Restore)
7. Anbinden       SMS / CSV / Portal-Hook vs. Nicht-Ziele
```

| Schritt       | Dokument                                                           | Status                                                    |
| ------------- | ------------------------------------------------------------------ | --------------------------------------------------------- |
| 1–2, 6        | [`delivery.md`](delivery.md)                                       | ausgearbeitet (Prinzip → Install → Update → Build)        |
| 3             | [`runtime.md`](runtime.md)                                         | ausgearbeitet inkl. Demo-/Proxy-Binding-Vertrag           |
| 4             | [`tls.md`](tls.md)                                                 | ausgearbeitet inkl. explizitem Proxy-Staff-Binding        |
| 5 (+ Cutover) | [`backup.md`](backup.md)                                           | ausgearbeitet (Prinzip → Artefakt → TLS-Grenze → Cutover) |
| 7             | [`integrations.md`](integrations.md)                               | ausgearbeitet (WLAN/SMS/CSV/eGK + Verweise)               |
| 7 (Netz)      | [`praxis-it-network-isolation.md`](praxis-it-network-isolation.md) | Restricted-Grenze, Praxis-IT-Verantwortung und Abnahme    |

**Status:** Die Lifecycle-Dokumente sind die geltende Betriebsdokumentation.
Abgeschlossene TLS-, Backup- und Recovery-Pläne liegen nur noch im
[`Archiv`](../archive/README.md) und sind keine parallele Source of Truth.

## Nicht hier

- Fachliche Patienten-/MFA-Abläufe → [`../flows.md`](../flows.md)
- API/SSE/Domain → [`../architecture/`](../architecture/)
- Reinstall/Recovery → [`reinstall-recovery.md`](reinstall-recovery.md)
- TLS-Lab (Pebble) → [`../archive/tls-lab.md`](../archive/tls-lab.md)
