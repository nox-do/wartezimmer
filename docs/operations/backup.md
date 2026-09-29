# Backup, Restore & Settings-Erhalt

Stand: 2026-09-29 · am Code geprüft (`settings-backup*.ts`, `tls-backup*.ts`, Maintenance `:8082`)

**Scope:** Was in `.pfbackup` liegt, Restore, eingebettete HTTPS-Daten, gemeinsames Fresh-DB-Muster mit Update.

Nicht: `.pfupdate`-Paketformat → [`delivery.md`](delivery.md) · LAN-TLS Betrieb → [`tls.md`](tls.md)

## 1. Prinzip

Eine Installation = **eine Praxis**, Stack lokal. Upgrade-/Restore-Vertrag: **Fresh DB + Settings-Import**. Runtime (Visits, Sessions, Queue, …) wird verworfen; fachliche Settings und Stack-Konfiguration bleiben.

| Klasse                                 | Backup                     | Restore                                             |
| -------------------------------------- | -------------------------- | --------------------------------------------------- |
| **Fachlich** (`ops_settings`, …)       | Ja, Klartext               | Ersetzen → Catalog-Sync                             |
| **Zugriffsschutz** (PIN-Hashes)        | Ja                         | Ersetzen                                            |
| **Zugangsdaten** (SMS/WhatsApp-JSON)   | Ja, **Klartext wie in DB** | Import; optional weglassen                          |
| **Host / Stack** (`.env`, Pfade, URLs) | Ja, Klartext               | Merge (§3)                                          |
| **Deployment** (`manager-state`)       | Im Archiv-Manifest         | Rollback-Referenz; Image-Tags am Ziel bleiben       |
| **Projektion** (flow-core-Catalog)     | Nein                       | Neu generieren                                      |
| **Runtime-DB**                         | Nein                       | Verwerfen; Gerätefreigaben nach Restore leer (§3.2) |

**Sicherheitsmodell (Beta):** Keine anwendungsseitige Backup-Verschlüsselung, kein Cloud-KMS, keine MFA-PIN fürs Backup. Provider-API-Keys liegen in DB und `.pfbackup` im Klartext — Datei und Datenträger schützen. Ein Hinweis im Backup-Bereich vor Erstellen/Export erklärt dies sowie mögliche private HTTPS-Schlüssel. Kein zusätzlicher Dialog und keine Wiederholung in der Restore-Vorschau.

## 2. Artefakt `.pfbackup`

Eine einzelne JSON-Datei mit `pfbackupFormatVersion: 2` und
`settingsFormatVersion: 1`. Ältere Backup-Formate und separate TLS-Dateien
werden abgelehnt, ohne Migration. Code: `setup/src/settings-backup*.ts`,
App-Snapshot über Maintenance-API, Pack/Inspect in
`packages/server-shared/src/pfbackup.ts`.

### 2.1 Inhalt

| Teil                        | Rolle                                                                           |
| --------------------------- | ------------------------------------------------------------------------------- |
| Settings-JSON               | `opsSettings`, `authSettings`, `messagingProviderConfigs`, `env`                |
| Manifest                    | Checksummen, `manager-state.json` (Release/Images)                              |
| optional `tlsArchiveBase64` | HTTPS-Archiv; `tls.tgz` im Manifest mit SHA-256 und Länge der dekodierten Bytes |

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

| Route                         | Zweck                                           |
| ----------------------------- | ----------------------------------------------- |
| `GET /api/setup/host/backup`  | Info letztes Backup                             |
| `POST /api/setup/host/backup` | eine `.pfbackup` inklusive HTTPS-Daten erzeugen |
| `POST …/backup/inspect`       | Vorschau, Kompatibilität, TLS-Gate              |
| `POST …/backup/restore`       | Fresh-DB-Cutover + Settings-Import              |

## 3. Klassifikation (Kurz)

Wahrheit fachlich: **`ops_settings`** (+ JSON-Felder), nicht der Catalog. Nach Import: `syncFlowCoreCatalog` → `validateCatalogIntegrity`.

### 3.1 Mit im Backup

- `ops_settings`: Themen/Räume/Journey, Routing, Praxisprofil, Portal/Emergency, Pfade, Setup-Marker, …  
  **Nicht:** `setup_last_step`, `waiting_room_full` (legacy-Spalte, Code ignoriert), `updated_at` / `id`
- `auth_settings`: Staff-/Raum-PIN-**Hashes**
- `messaging_provider_configs`: inkl. `credentials_json` (Klartext-Keys); IDs u. a. `mock`, `seven`, `seven_whatsapp`
- `.env`: gesetzte Stack-Variablen Klartext (Praxis, Pfade, URLs, Tokens,
  Tuning sowie gegebenenfalls noch vorhandene Legacy-Keys)

