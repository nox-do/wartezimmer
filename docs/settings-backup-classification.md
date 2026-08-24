# Settings-Backup — Klassifikation langlebiger Daten

Stand: 2026-07-12 · geltender Vertrag für `.pfbackup` / Update

Dieses Dokument legt fest, **welche Werte** beim Backup/Restore/Update erhalten bleiben. Grundlage für `settingsFormatVersion: 1` und `.pfbackup`.

**Kontext:** Eine Installation = **eine Praxis**, Stack lokal auf einem **Windows-PC**. Außerhalb der Betriebszeiten und im Backup liegen **keine personenbezogenen Patientendaten** (Runtime-DB wird verworfen). Schutzbedarf ist pragmatisch — kein Cloud-KMS, keine doppelte Verschlüsselung.

**Upgrade-Vertrag:** Fresh DB + Settings-Import via Manager. Runtime verwerfen, Settings + Stack-Konfiguration behalten.

---

## Legende

| Klasse             | Bedeutung                        | Backup                                               | Restore                                         |
| ------------------ | -------------------------------- | ---------------------------------------------------- | ----------------------------------------------- |
| **Fachlich**       | Praxis-/Produkt-Konfiguration    | Ja, Klartext                                         | Ersetzen → ggf. Catalog-Sync                    |
| **Zugriffsschutz** | PIN-**Hashes**                   | Ja, Klartext                                         | Ersetzen; lokal zurücksetzbar                   |
| **At-rest Secret** | SMS/API-Credentials in DB        | Ja, **wie in DB gespeichert** (verschlüsselter Blob) | Import; Entschlüsselung nur zur Laufzeit im RAM |
| **Host / Stack**   | Pfade, URLs, `.env`, Gateway     | Ja, Klartext                                         | Merge (siehe unten); Pfade ggf. bestätigen      |
| **Deployment**     | Release-Images (`manager-state`) | Ja, im **Backup-Manifest**                           | Rollback-Referenz                               |
| **Projektion**     | flow-core-Catalog                | Nein                                                 | Neu generieren                                  |
| **Runtime**        | Visits, Sessions, Queue, …       | Nein                                                 | Verwerfen                                       |

**Wahrheit fachlich:** `ops_settings` (+ JSON-Felder), nicht der Catalog.

---

## Sicherheitsmodell (entschieden, schlank)

**PINs:** Nur Hashes in DB/Backup. Lokaler Zugriffsschutz — kein Geheimnis-Export-Thema.

**SMS-Provider-API-Key** (einziger sensibler Wert, der nicht „mal eben lesbar“ sein soll):

- In der DB: `credentials_json` **at-rest verschlüsselt** (Schlüssel bei **Anlage/Wechsel der MFA-PIN**).
- Zur Laufzeit: Entschlüsselung **nur im RAM**, solange MFA-Session entsperrt ist.
- Im Backup: Feld **1:1 wie in der DB** — kein Klartext-API-Key in der Datei, **keine extra Backup-Verschlüsselung**.

**Alles andere** (Pfade, URLs, Praxisname, Gateway, Sandbox-Token, …): **Klartext** im Backup — kein Geheimnis, kein PII.

**Restore wenn MFA-PIN nicht mehr passt** (Credentials nicht entschlüsselbar): Angebot **Restore ohne Provider-Settings** — Rest der Praxis-Konfiguration wird importiert, SMS-Credentials in Ops neu eintragen.

**Nicht vorgesehen:** separate Backup-Passphrase, `envEnc`-Blob, Cloud-KMS, MFA-PIN-Abfrage speziell fürs Backup.

**Manager-Maintenance-API (Port 8082):** Snapshot/Validate/Import nur über zweiten App-Listener. **Nicht aus dem Praxis-LAN erreichbar** — Docker veröffentlicht `127.0.0.1:8082:8082` nur an Host-Loopback. Im Container lauscht die App auf `0.0.0.0:8082` (nötig für Port-Publish); andere Container im selben Compose-Netz könnten den Port intern erreichen — für den lokalen Stack vertretbar, kein zusätzliches Token-Auth.

