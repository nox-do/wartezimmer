# Architektur (Entwickler)

Wie Praxis Flow **technisch intern** aufgebaut ist.  
Betrieb: [`../operations/`](../operations/) · Produkt/Abläufe: [`../product.md`](../product.md), [`../flows.md`](../flows.md)

## Roter Faden

```text
1. System           Container, Module, Persistenz, Schutzklassen
2. Domäne           Nummernkreis / Thema / Raum; Catalog-Wahrheit
3. Routing          simple/complex, Rules, Journeys, Redirect
4. API & Auth       Rollen, fachliche Regeln (Vertrag: OpenAPI)
5. Echtzeit         SSE; Outbox vs. Push
6. Dokumente        Sandbox + Anamnese-Vorlagen
7. UI-Konventionen  i18n Patienten vs. Staff
8. Logging          Pino-Root, wer welchen Logger nutzt
```

| Schritt | Dokument                       | Status        |
| ------- | ------------------------------ | ------------- |
| 1       | [`system.md`](system.md)       | ausgearbeitet |
| 2       | [`domain.md`](domain.md)       | ausgearbeitet |
| 3       | [`routing.md`](routing.md)     | ausgearbeitet |
| 4       | [`apis.md`](apis.md)           | ausgearbeitet |
| 5       | [`realtime.md`](realtime.md)   | ausgearbeitet |
| 6       | [`documents.md`](documents.md) | ausgearbeitet |
| 7       | [`i18n.md`](i18n.md)           | ausgearbeitet |
| 8       | [`logging.md`](logging.md)     | ausgearbeitet |

**Stil:** Implementationsdokumente beschreiben den Ist-Stand. Verbindliche
Architekturentscheidungen dürfen ein ausdrücklich gekennzeichnetes Zielmodell
festlegen; sonstiger Ausblick bleibt Nicht-Produkt oder Discovery.

API-Vertrag (maschinenlesbar): `openapi/*.yaml` → `npm run generate:api` · Swagger Dev: `/api/docs`

Manager: [Betriebsmodi und Action-Policy (Ist-Stand)](manager-operating-modes.md).

## Nicht hier

| Thema                         | Wohin                                                            |
| ----------------------------- | ---------------------------------------------------------------- |
| Install, Compose, TLS, Backup | [`../operations/`](../operations/)                               |
| Patienten-/MFA-Abläufe        | [`../flows.md`](../flows.md)                                     |
| Endpoint-Listen               | `openapi/`                                                       |
| Captive/SMS/CSV-Grenzen       | [`../operations/integrations.md`](../operations/integrations.md) |
