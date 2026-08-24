# Roadmap

Vom Pitch zum **Kunden-Test** — danach erst öffentliches Release. Einstieg nach Rolle: [`README.md`](README.md).

## Kunden-Test (jetzt)

Was eine Praxis vor Ort prüfen soll:

| Dabei                                                                 | Nicht dabei                                    |
| --------------------------------------------------------------------- | ---------------------------------------------- |
| Terminal, MFA, TV, Raum-Panel, Portal im **LAN**                      | eGK, PVS-Adapter, Captive-/Gateway-Produkt     |
| Manager: Install, Status, Netzwerk, Backup, Update (`.pfupdate`)      | Manager-Auto-Update / Signatur / Notarisierung |
| Optional HTTP-Proxy Port 80                                           | TLS/443, Internet-Portal (Whitelist)           |
| Simple Routing (Default); Complex/Journeys soweit in der UI vorhanden | Lizenzpflicht Complex                          |
| SMS-Rückholen (`seven.io` / mock)                                     | WhatsApp-Pflicht, Messenger-Produkt            |

Install und Update: [`delivery.md`](delivery.md) · Betrieb: [`deployment-docker.md`](deployment-docker.md) · Abläufe: [`flows.md`](flows.md)

## Phasen

| Phase             | Inhalt                       | Status                                                    |
| ----------------- | ---------------------------- | --------------------------------------------------------- |
| **1 Workflows**   | Screens, Regeln, Fehlerfälle | Runtime-UI deckt Happy Paths                              |
| **2 Architektur** | Komponenten, APIs, Events    | dokumentiert (`architecture.md`, `apis.md`)               |
| **3 Integration** | eGK, PVS, WLAN-Adapter       | **nicht** Kunden-Test · Captive-Hardware nicht im Produkt |
| **4 Solution**    | Code, Docker, Betrieb        | Kunden-Test über Manager + Delivery-Images                |

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

| Route         | Stand                                               |
| ------------- | --------------------------------------------------- |
| `/terminal/*` | Phone/DOB, Themen, eGK-Stub, Notfall, Sperre        |
| `/portal/*`   | Wartenummer, Upload, Anamnese, Captive-Hooks        |
| `/mfa/*`      | SSE-Queue, Dokumente, Pairing, Notfall, Settings    |
| `/tv`         | SSE, Chime, Pagination                              |
| `/room-panel` | Login pro Placement, Snapshot-Actions, Aufruf-Liste |

Backend deckt mehr ab als die UI (Identity-Detail, Day-Close-UI, eGK).

## v1-Entscheidungen (fix)

- Portal: Wartenummer ohne 2FA; eine aktive Session pro Ticket
- Tagesreset: MFA „Tag neu starten“ (`day-lifecycle/reset`); Day-Close-API ohne UI
- Rückhol-Fenster: `returnWindowMinutes` (Default 15 Min), danach auto `waiting`
- Überlast: MFA steuert (Terminal sperren + Empfang), kein Terminal-3-Optionen-Flow
- Raum-Panel: dual Placement (Tür / im Raum), Settings in MFA, Live-UI — [`flows.md`](flows.md) § Flow 5
- eGK/PVS: Phase 3, nicht Kunden-Test-Blocker
- HTTP-Proxy Port 80: optional, umgesetzt; TLS und externes Portal: **nach** dem Kunden-Test

## Danach (nicht Test-Blocker)

1. Terminal-Sonderfälle sauber zum Empfang führen
2. TLS + optionales Internet-Portal — [`plan-proxy-tls.md`](plan-proxy-tls.md)
3. eGK/PVS — [`integrations.md`](integrations.md)
4. Manager: Signatur / Auto-Update
5. Vendor-Adapter Captive (Praxis-IT bleibt Eigentümer des WLANs)