---

## `ops_settings` (Singleton)

| Feld                                                         | Backup        | Restore                                                    |
| ------------------------------------------------------------ | ------------- | ---------------------------------------------------------- |
| `topic_settings_json`, `rooms_json`, `journey_settings_json` | Ja            | Ersetzen → Catalog-Sync                                    |
| `routing_mode`, `return_window_minutes`, Öffnungszeiten      | Ja            | Ersetzen                                                   |
| `practice_profile_json`                                      | Ja (Wahrheit) | Ersetzen + `.env`-Praxis-Felder spiegeln                   |
| Terminal-Auth, `emergency_enabled`, `portal_enabled`, …      | Ja            | Ersetzen                                                   |
| `sms_provider`                                               | Ja            | Ersetzen                                                   |
| `contact_lookup_*`, `export_base_path`                       | Ja, Klartext  | Ersetzen; Pfad ggf. bestätigen                             |
| `setup_completed_at`, `setup_contact_mode`                   | Ja            | Ersetzen                                                   |
| `setup_last_step`                                            | **Nein**      | Aus `setup_completed_at` ableiten (`verify` vs. `welcome`) |
| `waiting_room_full`                                          | Nein          | Default `0`                                                |
| `updated_at`, `id`                                           | Nein          | Neu / `singleton`                                          |

---

## `auth_settings`

| Feld                                      | Backup      | Restore  |
| ----------------------------------------- | ----------- | -------- |
| `staff_pin_hash_*`, `room_panel_pin_hash` | Ja (Hashes) | Ersetzen |

---

## `messaging_provider_configs`

| Feld                                | Backup                                  | Restore                                       |
| ----------------------------------- | --------------------------------------- | --------------------------------------------- |
| `provider_id`, `channel`, `enabled` | Ja, Klartext                            | Ersetzen                                      |
| `credentials_json`                  | Ja, **DB-Blob** (at-rest verschlüsselt) | Ersetzen; bei PIN-Mismatch optional weglassen |

Provider-IDs (Baseline): `mock`, `seven`, `seven_whatsapp`.

---

## `.env` (gesamter Stack, eine Praxis)

**Regel v1:** Alle gesetzten Variablen der Installation **Klartext** ins Backup — inkl. Gateway-Block, wenn konfiguriert. Eine Installation = ein Stack für genau diese Praxis.

| Bereich        | Beispiele                                                   | Backup                                                                         |
| -------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Praxis / TZ    | `PRACTICE_*`, `BUSINESS_TZ`                                 | Ja (Spiegel zu DB; Restore sync)                                               |
| Host / Pfade   | `EXPORT_*`, `IMPORTS_HOST_PATH`, `CONTACT_LOOKUP_BASE_PATH` | Ja, Klartext                                                                   |
| Netz / URLs    | `SETUP_LAN_APP_IP`, `CANONICAL_BASE_URL`                    | Ja, Klartext                                                                   |
| Gateway        | `GATEWAY_*`, `OPENNDS_*`, `PORTAL_FQDN`, …                  | Ja, wenn gesetzt                                                               |
| Interne Tokens | `SANDBOX_INTERNAL_TOKEN`, `AUTH_KEY_CAPTIVE`, …             | Ja, Klartext (lokal, kein PII)                                                 |
| Tuning         | `OUTBOX_*`, Session-TTLs, …                                 | Ja, wenn gesetzt                                                               |
| Images         | `PRAXIS_FLOW_*_IMAGE`                                       | Im Snapshot oft mit exportiert; **Restore behält aktuelle Tags** (siehe unten) |

**Restore-Vertrag v1 (`.env` — kein vollständiges Ersetzen):**

Implementierung: `mergeConfigRestoreEnv` + `writeEnvRecordAtomically` in Setup.

