# Roadmap

Vom Pitch zur lauffähigen Installation — Detailstand in [`todo.md`](../todo.md).

## Phasen

| Phase             | Inhalt                       | Status                                         |
| ----------------- | ---------------------------- | ---------------------------------------------- |
| **1 Workflows**   | Screens, Regeln, Fehlerfälle | Runtime-UI deckt Happy Paths; frühe Mocks in Git-History |
| **2 Architektur** | Komponenten, APIs, Events    | dokumentiert (`architecture.md`, `apis.md`)    |
| **3 Integration** | eGK, PVS                     | offen · Gateway-Scaffold vorhanden             |
| **4 Solution**    | Code, Docker, Betrieb        | laufend (`app`, `ui`, `sandbox`)               |

## Vier Flows

```text
Flow 1  Terminal (Check-in)     →  Warteschlange
Flow 2  Portal (WLAN optional)  →  Upload / Anamnese
Flow 3  MFA                     →  Queue, Dokumente, Aufruf
Flow 4  TV                      →  Warten + „Bitte weiter zu …“
Addon   Raum-Panel              →  Orientierung + optionale Ankunft
```

Fachdetail: [`flows.md`](flows.md)

## Runtime-UI (Stand)

| Route         | Stand                                            |
| ------------- | ------------------------------------------------ |
| `/terminal/*` | Phone/DOB, Themen, eGK-Stub, Notfall, Sperre     |
| `/portal/*`   | Wartenummer, Upload, Anamnese, Captive-Hooks     |
| `/mfa/*`      | SSE-Queue, Dokumente, Pairing, Notfall, Settings |
| `/tv`         | SSE, Chime, Pagination                           |

Backend deckt mehr ab als die UI (Identity-Detail, Day-Close-UI, eGK).

## v1-Entscheidungen (fix)

- Portal: Wartenummer ohne 2FA; eine aktive Session pro Ticket
- Tagesreset: MFA „Tag neu starten“ (`day-lifecycle/reset`); Day-Close-API ohne UI
- Rückhol-Fenster: `returnWindowMinutes` (Default 15 Min), danach auto `waiting`
- Überlast: MFA steuert (Terminal sperren + Empfang), kein Terminal-3-Optionen-Flow
- Raum-Panel: Orientierung zuerst; Ankunft/Fertig optional pro Raum — [`plan-room-panel.md`](plan-room-panel.md)
- eGK/PVS: Phase 3, nicht Beta-Blocker

## Nächste Schritte

1. Terminal-Sonderfälle sauber zum Empfang führen
2. Raum-Panel — [`plan-room-panel.md`](plan-room-panel.md)
3. Gateway-Feldtest (Linux + Gast-NIC)
4. eGK/PVS — [`integrations.md`](integrations.md)
5. Proxy + TLS — [`plan-proxy-container.md`](plan-proxy-container.md)
6. Manager Phase 4: Installer / Auto-Update
