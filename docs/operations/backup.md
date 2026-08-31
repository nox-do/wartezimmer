# Backup, Restore & Settings-Erhalt

Stand: 2026-08-31 · am Code geprüft (`settings-backup*.ts`, `tls-backup*.ts`, Maintenance `:8082`)

**Scope:** Was in `.pfbackup` liegt, Restore, TLS-Sidecar-Grenze, gemeinsames Fresh-DB-Muster mit Update.  
Nicht: `.pfupdate`-Paketformat → [`delivery.md`](delivery.md) · LAN-TLS Betrieb → [`tls.md`](tls.md) · Backup v2 → [`../plan-backup-v2.md`](../plan-backup-v2.md) (**nicht** hier fortschreiben)

## 1. Prinzip

Eine Installation = **eine Praxis**, Stack lokal. Upgrade-/Restore-Vertrag: **Fresh DB + Settings-Import**. Runtime (Visits, Sessions, Queue, …) wird verworfen; fachliche Settings und Stack-Konfiguration bleiben.

| Klasse | Backup | Restore |
| --- | --- | --- |
| **Fachlich** (`ops_settings`, …) | Ja, Klartext | Ersetzen → Catalog-Sync |
| **Zugriffsschutz** (PIN-Hashes) | Ja | Ersetzen |
| **Zugangsdaten** (SMS/WhatsApp-JSON) | Ja, **Klartext wie in DB** | Import; optional weglassen |
| **Host / Stack** (`.env`, Pfade, URLs) | Ja, Klartext | Merge (§3) |
| **Deployment** (`manager-state`) | Im Archiv-Manifest | Rollback-Referenz; Image-Tags am Ziel bleiben |
| **Projektion** (flow-core-Catalog) | Nein | Neu generieren |
| **Runtime-DB** | Nein | Verwerfen |

**Sicherheitsmodell (Beta):** Keine anwendungsseitige Backup-Verschlüsselung, kein Cloud-KMS, keine MFA-PIN fürs Backup. Provider-API-Keys liegen in DB und `.pfbackup` im Klartext — Datei und Datenträger schützen. Nutzerhinweis vor Export: geplant in Backup v2, noch nicht Ist.

## 2. Artefakt `.pfbackup`

`settingsFormatVersion: **1**`. Code: `setup/src/settings-backup*.ts`, App-Snapshot über Maintenance-API, Pack/Inspect in `packages/server-shared/src/pfbackup.ts`.

### 2.1 Inhalt

| Teil | Rolle |
| --- | --- |
| Settings-JSON | `opsSettings`, `authSettings`, `messagingProviderConfigs`, `env` |
| Manifest | Checksummen, `manager-state.json` (Release/Images) |
| optional | DB-aside nur Rollback-Technik — **nicht** Patienten-Restore |

Beispiel-Shape (Settings):

```json
{
  "settingsFormatVersion": 1,
  "exportedAt": "ISO-8601",
  "opsSettings": {},
  "authSettings": {},
  "messagingProviderConfigs": [],
  "env": {}
}
```

### 2.2 Maintenance-API (`:8082`)

Snapshot / Validate / Import nur über zweiten App-Listener. Docker: `127.0.0.1:8082:8082` — **nicht** aus dem Praxis-LAN. Stack muss für Create/Validate/Import laufen (Update: Pre-Backup ebenfalls über `:8082`).

### 2.3 Setup-API (Manager)

| Route | Zweck |
| --- | --- |
| `GET /api/setup/host/backup` | Info letztes Backup |
| `POST /api/setup/host/backup` | `.pfbackup` (+ TLS-Sidecar wenn nötig) erzeugen |
| `POST …/backup/validate` | Archiv + Settings prüfen |
| `POST …/backup/inspect` | Vorschau, Kompatibilität, TLS-Gate |
| `POST …/backup/restore` | Fresh-DB-Cutover + Settings-Import |

## 3. Klassifikation (Kurz)

Wahrheit fachlich: **`ops_settings`** (+ JSON-Felder), nicht der Catalog. Nach Import: `syncFlowCoreCatalog` → `validateCatalogIntegrity`.

### 3.1 Mit im Backup

