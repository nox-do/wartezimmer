# Catalog-Wahrheit — `ops_settings` als Quelle

Stand: 2026-07-12 · Schritt 2 des Upgrade-/Backup-Vertrags

Siehe auch: [`settings-backup-classification.md`](settings-backup-classification.md)

---

## Regel

| Was               | Wahrheit                             | Wer schreibt                           |
| ----------------- | ------------------------------------ | -------------------------------------- |
| Themen            | `ops_settings.topic_settings_json`   | Ops-API → `updateOpsSettings`          |
| Räume             | `ops_settings.rooms_json`            | Ops-API → `updateOpsSettings`          |
| Journeys          | `ops_settings.journey_settings_json` | Ops-API → `updateOpsSettings`          |
| Routing-Modus     | `ops_settings.routing_mode`          | Ops-API → `updateOpsSettings`          |
| flow-core-Catalog | **Projektion**                       | **Nur** `syncCatalogFromOpsSettings()` |

**Produktions-App:** Keine direkten `INSERT`/`UPDATE`/`DELETE` auf Catalog-Tabellen außerhalb des Sync-Moduls.

**Manager / Setup:** Keine fachlichen SQLite-Writes — nur `.env`, Container, Dateien.

**Backup/Restore:** Catalog wird **nicht** exportiert. Nach Settings-Import: `syncFlowCoreCatalog` → `validateCatalogIntegrity`.

---

## Datenfluss

```
Ops-UI / API
    → PATCH ops_settings (database-ops-settings.ts)
    → syncFlowCoreCatalog (flow-core-runtime.ts)
    → syncCatalogFromOpsSettings (sync-catalog-from-ops-settings.ts)
    → topics, locations, queues, surfaces, routing_rules, journey_*
    → validateCatalogIntegrity
```

Beim **App-Start** (`CoreDatabase` constructor): einmalig `initializeFlowCore()` mit gelesenen `ops_settings`.

---

## Einziger Catalog-Writer in der App

| Modul                                                                                                                         | Rolle                                                                                                    |
| ----------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| [`app/src/shared/flow-core/sync-catalog-from-ops-settings.ts`](../app/src/shared/flow-core/sync-catalog-from-ops-settings.ts) | Spiegelt Settings in den Catalog; deaktiviert verwaiste Zeilen; legt System-Locations/Queues/Surfaces an |

Alles andere unter `app/src/` das Catalog-DML enthält, ist ein **Architekturfehler** (wird durch `catalog-write-guard.test.ts` abgesichert).

---

## Bewusst außerhalb der App

| Modul                                            | Kontext                                                        |
| ------------------------------------------------ | -------------------------------------------------------------- |
| `packages/flow-core/src/server/admin-service.ts` | PoC/Integration — **nicht** aus der Produktions-App importiert |
| `packages/flow-core/src/server/seed.ts`          | Tests / Demos                                                  |
| `packages/flow-core/test/**`                     | Integrationstests                                              |

Diese Pfade dürfen Catalog direkt schreiben; sie sind kein Produktions-Upgrade-Pfad.

---

## Catalog-Tabellen (Projektion)

- `topics`, `locations`, `queues`, `surfaces`, `surface_display_rules`
- `routing_rules`, `journey_templates`, `journey_steps`

Reservierte System-IDs (Prefix `pf_`, MFA-Assist-Topic, …) werden im Sync-Modul mitgeführt — siehe Konstanten in `sync-catalog-from-ops-settings.ts`.

---

## Integrität

Nach jedem Sync:

```typescript
validateCatalogIntegrity(loadCatalog(db));
```

Bereits abgedeckt in `sync-catalog-from-ops-settings.test.ts` (simple/complex, Journeys, Room-Panels).

---

## Tests

| Test                                     | Zweck                                          |
| ---------------------------------------- | ---------------------------------------------- |
| `catalog-write-guard.test.ts`            | Kein Catalog-DML in `app/src` außer Sync-Modul |
| `sync-catalog-from-ops-settings.test.ts` | Fachliche Projektion + Integrität              |
| `database-ops-settings.test.ts`          | Settings-Validierung vor Persistenz            |

---

## Nächster Schritt

3. Settings-Export/Import V1 — Snapshot nur aus `ops_settings` + `auth_settings` + Provider + `.env`; Catalog immer neu syncen.
