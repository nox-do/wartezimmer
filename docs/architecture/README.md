# Architektur (Entwickler)

Wie Praxis Flow **technisch intern** aufgebaut ist.  
Betrieb: [`../operations/`](../operations/) · Produkt/Abläufe: [`../product.md`](../product.md), [`../flows.md`](../flows.md)

## Roter Faden

```text
1. System           Container, Module, Persistenz, Schutzklassen
2. Domäne           Nummernkreis / Thema / Raum; Catalog-Wahrheit
3. API & Auth       Rollen, fachliche Regeln (Vertrag: OpenAPI)
4. Echtzeit         SSE; Outbox vs. Push
5. Dokumente        Sandbox + Anamnese-Vorlagen
6. UI-Konventionen  i18n Patienten vs. Staff
7. Logging          Pino-Root, wer welchen Logger nutzt
```

| Schritt | Dokument                       | Status        |
| ------- | ------------------------------ | ------------- |
| 1       | [`system.md`](system.md)       | ausgearbeitet |
| 2       | [`domain.md`](domain.md)       | ausgearbeitet |
| 3       | [`apis.md`](apis.md)           | ausgearbeitet |
| 4       | [`realtime.md`](realtime.md)   | ausgearbeitet |
| 5       | [`documents.md`](documents.md) | ausgearbeitet |
| 6       | [`i18n.md`](i18n.md)           | ausgearbeitet |
| 7       | [`logging.md`](logging.md)     | ausgearbeitet |

**Stil:** Ist-Stand formulieren — kein „Zielbild“/„Leitdokument“ für Umgesetztes; Ausblick nur als Nicht-Produkt oder Discovery.

API-Vertrag (maschinenlesbar): `openapi/*.yaml` → `npm run generate:api` · Swagger Dev: `/api/docs`

## Nicht hier

| Thema                         | Wohin                                                            |
| ----------------------------- | ---------------------------------------------------------------- |
| Install, Compose, TLS, Backup | [`../operations/`](../operations/)                               |
| Patienten-/MFA-Abläufe        | [`../flows.md`](../flows.md)                                     |
| Endpoint-Listen               | `openapi/`                                                       |
| Captive/SMS/CSV-Grenzen       | [`../operations/integrations.md`](../operations/integrations.md) |