- `ops_settings`: Themen/Räume/Journey, Routing, Praxisprofil, Portal/Emergency, Pfade, Setup-Marker, …  
  **Nicht:** `setup_last_step`, `waiting_room_full`, `updated_at` / `id`
- `auth_settings`: Staff-/Raum-PIN-**Hashes**
- `messaging_provider_configs`: inkl. `credentials_json` (Klartext-Keys); IDs u. a. `mock`, `seven`, `seven_whatsapp`
- `.env`: gesetzte Stack-Variablen Klartext (Praxis, Pfade, URLs, Gateway-Block wenn gesetzt, Tokens, Tuning)

### 3.2 Nicht im Backup (Runtime)

`visits`, `visit_events`, `patients`, `patient_sessions`, `documents`, `outbox_events`, Catalog-Tabellen, … — komplette Runtime-DB.

### 3.3 `.env`-Restore-Merge

`mergeConfigRestoreEnv` + `writeEnvRecordAtomically`:

1. Backup-Werte gewinnen für Keys im Snapshot-`env`
2. Aktuelle Image-Tags bleiben: `PRAXIS_FLOW_*_IMAGE` (app/sandbox/gateway/proxy) aus laufender `.env`
3. Keys nur in der aktuellen `.env` bleiben (Write lässt unbekannte Zeilen stehen)
4. Kein implizites Aufräumen: im Backup stehende, lokal gelöschte Keys kommen wieder

Host-Pfade bei Abweichung vom Zielsystem bestätigen.

### 3.4 Import-Option

- Standard: vollständig  
- **`skipProviderCredentials`:** Credentials leeren, externe Messaging-Provider deaktivieren — unabhängig von MFA-PIN; entfernt **keine** Keys aus der Backup-Datei

## 4. Manager-Flows

Fläche **Wartung** → Praxis-Backup / Wiederherstellen (`BackupPanel`, Restore-Wizard).

| Aktion | Verhalten |
| --- | --- |
| Erstellen | Stack oben; schreibt `.pfbackup` (typ. unter Install-Home `backups/`); bei `tls.state ≠ off` zusätzlich Sidecar |
| Inspect / Vorschau | Archiv, Settings-Format, Release-Vergleich, TLS-Zusammenfassung |
| Wiederherstellen | Bestätigung; Queue/Runtime weg; Fresh-DB + Import; optional Credentials-Skip nach Fehlern vorschlagen |

Keine „nur `.env`-Datei“-Produktstrecke mehr — Vertrag ist `.pfbackup` (+ Sidecar).

## 5. TLS-Grenze (v1)

Produktkontext: [`tls.md`](tls.md) §8. Helpers: `tls-backup.ts` / `tls-backup-sidecar.ts`.

| | |
| --- | --- |
| In `.pfbackup` | höchstens nicht-geheime `TLS_*`-Marker + ggf. `PROXY_MODE` / HTTPS-Canonical |
| Sidecar | `praxis-flow-tls-<timestamp>.tgz` neben der `.pfbackup` — Caddy-Data/Config, `acme-dns.json`, `certs/` |
| Aktives HTTPS ohne passendes Sidecar | Restore **abgelehnt** (`restoreSupported = false`) |
| Nur Vorbereitung, Canonical noch HTTP | Restore erlaubt; ohne Sidecar Vorbereitung verwerfen |
| v2 | TLS im selben Archiv — nur [`../plan-backup-v2.md`](../plan-backup-v2.md) |

## 6. Gemeinsames Cutover mit Update

Restore und `.pfupdate`-Settings-Import teilen dasselbe Muster: alte Runtime-DB beiseite → App mit Ziel-Image → Settings importieren → verifizieren → Full-Stack + Health (`fresh-db-settings-cutover.ts`).

Update-Phasen (Backup **vor** Stop über `:8082`, dann Cutover/Rollback): [`delivery.md`](delivery.md) §5.  
Pre-Update-`.pfbackup` bleibt als Datei; bei Fehler nach Rollback-Artefakten: `executeUpdateRollback()`.

`manager-state` / Image-Tags am Ziel: Deployment bleibt auf dem **installierten** Release (Restore überschreibt Tags nicht; Update setzt Tags aus dem `.pfupdate`).
