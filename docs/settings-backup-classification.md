# Settings-Backup — Klassifikation langlebiger Daten

Stand: 2026-08-31 · TLS-Restore-Grenze 2026-08-27 · geltender Vertrag für `.pfbackup` / Update

Dieses Dokument legt fest, **welche Werte** beim Backup/Restore/Update erhalten bleiben. Grundlage für `settingsFormatVersion: 1` und `.pfbackup`.

**Kontext:** Eine Installation = **eine Praxis**, Stack lokal auf einem **Windows-PC**. Außerhalb der Betriebszeiten und im Backup liegen **keine personenbezogenen Patientendaten** (Runtime-DB wird verworfen). Schutzbedarf ist pragmatisch — kein Cloud-KMS, keine anwendungsseitige Backup-Verschlüsselung. Backups enthalten trotzdem schützenswerte Zugangsdaten.

**Upgrade-Vertrag:** Fresh DB + Settings-Import via Manager. Runtime verwerfen, Settings + Stack-Konfiguration behalten.

---

## Legende

| Klasse             | Bedeutung                        | Backup                                               | Restore                                         |
| ------------------ | -------------------------------- | ---------------------------------------------------- | ----------------------------------------------- |
| **Fachlich**       | Praxis-/Produkt-Konfiguration    | Ja, Klartext                                         | Ersetzen → ggf. Catalog-Sync                    |
| **Zugriffsschutz** | PIN-**Hashes**                   | Ja, Klartext                                         | Ersetzen; lokal zurücksetzbar                   |
| **Zugangsdaten**   | SMS-/WhatsApp-API-Credentials    | Ja, **Klartext-JSON wie in der DB**                  | Import; optional Credentials weglassen         |
| **Host / Stack**   | Pfade, URLs, `.env`, Gateway     | Ja, Klartext                                         | Merge (siehe unten); Pfade ggf. bestätigen      |
| **Deployment**     | Release-Images (`manager-state`) | Ja, im **Backup-Manifest**                           | Rollback-Referenz                               |
| **Projektion**     | flow-core-Catalog                | Nein                                                 | Neu generieren                                  |
| **Runtime**        | Visits, Sessions, Queue, …       | Nein                                                 | Verwerfen                                       |

**Wahrheit fachlich:** `ops_settings` (+ JSON-Felder), nicht der Catalog.

---

## Sicherheitsmodell (entschieden, schlank)

**PINs:** Nur Hashes in DB/Backup. Lokaler Zugriffsschutz — kein Geheimnis-Export-Thema.

**Provider-API-Keys (SMS / WhatsApp):**

- In der DB: `credentials_json` enthält **unverschlüsseltes JSON**, einschließlich konfigurierter API-Keys.
- Zur Laufzeit: Der Server liest die Credentials direkt. Es gibt **keine Verschlüsselung oder Entsperrung über die MFA-PIN**; ein PIN-Wechsel verschlüsselt die Credentials nicht.
- Im Backup: Feld **1:1 wie in der DB** — konfigurierte API-Keys liegen auch in der `.pfbackup` **im Klartext**. JSON, Base64 und Checksummen sind kein Vertraulichkeitsschutz.

**Bewusste Beta-Entscheidung (2026-08-31):** Die bisher dokumentierte At-rest-Verschlüsselung war nicht implementiert und ist keine Beta-Voraussetzung mehr. Das Klartext-Risiko wird für den lokalen Praxis-Stack akzeptiert. Vollständiger Zugriff auf den laufenden Host und der Besitz einer kopierten Backup-Datei sind unterschiedliche Risiken: Auch ohne Patientendaten kann eine Backup-Kopie nutzbare Provider-Zugänge offenlegen. Verschlüsselung bleibt eine mögliche spätere Härtung, kein Bestandteil des aktuellen Vertrags.

**Aufbewahrung und Weitergabe:** DB und Backups nur berechtigten Personen zugänglich machen. Kopien auf USB-Datenträgern oder anderen Rechnern geschützt, vorzugsweise auf verschlüsselten Datenträgern, aufbewahren; nicht ungeschützt weitergeben. Bei Verlust oder unberechtigtem Zugriff enthaltene Zugangsdaten beim jeweiligen Anbieter sperren beziehungsweise wechseln.

**Weitere Stack-Werte** (Pfade, URLs, Praxisname, Gateway, interne Tokens, …): ebenfalls **Klartext** im Backup. Enthaltene Tokens sind Zugangsdaten und schützenswert, auch wenn sie keine Patientendaten sind.