### 3.2 Nicht im Backup (Runtime)

`visits`, `visit_events`, `patients`, `patient_sessions`, `documents`, `outbox_events`, Catalog-Tabellen, `device_authorizations`, … — komplette Runtime-DB. PIN-Hashes liegen in `auth_settings`, nicht als Freigabezeilen.

**Restore:** `device_authorizations` wird **nicht** kopiert. TV, Terminal und Raum-Panels müssen neu koppeln/enrollen.

**Update (`.pfupdate`):** derselbe Fresh-DB-Cutover **mit** Copy-Hook: Setup liest aktive Zeilen read-only aus der Aside-SQLite, Maintenance `:8082` schreibt sie in die neue DB. Alte In-Memory-Sessions (vor diesem Schema) sind nicht übernehmbar.

### 3.3 `.env`-Restore-Merge

`mergeConfigRestoreEnv` + `writeEnvRecordAtomically`:

1. Backup-Werte gewinnen für Keys im Snapshot-`env`
2. Image-Tags und installationsinterne Secrets bleiben vom Ziel: `NON_RESTORABLE_INSTALL_ENV_KEYS` (Image-Keys plus `SECRET_ENV_KEYS`). Am Ziel fehlende interne Keys werden nicht aus dem Backup übernommen. Provider-Credentials bleiben Praxisdaten.
3. Keys nur in der aktuellen `.env` bleiben (Write lässt unbekannte Zeilen stehen)
4. Bei HTTPS am Ziel und einer Sicherung ohne aktives HTTPS bleiben Live-HTTPS-Konfiguration und Zertifikatsdateien erhalten.

Host-Pfade bei Abweichung vom Zielsystem bestätigen.

### 3.4 Import-Option

- Standard: vollständig
- **`skipProviderCredentials`:** Credentials leeren, externe Messaging-Provider deaktivieren — unabhängig von MFA-PIN; entfernt **keine** Keys aus der Backup-Datei

## 4. Manager-Flows

Fläche **Wartung** → Praxis-Backup / Wiederherstellen (`BackupPanel`, Restore-Wizard).

| Aktion             | Verhalten                                                                                                                   |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| Erstellen          | Stack oben; schreibt `.pfbackup` (typ. unter Install-Home `backups/`); bei `tls.state ≠ off` mit eingebetteten HTTPS-Daten  |
| Inspect / Vorschau | Archiv, Settings-Format, Release-Vergleich, TLS-Zusammenfassung                                                             |
| Wiederherstellen   | Bestätigung; Queue/Runtime weg; Fresh-DB + Import **ohne** Gerätefreigaben; Credentials-Skip nur durch Benutzerentscheidung |

Keine „nur `.env`-Datei“-Produktstrecke mehr — Vertrag ist einer `.pfbackup`.

## 5. HTTPS in Backup v2

Produktkontext: [`tls.md`](tls.md) §8. HTTPS-Daten liegen als Base64-kodiertes
internes tgz in derselben Datei: Caddy-Data/Config, `acme-dns.json`, `certs/`
und TLS-Identität. HTTP-only lässt das Feld weg. Fehler beim Packen brechen
die gesamte Backup-Erstellung ab.

- Aktives HTTPS im Backup ohne passende Daten: Restore abgelehnt vor Stack-Stopp.
- HTTPS am Ziel und im Backup: Bestätigung im bestehenden Restore-Assistenten.
- HTTPS am Ziel, HTTP oder nur Vorbereitung im Backup: Live-HTTPS bleibt erhalten.
- HTTP am Ziel: keine zusätzliche HTTPS-Bestätigung; vorbereitete Einrichtung
  ohne passende Daten wird verworfen.

Nur eine Dateiauswahl und ein Export; keine zusätzliche Zertifikatsdatei.
Setup erhält `content`, Restore optional `skipProviderCredentials`.

## 6. Gemeinsames Cutover mit Update

Restore und `.pfupdate`-Settings-Import teilen dasselbe Muster: alte Runtime-DB beiseite → App mit Ziel-Image → Settings importieren → verifizieren → Full-Stack + Health (`fresh-db-settings-cutover.ts`). Nur der Update-Caller setzt den Copy-Hook für aktive `device_authorizations`.

Update-Phasen (Backup **vor** Stop über `:8082`, dann Cutover/Rollback): [`delivery.md`](delivery.md) §5.  
Pre-Update-`.pfbackup` bleibt als Datei; bei Fehler nach Rollback-Artefakten: `executeUpdateRollback()`.

`manager-state` / Image-Tags am Ziel: Deployment bleibt auf dem **installierten** Release (Restore überschreibt Tags nicht; Update setzt Tags aus dem `.pfupdate`).

Recovery nach Neuinstallation: [Ablauf und Fehlerfälle](reinstall-recovery.md).
