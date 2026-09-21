# Plan: `.pfbackup` v2 — HTTPS im selben Archiv

Stand: 2026-09-21

Status: **Durchgängiger Format-2-Cut umgesetzt.** Erstellen, Prüfen, Restore,
Manager-Dateidialog und Pre-Update-Backup verwenden eine einzelne JSON-Datei
mit eingebetteten HTTPS-Daten. Alte Backup-Formate werden abgelehnt; es gibt
keine Migration. HTTPS-Überschreibbestätigung und Erhalt der Ziel-Secrets sind
umgesetzt. Recovery-Discovery, Pinning und der Reinstall-Recovery-Assistent
sind ebenfalls angebunden; siehe [Betriebsvertrag](operations/reinstall-recovery.md).

Eine Installation, ein Backup, eine Datei. Altes Format (JSON ohne
`tlsArchiveBase64`, Geschwister-`.tgz`) wird nicht gelesen. Nach dem Cut nur
Format 2. Umbau ohne Release: Backup/Restore darf zwischen den Schnitten rot
sein.

---

## Fachliches Ziel

Eine Sicherung ist der Zustand dieser Praxis. Wiederherstellen setzt ihn auf
diesem Rechner ein. HTTPS gehört dazu (Caddy-State, ACME-Konto, Custom-PEMs) —
nicht als zweite Datei und nicht als zweiter Assistent.

Eine Speichern-Aktion, eine Restore-Auswahl. Die Hülle bleibt JSON wie heute
(`content` utf8). Dieselbe innere TLS-`.tgz` wie heute liegt **in** der
`.pfbackup` (`tlsArchiveBase64`). `settingsFormatVersion` bleibt **1**.
`pfbackupFormatVersion` wird **2**.

Vorsicht beim Restore ist eine Überschreibregel — nicht das Archivformat:

- **Praxis HTTP** (`!currentTlsClaimsHttps`, inkl. Prepare-only am Ziel):
  Restore ohne Extra-Frage. Sicherung mit HTTPS darf Proxy einschalten und
  Payload entpacken.
- **Praxis HTTPS und Sicherung HTTPS** (`currentTlsClaimsHttps` und
  `tlsInBackup`): nicht still überschreiben. Rückfrage im bestehenden
  Assistenten, dann erst `stopStack`. Confirm steuert nur, ob Restore startet —
  kein Extra-Flag an Setup. Nach Ja: Unpack wie heute (Ziele im TLS-Root
  werden ersetzt).
- **Praxis HTTPS, Sicherung ohne HTTPS** (`currentTlsClaimsHttps` und nicht
  `tlsInBackup`, inkl. Prepare-only in der Sicherung): Restore der Settings,
  HTTPS auf diesem Rechner bleibt. Kein Wipe, kein Unpack, keine Extra-Frage.

Gates wie heute bleiben: aktives HTTPS **in der Sicherung** ohne gültige Payload
→ `restoreSupported = false` (sonst `https://` ohne Caddy). Prepare-only ohne
passendes Payload **und Ziel HTTP** → Restore erlaubt, Vorbereitung verwerfen.
Prepare-only auf HTTPS-Ziel fällt unter die dritte Kugel (Live-HTTPS bleibt).
ID und Hostname in Snapshot und Payload nichtleer und gleich; widersprüchliche
Metadaten blocken.

---

## Festgelegt (Scope)

1. Kein Live-Bestand. Altes Format und Geschwister-`.tgz` werden nicht gelesen
   und nicht mitgeschrieben. Tests/Fixtures nur Format 2. Kein Format-Migrationshinweis in der UI.
2. Dateiendung `.pfbackup`, Prefix `praxis-flow-backup-` unverändert. Dateiinhalt
   ist JSON plus optionales `tlsArchiveBase64`. Kein äußeres tar, kein Zip, kein
   Stream. Kein Hash im Dateinamen.
3. `pfbackupFormatVersion` **2**. `settingsFormatVersion` **1**.
4. `tlsArchiveBase64` nur wenn `TLS_STATE != off` (ab Prepare, nicht erst nach
   Cutover). HTTP-only: Format 2 ohne dieses Feld.
5. Innere Payload = heutiges tgz-Layout. Inneres `manifest.json`
   `formatVersion: 2` mit der bereits vorhandenen Managed-TLS-Identität
   (TLS-Payload, nicht der Container).
6. Restore-Gates unverändert (siehe Ziel). Setup bekommt weiterhin utf8-`content`
   der JSON-Datei, keinen Host-Pfad. Ab Schnitt 2 **kein** extra
   `tlsSidecarBase64` — die Bytes stehen in der Datei. Unpack nach
   Rollback-Snapshot. Host-Pfade nur `resolveProxyTlsEnvUpdates` (kein
   `ensureProxyTlsPaths` vor Rollback). Caddyfile nach Unpack neu.