**Restore ohne Provider-Credentials:** Bewusste Option (`skipProviderCredentials`), unabhängig von der MFA-PIN. Der Import leert Provider-Credentials und deaktiviert externe Messaging-Provider; der Rest der Praxis-Konfiguration wird importiert. Credentials danach in Ops neu eintragen. Die Option entfernt **keine** Keys aus der ursprünglichen Backup-Datei.

**Nutzerhinweis (für Backup v2 einzuplanen, noch nicht umgesetzt):** Vor Backup-Erstellung/Export und in der Restore-Vorschau ausdrücklich auf unverschlüsselte, schützenswerte API-Keys hinweisen. Copy, Platzierung und Abnahmekriterien stehen in [`plan-backup-v2.md`](plan-backup-v2.md#sicherheit-und-nutzerhinweis).

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
| `credentials_json`                  | Ja, **unverschlüsseltes JSON inkl. API-Keys** | Ersetzen; optional Credentials weglassen       |

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
| Interne Tokens | `SANDBOX_INTERNAL_TOKEN`, `AUTH_KEY_CAPTIVE`, …             | Ja, Klartext — schützenswerte Zugangsdaten                                     |
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
    { "providerId": "seven", "channel": "sms", "enabled": true, "credentialsJson": "{\"apiKey\":\"BEISPIEL-KEIN-ECHTER-KEY\"}" }
  ],
  "env": { "BUSINESS_TZ": "Europe/Berlin", "SETUP_LAN_APP_IP": "…", … }
}
```

`.pfbackup`-Archiv zusätzlich: Manifest mit Checksummen + `manager-state.json` (+ optional DB-Rollback-Kopie der alten Runtime-DB, nicht für Restore der Patientendaten).

**Import-Optionen:**

- Vollständig (Standard)
- **Ohne Provider-Credentials** (`skipProviderCredentials`): Credentials leeren, externe Messaging-Provider deaktivieren; unabhängig von der MFA-PIN

---

## Alle Entscheidungen (Stand 2026-08-31)

| #   | Thema                  | Entscheidung                                                                                  |
| --- | ---------------------- | --------------------------------------------------------------------------------------------- |
| 1   | PINs                   | Hashes unverschlüsselt im Backup                                                              |
| 2   | SMS/API-Credentials    | Klartext-JSON in DB und Backup; keine Bindung an die MFA-PIN; bewusst akzeptiertes Beta-Risiko |
| 3   | `setup_last_step`      | Nicht exportieren                                                                             |
| 4   | `.env`-Tuning          | Mit exportieren, wenn gesetzt (Teil des Stack-Snapshots); Restore = Merge, kein Blind-Replace |
| 5   | Praxis-Profil          | Wahrheit DB; Restore spiegelt `.env`                                                          |
| 6   | Host-Pfade / URLs      | Klartext                                                                                      |
| 7   | Backup-Verschlüsselung | Keine anwendungsseitige Verschlüsselung; Datei und Datenträger entsprechend schützen          |
| 8   | Provider-Restore       | Credentials optional weglassen; externe Provider dann deaktivieren; kein PIN-Mismatch-Gate    |
| 9   | Kontakt-Lookup-Pfad    | Klartext (Dateisystempfad)                                                                    |
| 10  | `manager-state`        | Backup-Manifest, nicht Settings-JSON                                                          |
| 11  | Gateway / ganzer Stack | Ja — alles, was für diese Praxis konfiguriert ist                                             |
| 12  | Nutzerhinweis          | In Backup v2 Klartext-Keys und sichere Aufbewahrung ausdrücklich kenntlich machen (geplant)   |

---

## TLS / Caddy (nicht `settingsFormatVersion: 1`)

Caddy `/data` + `/config`, ACME-Berechtigung und Custom-PEMs gehören **nicht** ins
`.pfbackup` v1 (kein Dateibaum). Restore von `PROXY_MODE=tls-*` oder
`CANONICAL_BASE_URL=https://…` **ohne** passendes TLS-Sidecar: `restoreSupported = false`,
kein stilles HTTP-Downgrade.

Pilot-Vertrag: [`plan-proxy-tls.md`](plan-proxy-tls.md) § Backup und Restore.
Volles Paket in `.pfbackup`: Produkthärtung nach dem Pilot.

---

## Nächste Schritte

2. ~~Catalog-Wahrheit~~ — [`catalog-source-of-truth.md`](catalog-source-of-truth.md)
3. ~~Settings-Export/Import V1 (Kern)~~ — `app/src/shared/settings/`
4. `createCurrentSchema(db)` + `user_version`
