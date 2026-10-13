# Architektur (Entwickler)

Wie Wartezimmer **technisch intern** aufgebaut ist.
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

| Thema         | Dokument                                       |
| ------------- | ---------------------------------------------- |
| System        | [Systemarchitektur](system.md)                 |
| Domäne        | [Domänenmodell](domain.md)                     |
| Routing       | [Routing](routing.md)                          |
| API und Auth  | [API und Zugriffsregeln](apis.md)              |
| Echtzeit      | [SSE und Presence](realtime.md)                |
| Dokumente     | [Dokumentverarbeitung](documents.md)           |
| Übersetzungen | [i18n](i18n.md)                                |
| Logging       | [Logger und Datenschutz](logging.md)           |
| Transaktionen | [Host und Flow-Core](transaction-ownership.md) |

API-Vertrag (maschinenlesbar): `openapi/*.yaml` → `npm run generate:api` · Swagger Dev: `/api/docs`

Manager: [Betriebsmodi und Action-Policy (Ist-Stand)](manager-operating-modes.md).

## Nicht hier

| Thema                         | Wohin                                                            |
| ----------------------------- | ---------------------------------------------------------------- |
| Install, Compose, TLS, Backup | [`../operations/`](../operations/)                               |
| Patienten-/MFA-Abläufe        | [`../flows.md`](../flows.md)                                     |
| Endpoint-Listen               | `openapi/`                                                       |
| Captive/SMS/CSV-Grenzen       | [`../operations/integrations.md`](../operations/integrations.md) |