7. `operator-token` bleibt draußen.
8. Copy: Praxis-Sprache. Kein Sidecar/Pilot/Electron-Main in der UI.
9. Mock folgt der Fläche, ist nicht der Vertrag.
10. ACME-Konto und Custom-PEM dürfen in der `.pfbackup` liegen (lokale Praxis).
11. Keine Größen-Decke, kein `stat.size`-Gate, kein Limit in Setup-`content`.
12. Inspect-**Ausgabe**: `payloadPresent` / `payloadMatches` (nicht `sidecar*`)
    in Schnitt 1 — `tls-backup.ts`-Parameter, Setup-Inspect/Restore,
    Wizard-Flow/Controller, Tests, keine Aliase. Datei `tls-backup-sidecar.ts`
    **nicht** umbenennen. Inspect-**Eingabe** `tlsSidecarBase64` bleibt bis
    Schnitt 2. `currentTlsClaimsHttps` top-level auf `PfbackupInspectResult`
    (nicht `backup.tls`). Helper in `tls-backup.ts` neben `tlsInBackup`:
    lebende `.env` mit `tlsInBackup` **oder** `TLS_STATE` `active`/`degraded`.
13. HTTP-only immer Format 2. Kein Test und kein Manager erzeugt Format 1.
14. HTTPS-Block in der Wartung bleibt als **Hinweis** (Zertifikat in der
    `.pfbackup`). Extra-Buttons und IPC fallen. Block nicht streichen.
15. Pre-Update-Backup ist dieselbe Format-2-Datei. Kein Extra-Hinweis im
    Update-Wizard. Dieselbe Rückfrage wie beim normalen Restore (nur wenn
    Praxis **und** Sicherung HTTPS).
16. Sichtbarer Sicherheitshinweis im Backup-Bereich vor Erstellung/Export: `.pfbackup` ist unverschlüsselt und enthält bei
    konfiguriertem Messaging API-Keys im Klartext; HTTPS-Payload kann private
    Schlüssel enthalten. Details unter „Sicherheit und Nutzerhinweis“.