1. **Backup-Werte gewinnen** für alle Keys, die im Snapshot-`env` enthalten sind.
2. **Aktuelle Stack-Image-Tags bleiben:** `PRAXIS_FLOW_APP_IMAGE`, `PRAXIS_FLOW_SANDBOX_IMAGE`, `PRAXIS_FLOW_GATEWAY_IMAGE` werden aus der laufenden `.env` übernommen, nicht aus dem Backup (Deployment bleibt auf dem installierten Release).
3. **Current-only Keys bleiben:** Variablen, die nur in der aktuellen `.env` existieren (neu seit dem Backup, lokal ergänzt), werden nicht entfernt.
4. **Kein implizites Aufräumen:** Keys, die im Backup standen, aber lokal entfernt wurden, kommen beim Restore wieder — bewusstes Entfernen veralteter Keys braucht eine explizite Remove-Liste (nicht v1).

Kurz: _Backup-Werte überschreiben bekannte Keys, aktuelle unbekannte Keys bleiben, Image-Tags bleiben aktuell._

Bei Host-Pfaden **bestätigen**, wenn sie vom Zielsystem abweichen.

---

## `manager-state.json`

**Nicht** im Settings-JSON — eigenes Teilstück im **`.pfbackup`-Manifest** (Release-Version, Image-Tags, SHA256) für Rollback.

---

## Nicht backup (Runtime-DB)

`visits`, `visit_events`, `visit_topics`, `patients`, `patient_sessions`, `documents`, `outbox_events`, `ops_state`, `visit_host_state`, `terminal_assist_pending`, flow-core-Catalog-Tabellen.

Nach Import: `syncFlowCoreCatalog` → `validateCatalogIntegrity`.

---

## Export-Snapshot (`settingsFormatVersion: 1`)

```json
{
  "settingsFormatVersion": 1,
  "exportedAt": "ISO-8601",
  "opsSettings": { },
  "authSettings": { "staffPinHashMfa": "…", "staffPinHashOps": "…", "roomPanelPinHash": "…" },
  "messagingProviderConfigs": [
    { "providerId": "seven", "channel": "sms", "enabled": true, "credentialsJson": "<at-rest blob aus DB>" }
  ],
  "env": { "BUSINESS_TZ": "Europe/Berlin", "SETUP_LAN_APP_IP": "…", … }
}
```

`.pfbackup`-Archiv zusätzlich: Manifest mit Checksummen + `manager-state.json` (+ optional DB-Rollback-Kopie der alten Runtime-DB, nicht für Restore der Patientendaten).

**Import-Optionen:**

- Vollständig (Standard)
- **Ohne Provider-Credentials**, wenn Entschlüsselung nach PIN-Wechsel scheitert

---

## Alle Entscheidungen (Stand 2026-07-12)

| #   | Thema                  | Entscheidung                                                                                  |
| --- | ---------------------- | --------------------------------------------------------------------------------------------- |
| 1   | PINs                   | Hashes unverschlüsselt im Backup                                                              |
| 2   | SMS/API-Credentials    | At-rest in DB (MFA-PIN); Backup = DB-Blob; Laufzeit nur RAM                                   |
| 3   | `setup_last_step`      | Nicht exportieren                                                                             |
| 4   | `.env`-Tuning          | Mit exportieren, wenn gesetzt (Teil des Stack-Snapshots); Restore = Merge, kein Blind-Replace |
| 5   | Praxis-Profil          | Wahrheit DB; Restore spiegelt `.env`                                                          |
| 6   | Host-Pfade / URLs      | Klartext                                                                                      |
| 7   | Backup-Verschlüsselung | Keine extra Schicht                                                                           |
| 8   | PIN passt nicht mehr   | Restore ohne Provider-Settings anbieten                                                       |
| 9   | Kontakt-Lookup-Pfad    | Klartext (Dateisystempfad)                                                                    |
| 10  | `manager-state`        | Backup-Manifest, nicht Settings-JSON                                                          |
| 11  | Gateway / ganzer Stack | Ja — alles, was für diese Praxis konfiguriert ist                                             |

---

## Nächste Schritte

2. ~~Catalog-Wahrheit~~ — [`catalog-source-of-truth.md`](catalog-source-of-truth.md)
3. ~~Settings-Export/Import V1 (Kern)~~ — `app/src/shared/settings/`
4. `createCurrentSchema(db)` + `user_version`