17. Ergänzung 2026-09-10: Installationsinterne Secrets der lebenden
    Zielinstallation gewinnen beim Restore immer gegen das Backup. Die
    kanonische Liste ist gemeinsam typisiert aus `SECRET_ENV_KEYS`; zusammen
    mit `STACK_IMAGE_ENV_KEYS` bildet sie
    `NON_RESTORABLE_INSTALL_ENV_KEYS`. Provider-Credentials bleiben
    wiederherstellbare Praxisdaten. Diese Regel gilt für manuellen Restore,
    Update-Cutover und Reinstall-Recovery gleichermaßen; siehe
    [`plan-reinstall-recovery.md`](plan-reinstall-recovery.md#9-restore-regeln-für-release-und-secrets).

### Nicht-Ziele

- Kein Lesen des alten Formats, kein Parallel-Schreiben der Geschwisterdatei,
  keine Migrations-UI, kein „alte Sicherung öffnen“
- Kein zweiter Restore-Assistent, kein extra „Zertifikat sichern/prüfen“
- Kein äußeres tar/zip, kein Streaming-Body, kein USB-Pfad an Setup
- Kein ACME/PEM in `.env` oder `ops_settings`
- Kein HSTS, kein Format für Patientendaten
- Kein E2E-Let's-Encrypt, kein neues Restore-UI
- Kein Gesamt-Hash der JSON-Datei, kein Hash im Dateinamen
- Keine Größen-Decke für `.pfbackup` / `content`
- Keine Credential-/Backup-Verschlüsselung, keine MFA-PIN-Schlüsselbindung
  und keine zusätzliche Sicherheits-Bestätigung; der Hinweis ist kein Gate

---

## Sicherheit und Nutzerhinweis

**Geplante Umsetzung in Schnitt 3/4, noch nicht implementiert.** Maßgeblich
ist das am 2026-08-31 korrigierte Sicherheitsmodell in
[`settings-backup-classification.md`](settings-backup-classification.md#sicherheitsmodell-entschieden-schlank).

Provider-Credentials liegen als Klartext-JSON in `credentials_json` und werden
unverändert gesichert. Es gibt keine Verschlüsselung über die MFA-PIN und
keine Verschlüsselung des Archivs. Auch Base64, tgz-Kompression und
Manifest-Checksummen schützen nicht vor dem Lesen der enthaltenen Schlüssel.
In Format 2 kommen bei HTTPS gegebenenfalls private TLS-/ACME-Schlüssel hinzu.
Der Verzicht auf Anwendungsverschlüsselung ist eine bewusste Beta-Entscheidung;
die Datei ist trotzdem schützenswert, auch ohne Patientendaten.

**Platzierung:**

- Im bestehenden `BackupPanel` dauerhaft sichtbar vor den Aktionen zum
  Erstellen und Speichern/Exportieren der Sicherung, nicht erst als Toast
  nach dem Speichern. Der Hinweis gilt auch für HTTP-only-Sicherungen.
- Keine Wiederholung des Aufbewahrungshinweises in der Restore-Vorschau oder beim Recovery-Abschluss.
- Kein zusätzlicher Dialog, keine Checkbox und kein neues Restore-Gate.
  Bestehende HTTPS-Überschreibbestätigung unverändert. Kein zusätzlicher
  Hinweis im Update-Wizard; Pre-Update-Backups unterliegen demselben
  Sicherheitsmodell und dem allgemeinen Hinweis im Backup-Bereich.

**Copy (Praxis, ohne konkrete Schlüsselwerte):**

> Diese Sicherung ist nicht verschlüsselt. Eingerichtete API-Schlüssel für
> SMS und WhatsApp werden im Klartext mitgesichert. Bei HTTPS kann sie außerdem
> private Schlüssel enthalten. Bewahren Sie die Datei vor unbefugtem Zugriff
> geschützt auf, möglichst auf einem verschlüsselten Datenträger. Geben Sie
> die Sicherung nicht ungeschützt weiter.

Statischer Hinweis, keine neue Credential-Analyse oder Ausgabe von Key-Werten
in Inspect, UI oder Logs erforderlich. Keine Behauptung „durch PIN geschützt“.
Erstellen, Exportieren und Restore bleiben ohne zusätzliche Bestätigung möglich.

---

## Ist (Pilot, Format 1 + Geschwister)

```text
„Backup erstellen“
  Setup  →  backups/praxis-flow-backup-<ts>.pfbackup     JSON Format 1
         →  backups/praxis-flow-tls-<ts>.tgz             wenn TLS_STATE != off
  Main   →  Speichern-Dialog Kopie der .pfbackup
         →  still copyTlsSidecarBesideExportedBackup

„Wiederherstellen“
  Main   →  .pfbackup lesen (utf8) + sibling lookup
         →  ggf. zweiter Dialog wenn HTTPS und kein Treffer
  Setup  →  inspect/restore(content, tlsSidecarBase64)
```

Innere tgz (heute eigene Datei; in Format 2 Feld `tlsArchiveBase64`):

| Pfad im tgz     | Quelle auf dem Host                    |
| --------------- | -------------------------------------- |
| `manifest.json` | `installationId`, `hostname`, format 1 |
| `caddy-data/`   | `state/tls/caddy-data`                 |
| `caddy-config/` | `state/tls/caddy-config`               |
| `acme-dns.json` | `state/tls/acme-dns.json`              |
| `certs/`        | `state/tls/certs` (Custom-PEM)         |

Nicht in der inneren tgz: generiertes `Caddyfile`, `operator-token`.

Hauptcode: `packages/server-shared/src/pfbackup.ts`,
`setup/src/tls-backup-sidecar.ts`, `setup/src/settings-backup.ts`,
`settings-backup-inspect.ts`, `settings-backup-restore.ts`,
`manager/src/main/tls-sidecar-lookup.ts`, `pfbackup-dialog.ts`,
`restore-wizard-controller.ts`.

---

## Soll: eine JSON-Datei, Format 2

```json
{
  "manifest": {
    "pfbackupFormatVersion": 2,
    "createdAt": "ISO-8601",
    "settingsFormatVersion": 1,
    "entries": [
      { "name": "settings.json", "sha256": "<hex>", "byteLength": 123 },
      { "name": "manager-state.json", "sha256": "<hex>", "byteLength": 45 },
      { "name": "tls.tgz", "sha256": "<hex>", "byteLength": 678 }
    ]
  },
  "settingsJson": "{…pretty…}",
  "managerStateJson": "{…pretty…}",
  "tlsArchiveBase64": "<standard-base64 der inneren tgz>"
}
```

Integrität der **Teile**, nicht der Hülle: Manifest-`entries` wie heute.
HTTP-only: kein `tlsArchiveBase64`, `entries` nur die zwei Texte — **kein**
`tls.tgz`-Eintrag. SHA-256 und `byteLength` für `tls.tgz` = **Rohbytes der tgz**
(das Restore auspackt), nicht der Base64-String. Texte weiter
`stableJsonStringify` / `sha256HexUtf8`. Pretty-Print gilt nicht für die tgz.

`tls.tgz`-Entry **genau dann**, wenn `tlsArchiveBase64` nach Decode nichtleer
ist (XOR).

### Produktfluss

```text
„Backup erstellen“
  Setup  →  innere tgz packen (wenn TLS_STATE != off), dann eine JSON-Datei
  Main   →  Speichern-Dialog: nur diese Datei (utf8-Kopie)

„Wiederherstellen“
  Main   →  Datei lesen (utf8), content an Setup
  Setup  →  inspect/restore({ content })
             tlsArchiveBase64 → heutige Gates / Unpack
  Wizard →  Confirm nur wenn Praxis und Sicherung HTTPS, dann erst Restore
```

„Backup prüfen“ bleibt Archiv + Settings (Maintenance-API), **ohne** TLS-Gate.
HTTPS in der Sicherung sieht man an Inspect im Restore-Assistenten.

API bleibt `{ content }` plus `skipProviderCredentials` beim Restore.
`tlsSidecarBase64` entfällt mit Schnitt 2.

---

## Vertrag: Restore

Ziel = lebende `.env` (`currentTlsClaimsHttps`). Sicherung HTTPS = `tlsInBackup`.
Prepare-only in der Sicherung ist **kein** `tlsInBackup`. Heute kennt
`applyTlsRestorePlan` das Ziel nicht — Unpack/Wipe nur nach Sicherung; das ist
der Schnitt-2-Umbau, nicht der Ist-Stand.

| Fall                                                                                            | `restoreSupported`           | Aktion                                                                                           |
| ----------------------------------------------------------------------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------ |
| HTTP-only, `TLS_STATE=off`, kein Payload, Ziel HTTP                                             | ja, wenn die drei Kern-Gates | kein Unpack, kein Wipe                                                                           |
| Prepare-only, Payload passt, Ziel HTTP                                                          | ja                           | Unpack, TLS-Env aus Snapshot, Host-Pfade dieses Install-Home; Proxy darf an                      |
| Prepare-only, kein/nicht passendes Payload, Ziel HTTP                                           | ja + Warnung                 | `TLS_*` und Proxy-TLS-Keys weg, `wipeTlsStateRoot`                                               |
| `active`/`degraded` ohne HTTPS-Marker in `.env` (Sicherung)                                     | nein                         | Metadaten                                                                                        |
| Aktives HTTPS in der Sicherung ohne/nicht passendes Payload                                     | nein                         | kein Env-Schreiben                                                                               |
| Aktives HTTPS in der Sicherung, Payload passt, Ziel HTTP                                        | ja                           | Unpack, Caddyfile neu, Overlay-Pfade dieses Hosts; Proxy darf an; keine Extra-Frage              |
| Aktives HTTPS in der Sicherung, Payload passt, Ziel HTTPS                                       | ja                           | Confirm, dann Unpack wie oben                                                                    |
| Sicherung ohne HTTPS (`!tlsInBackup`, inkl. Prepare-only mit **oder** ohne Payload), Ziel HTTPS | ja, Kern-Gates               | Settings wie heute; Live-HTTPS behalten (siehe unten); kein Unpack, kein Wipe, keine Extra-Frage |

Match: `tlsSidecarMatches` (Logik gleich; Inspect-Felder `payloadPresent` /
`payloadMatches`). Leere ID oder leerer Hostname auf einer Seite = kein Match.

Kein Restore, das `https://` Canonical schreibt, ohne entpackten Caddy-State.

### Rückfrage: Praxis und Sicherung beide HTTPS

Zusätzlich zu `restoreSupported` — **nicht** als Gate, sondern als Bestätigung.

Auslöser: `currentTlsClaimsHttps` (lebende `.env`) **und** `tlsInBackup`
(Sicherung). Nicht allein das Ziel, nicht allein das Backup.

Keine extra Rückfrage — direkt Preview → Ausführen:

- Praxis HTTP, Sicherung mit HTTPS (Proxy darf an)
- Prepare-only auf dem Ziel
- Praxis HTTPS, Sicherung ohne HTTPS (HTTPS bleibt)

Inspect liefert `currentTlsClaimsHttps` **top-level** auf
`PfbackupInspectResult`. Wizard hängt nicht an einem Status-Snapshot.

Ablauf: Preview wie heute → wenn beide HTTPS: bestehender `ConfirmDialog`
(oder gleichwertige zweite Bestätigung **in diesem** Dialog). Abbrechen bleibt
auf Preview. Erst nach Ja: `restorePfbackup`. Dieselbe Bedingung für
Pre-Update und für `retryRestore` (kein zweiter Produktfall).

Copy (Praxis): HTTPS ist auf diesem Computer gerade aktiv. Wiederherstellen
ersetzt die aktuelle Zertifikatslage durch die Sicherung. Ohne Bestätigung
kein `stopStack`.

`applyTlsRestorePlan` liest die Live-`.env` **vor** `mergeConfigRestoreEnv`
und entscheidet Unpack/Wipe/Overlay am **Ziel**, nicht nur an der Sicherung.

HTTPS-Sicherung auf HTTPS-Ziel nach Confirm: Unpack wischt die Restore-Ziele
wie heute.

Praxis HTTPS, Sicherung ohne HTTPS (HTTP-only **oder** Prepare-only, Payload
egal): nicht den heutigen Discard-/Unpack-Zweig. Nach dem Merge die Live-Werte
zurück auf `CANONICAL_BASE_URL`, `PROXY_MODE`, `TLS_*`, Proxy-TLS-Host-/
Runtime-Keys. Sonst schreibt die Sicherung `http://` und `PROXY_MODE=http`
(Prepare zusätzlich `TLS_STATE=preparing` …) und HTTPS ist weg —
`writeEnvRecordAtomically` allein reicht nicht (die Keys stehen in der
Sicherung). `state/tls` unangetastet. Inspect-Warnung (kein Extra-Dialog):
HTTPS auf diesem Computer bleibt, die Sicherung enthält keins.

---

## Schnitte

Review stoppt nach jedem Schnitt. Breaking zwischen den Schnitten ist egal.
Sidecar-Schreiben und Request-`tlsSidecarBase64` enden in Schnitt 2.
`PFBACKUP_FORMAT_VERSION` und Create in Schnitt 2 auf 2 — dazwischen darf
Inspect rot sein. Kein zweiter Validate-Zweig für Format 1.

### Schnitt 1 — Shared Container + Inspect-Namen

`packages/server-shared/src/pfbackup.ts` (+ `pfbackup.test.ts`):

- Format-2-Typen: optionales `tlsArchiveBase64`, Entry-Union inkl. `'tls.tgz'`,
  XOR Entry/Bytes, Hash der tgz auf **dekodierte Rohbytes**.
  `buildPfbackupArchive` darf hier noch die alte Konstante schreiben
  (Create kommt in 2).
- `parsePfbackupArchive` muss `tlsArchiveBase64` **behalten** (heute fallen
  unbekannte Felder still weg).
- Hash-Helfer für tgz-Rohbytes (heute nur `sha256HexUtf8`).

`tls-backup.ts` (+ `tls-backup.test.ts`): Parameter `payloadPresent` /
`payloadMatches`. Helper `currentTlsClaimsHttps`.

Call-Sites **in diesem Schnitt** (keine Aliase):

- `setup/src/settings-backup-inspect.ts` (`buildPfbackupTlsInspectSummary`,
  `inspectPfbackup` setzt `currentTlsClaimsHttps`)
- `setup/src/settings-backup-restore.ts` (`applyTlsRestorePlan` — noch
  Request-`tlsSidecarBase64`)
- `setup/src/settings-backup-inspect.test.ts`
- `packages/server-shared/src/setup-api.ts`
- `manager/src/renderer/restore-wizard-flow.ts`,
  `restore-wizard-controller.ts`, zugehörige Tests

Inspect/Restore-Input in Schnitt 1 noch `content` + optional `tlsSidecarBase64`.

**Review:** Fixture HTTP (kein `tls.tgz`-Entry); mit Payload; Hash-Mismatch;
Entry ohne Bytes / Bytes ohne Entry; Base64-String ist nicht die tgz-Prüfsumme.

### Schnitt 2 — Setup Create / Inspect / Restore

`setup/src/settings-backup.ts`:

- `createPfbackup`: zuerst packen (Buffer/Temp, nicht neben die `.pfbackup`)
  wenn `TLS_STATE != off`, dann `buildPfbackupArchive` mit `tlsArchiveBase64`,
  Schreiben, `PFBACKUP_FORMAT_VERSION = 2`. Pack-Fehler → keine `.pfbackup`.
  `writeTlsSidecarBesideBackup` entfernen.
- Rückgabe `tlsSidecarPath` entfernen. `getPfbackupInfo.latestTlsSidecarPath`
  entfernen. Manager darf dafür in diesem Schnitt noch nicht kompilieren.

`tls-backup-sidecar.ts`: Pack/Unpack/Wipe/Parse-Manifest **behalten**.
`packTlsSidecarArchive` schreibt heute nur einen Pfad — Bytes für Base64 ohne
Geschwisterdatei.

Inspect/Restore: Validate Format 2. Payload aus `tlsArchiveBase64` an
`inspectTlsSidecarIdentity` / `applyTlsRestorePlan`. Request: nur `{ content }`
— extra `tlsSidecarBase64` ignorieren oder ablehnen. `server.ts` bereinigen.

Kein `tlsInBackup` und Ziel `currentTlsClaimsHttps` (HTTP-only **und**
Prepare-only, mit oder ohne Payload): nicht früh returnen und nicht den
heutigen Discard-/Unpack-Zweig. Nach Merge Live-HTTPS-Keys zurückschreiben
(`CANONICAL_BASE_URL`, `PROXY_MODE`, `TLS_*`, Proxy-TLS-Keys). Kein
`wipeTlsStateRoot`, kein Unpack.

Prepare-Discard nur wenn Sicherung Prepare ohne passendes Payload **und** Ziel
HTTP (`removeEnvKeys` + `wipeTlsStateRoot` wie heute). Prepare mit Payload,
Ziel HTTP: Unpack wie heute.

**Review:** Create `TLS_STATE=off` hat kein `tlsArchiveBase64`. Create mit
Prepare hat es. Restore aktiv ohne Payload wirft vor `stopStack`. Prepare-only
ohne Payload auf HTTP-Ziel wischt. HTTP- oder Prepare-Sicherung auf HTTPS-Ziel
lässt `https://` und `state/tls` (auch wenn Payload in der Datei liegt).
Stop-Fail ohne `state/tls`. Rollback nach Unpack-Fail stellt vorheriges
`state/tls` wieder her. Altes JSON-Format → ungültiges Archiv (deutsche
Meldung, nicht stilles HTTP-Backup).

### Schnitt 3 — Manager eine Datei

Entfernen:

- `manager/src/main/tls-sidecar-lookup.ts` (+ `tls-sidecar-lookup.test.ts`)
- IPC `IPC_READ_TLS_SIDECAR`, `IPC_SAVE_TLS_SIDECAR`
- `readTlsSidecar`, `saveTlsSidecar`, `copyTlsSidecarBesideExportedBackup`
- Restore-Wizard: zweiter Dialog, State `tlsSidecarBase64`
- `BackupPanel` Extra-Buttons, `exportTlsSidecar` / `inspectTlsSidecar`
- `latestTlsSidecarPath` in Maintenance-State/API

Anpassen:

- `savePfbackupToDisk`: Kopie nur der `.pfbackup`
- `readPfbackupFromDialog` / `inspectPfbackupFile`: weiter utf8-`content` +
  `filePath`
- `createPfbackup` Client-Typ ohne Sidecar-Pfad
- HTTPS-Block Copy: Zertifikat **in** der `.pfbackup`, sobald HTTPS
  vorbereitet ist; beide Dateien / Timestamp-Namen raus
- Sicherheitshinweis gemäß „Sicherheit und Nutzerhinweis“ im `BackupPanel`
  vor Erstellen/Export im Backup-Bereich; unabhängig von HTTPS
  und `skipProviderCredentials`, ohne zusätzlichen Dialog oder Key-Werte
- Restore-Wizard: Confirm vor `restorePfbackup` nur wenn `currentTlsClaimsHttps`
  **und** Sicherung `tlsInBackup`; Pre-Update und `retryRestore` dieselbe
  Bedingung. Tests: Confirm nötig / Abbrechen bleibt Preview / Praxis HTTP
  kein Extra-Dialog

Preload / `praxis-manager-api.ts` / `host-status.ts` /
`manager/src/shared/ipc-channels.ts` / `index.ts` (Main) mitziehen.
Inspect-Timeout in `manager/src/main/setup-api.ts` bleibt 30s.
`RestoreWizardDialog.svelte`, `ConfirmDialog` wie die anderen
Wartungs-Confirms. `BackupPanel` importiert `siblingTlsSidecarBasename` nicht
mehr.

**Review:** Wizard-Test ohne zweiten Dateidialog. Create+Save eine Datei.
Keine toten IPC-Kanäle. Confirm nur bei Praxis **und** Sicherung HTTPS.
Lesen bleibt utf8. Sicherheitshinweis vor Erstellen/Export sichtbar, auch bei HTTP-only. Kein Aufbewahrungshinweis im Restore.

### Schnitt 4 — Copy, Mock

- `BackupPanel.svelte`, Restore-Zeilen in `restore-wizard-flow.ts` (kein
  „Zertifikatsdatei“ als zweite Datei; Gate-Copy in `tls-backup.ts` mit)
- Mock `docs/mocks/lan-tls-wizard/` `renderMaintenance` — eine Datei, kein
  Sidecar-Button; Confirm wenn Praxis und Sicherung HTTPS
- `tls-model.js` Inspect-Copy ohne „Sidecar“
- Sicherheitshinweis in Produkt-Copy und Mock an denselben Stellen:
  unverschlüsselte API-Keys, gegebenenfalls private HTTPS-Schlüssel und
  geschützte Aufbewahrung/Weitergabe; keine PIN-Verschlüsselung behaupten
- `todo.md` Arbeitsstand

**Review:** Keine Sidecar/Pilot-Wörter in sichtbarer Copy. JSDoc darf intern
`tlsArchiveBase64` sagen. Sicherheitshinweis verständlich und vor den
betroffenen Aktionen sichtbar; keine zusätzlichen Bestätigungsschritte.

---

## Dateiliste (vollständig für den Cut)

| Bereich          | Dateien                                                                                                                                                                                                                                                                     |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Spec             | `docs/plan-backup-v2.md`, `docs/settings-backup-classification.md`                                                                                                                                                                                                          |
| Shared           | `pfbackup.ts`, `pfbackup.test.ts`, `setup-api.ts`, `tls-backup.ts`, `tls-backup.test.ts`, `index.ts` (`backup-path-labels.ts` nur wenn der Geschwisternamen-Export tot ist)                                                                                                 |
| Setup            | `settings-backup.ts`, `settings-backup-inspect.ts`, `settings-backup-restore.ts`, `tls-backup-sidecar.ts`, `env-file.ts` (`removeEnvKeys`), `server.ts`, `host-state.ts`, zugehörige `*.test.ts`; `settings-backup-update.ts` Parse/Create                                  |
| Manager Main     | `pfbackup-dialog.ts`, `tls-sidecar-lookup.ts` + Test löschen, `index.ts`, `setup-api.ts` (Timeout bleibt)                                                                                                                                                                   |
| Manager Shared   | `praxis-manager-api.ts`, `host-status.ts`, `ipc-channels.ts`                                                                                                                                                                                                                |
| Manager Preload  | `manager/src/preload/index.ts`                                                                                                                                                                                                                                              |
| Manager Renderer | `BackupPanel.svelte`, `MaintenanceView.svelte`, `maintenance-controller.ts`, `maintenance-view-model.ts`, `restore-wizard-*.ts`, `RestoreWizardDialog.svelte`, Tests (`restore-wizard-controller.test.ts`, `restore-wizard-flow.test.ts`, `maintenance-controller.test.ts`) |
| Mock             | `app.js`, `tls-model.js`, ggf. `tls-model.test.js`                                                                                                                                                                                                                          |

`settings-backup-update.ts` erzeugt das Pre-Update-Backup über `createPfbackup`
— nach Schnitt 2 Format 2. Parse dort nutzt Settings, nicht die tgz.

Sicherung ohne HTTPS (`!tlsInBackup`) auf HTTPS-Ziel: Live-HTTPS-Keys nach dem
Merge zurück, keine Remove-Liste, kein Unpack. Prepare-Discard nur wenn das
**Ziel** kein HTTPS beansprucht.

---

## Stolpersteine (am Code)

1. **`parsePfbackupArchive` verwirft Extra-Felder.** `tlsArchiveBase64` muss
   explizit übernommen werden.
2. **Teile-Hashes:** `tls.tgz` = dekodierte Rohbytes. Texte = utf8 wie heute.
3. **Inspect-Timeout 30s** (`manager/src/main/setup-api.ts`; Restore 10 min).
   `readJsonBody` in `setup/src/server.ts` hat kein eigenes Limit.
4. **`writeEnvRecordAtomically` löscht keine fehlenden Keys** — und überschreibt
   Keys, die in der Sicherung stehen. Sicherung ohne HTTPS auf HTTPS-Ziel:
   Live-Canonical/`PROXY_MODE`/`TLS_*` nach dem Merge zurück, sonst wird HTTPS
   de facto abgeschaltet (Prepare-Sicherung schreibt außerdem `TLS_*`).
   Prepare-Discard nur Ziel HTTP: weiter `removeEnvKeys` + `wipeTlsStateRoot`.
   Live-`.env` vor dem Merge lesen. Heute wischen Prepare-ohne-Sidecar und
   Unpack-bei-Treffer **ohne** Zielprüfung.
5. **Unpack darf nicht vor Rollback** `ensureProxyTlsPaths` rufen.
6. **Host-Pfade** im Restore-Env sind immer dieses `installHome`.
7. **Caddyfile** nach Unpack neu (`writeGeneratedTlsCaddyfile`).
8. **`createPfbackup`-Rückgabe und Info-Endpoint** hängen am Sidecar-Pfad.
9. **Innere tar-Validierung** (`ALLOWED_TOP_LEVEL`) bleibt. Äußeres bleibt JSON.
10. **Create packt zuerst, schreibt dann eine Datei.** Heute: JSON, dann
    Sidecar. `packTlsSidecarArchive` schreibt nur einen Pfad.
11. **Main bleibt utf8.**

---

## Tests (Minimum)

Ohne öffentliche ACME-Anträge:

- Shared (Schnitt 1): Mitglieder HTTP (kein `tls.tgz`); +Payload Checksum auf
  Rohbytes; XOR Entry/Bytes; Base64-String ≠ tgz-Prüfsumme
- Shared/Setup (Schnitt 2): JSON Format 2 HTTP; Format 2 + `tlsArchiveBase64`;
  altes JSON ungültig; keine Geschwister-`.tgz` neben der Datei
- Inspect: aktiv ohne Payload → block + deutsche Meldung; Prepare ohne Payload
  → warning + restoreSupported; Match braucht ID und Hostname beidseitig;
  `currentTlsClaimsHttps` aus lebender `.env`
- Restore: Unpack aus `tlsArchiveBase64`; kein Host-Pfad-Parameter; Stop-Fail
  ohne `state/tls`; Rollback nach Unpack; Sicherung ohne HTTPS (HTTP-only
  oder Prepare-only, mit oder ohne Payload) auf HTTPS-Ziel behält Canonical
  `https://` und `state/tls`
- Manager: Restore-Wizard ein Dateidialog; kein `readTlsSidecar`; Confirm nur
  wenn Praxis und Sicherung HTTPS; `retryRestore` dieselbe Rückfrage;
  Abbrechen ohne `stopStack`; Datei wird utf8 gelesen
- Copy/UI (Schnitt 3/4): Sicherheitshinweis im Backup-Bereich vor Erstellung/Export sichtbar — mit und ohne HTTPS. Klartext-API-Keys und sichere Aufbewahrung
  ausdrücklich genannt; keine konkreten Keys und keine behauptete
  PIN-Verschlüsselung. Kein neuer Dialog und kein zusätzliches Restore-Gate.

Bewusst kein E2E-Let's-Encrypt.

---

## Review-Beschlüsse (2026-08-30)

1. Altes Format egal — nicht lesen, keine Migration.
2. Private Keys / ACME in der einen `.pfbackup` ok (lokale Praxis).
3. Keine Größen-Decke.
4. Integrität = Teile-Hashes im Manifest (`tls.tgz` = Rohbytes). Kein
   Dateiname-Hash, kein Gesamt-Hash der JSON.
5. `payloadPresent` / `payloadMatches` in Schnitt 1 inkl. Setup- und
   Wizard-Call-Sites. `tls-backup-sidecar.ts` behält den Dateinamen.
6. Breaking zwischen den Schnitten ok. Format 2 verlangen, sobald Create 2
   schreibt — kein Schon-Zweig.
7. Confirm nur wenn Praxis **und** Sicherung HTTPS. Praxis HTTP: Restore ohne
   Extra-Frage, Proxy darf an. Praxis HTTPS + Sicherung ohne HTTPS (inkl.
   Prepare-only in der Sicherung, Payload egal): HTTPS bleibt (Live-Env, kein
   Wipe, kein Unpack). Prepare-Discard nur am HTTP-Ziel.
8. `currentTlsClaimsHttps` top-level; Helper in `tls-backup.ts`.
9. Request-`tlsSidecarBase64` erst in Schnitt 2 weg, mit Create.
10. Äußeres Format JSON. Innere tgz als `tlsArchiveBase64`.

HTTPS-Block: Hinweis, keine Extra-Buttons. Pre-Update: kein Extra-Text.

---

## Ergänzender Review-Beschluss (2026-08-31)

Klartext-Credentials in DB und `.pfbackup` werden für die Beta bewusst
akzeptiert; die frühere Zusage einer MFA-PIN-gebundenen Verschlüsselung gilt
nicht. Backup v2 muss den Schutzbedarf mit dem oben festgelegten Hinweis
sichtbar machen. Das ist eine Copy/UI-Anforderung, kein Verschlüsselungsprojekt
und kein zusätzlicher Bestätigungsdialog.

---

## Reihenfolge

1 Shared (Typen, Teile-Hashes, Feldnamen + Call-Sites) → Review
2 Setup Create/Inspect/Restore: Payload in die JSON, Request-Feld weg → Review
3 Manager eine Datei + Confirm nur beide HTTPS → Review
4 Copy/Mock → Review
