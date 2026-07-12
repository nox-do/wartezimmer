# Release-Pakete, Images und Versionierung

Stand: 2026-07-12

Dieses Dokument beschreibt, **welche Versionen es gibt**, **wie Images gebaut werden** und **was der Praxis Flow Manager** erwartet. Ziel: keine Vermischung von Manager-Semver, Stack-Release-Tag und npm-Monorepo-Version.

---

## Drei verschiedene „Versionen“

| Begriff | Beispiel | Wo definiert | Wofür |
|--------|----------|--------------|--------|
| **Manager-Version** | `0.2.0` | `manager/package.json` (`version`) | Electron-App, DMG-Name, Kompatibilitätsprüfung beim Update |
| **Stack-Release-Version** | `2026.08.0` oder `0.2.0` | Parameter `--version` beim Build | Docker-Image-Tags, `manager-state.json`, `.pfupdate`-Manifest |
| **Monorepo-Version** | `0.2.0` | Root-`package.json` | npm-Workspaces, **nur Default** wenn `--version` fehlt |

**Wichtig:** Stack-Release-Version und Monorepo-Version sind **nicht automatisch gekoppelt**. Für Kunden-Releases immer explizit setzen:

```bash
export PRAXIS_FLOW_RELEASE_VERSION=2026.08.0
npm run release:pfupdate -- --version 2026.08.0
```

Empfehlung für ausgelieferte Stack-Releases: **kalenderbasiertes Tag** (`YYYY.MM.P`) — unabhängig von der Manager-Semver. Die Manager-App kann öfter patch-releasen (`0.2.1`) ohne neues Stack-Paket.

---

## Zwei Auslieferungsartefakte

| Artefakt | Build | Manager-Flow | Inhalt |
|----------|-------|--------------|--------|
| **`.pfupdate`** | `npm run release:pfupdate` | **Wartung → Software-Update** | Eine Datei: Manifest, Checksummen, Image-Tar (app+sandbox+gateway), Compose-Templates |
| **`.tar.gz` + Sidecar** | `npm run release:images` | **Setup-Wizard → Release-Paket wählen** (Erstinstallation) | Nur app+sandbox, `manifest.json` + `SHA256SUMS.txt` neben der Datei |

Updates laufen **nur** über `.pfupdate`. Der Wizard bleibt beim älteren Sidecar-Format (nur Erstinstallation, kein Cutover/Rollback).

---

## Docker-Images

### Repositories und Tags

Alle Delivery-Images folgen dem Muster:

```
praxis-flow/app:<releaseVersion>
praxis-flow/sandbox:<releaseVersion>
praxis-flow/gateway:<releaseVersion>
```

`<releaseVersion>` muss **identisch** sein mit:

- `manifest.releaseVersion` in `.pfupdate`
- `manifest.images.*` (strikt geprüft in `pfupdate.ts`)
- optional sichtbar in `manager-state.json` → `release.releaseVersion`

### Lokale Dev-Tags

```bash
docker compose build   # praxis-flow/app:local, sandbox:local, gateway:local
npm run release:pfupdate:current   # packt Tags :local in .pfupdate (ohne Rebuild)
```

---

## `.pfupdate`-Paket (Wartung / Update)

### Layout (nach Extraktion)

```
manifest.json
SHA256SUMS.txt
images/praxis-flow-images.tar      ← docker save, unkomprimiert
templates/docker-compose.delivery.yml
templates/docker-compose.gateway.delivery.yml
templates/.env.example               ← Image-Tags gesetzt
```

Dateiname: `praxis-flow-update-<releaseVersion>.pfupdate` (gzip-tar, eine Datei).

### Manifest (Auszug)

```json
{
  "updateFormatVersion": 1,
  "releaseVersion": "2026.08.0",
  "minimumManagerVersion": "0.2.0",
  "supportedSettingsFormatVersions": [1],
  "targetSchemaVersion": 1,
  "images": {
    "app": "praxis-flow/app:2026.08.0",
    "sandbox": "praxis-flow/sandbox:2026.08.0",
    "gateway": "praxis-flow/gateway:2026.08.0"
  },
  "files": [ … SHA-256 + byteLength … ]
}
```

### Kompatibilität beim Update

Setup prüft vor Cutover (Manager sendet automatisch):

| Prüfung | Quelle |
|---------|--------|
| Paket strukturell + Checksummen | `pfupdate.ts` / `pfupdate-package.ts` |
| Manager ≥ `minimumManagerVersion` | `manager/package.json` → `applyPfupdate` |
| Settings-Format | `HostStatus.settingsFormatVersion` (Maintenance-App, sonst Build-Default) |
| DB-Schema-Generation nach Cutover | `targetSchemaVersion: 1` → Fresh DB + Settings-Import |

**Regel:** Beim Bau eines `.pfupdate` setzt `build-pfupdate.mjs` `minimumManagerVersion` standardmäßig auf die **aktuelle** `manager/package.json`-Version. Ein Stack-Paket darf **nicht** eine höhere Mindest-Manager-Version verlangen als die Manager-Version, mit der es getestet wurde.

---

## Build-Befehle (intern)

### Stack-Update für Kunden (Hauptweg)

```bash
# 1. Version festlegen
export PRAXIS_FLOW_RELEASE_VERSION=2026.08.0

# 2. Images bauen + .pfupdate packen + Roundtrip-Validierung
npm run release:pfupdate -- --version "$PRAXIS_FLOW_RELEASE_VERSION"

# Ergebnis:
#   dist/releases/praxis-flow-update-2026.08.0.pfupdate
```

Nur packen (Images existieren lokal):

```bash
npm run release:pfupdate:pack -- --version 2026.08.0
```

### Erstinstallation (Wizard)

```bash
npm run release:images -- --version 2026.08.0
# dist/releases/praxis-flow-2026.08.0/
#   praxis-flow-2026.08.0-images.tar.gz
#   manifest.json
#   SHA256SUMS.txt
```

### Manager-DMG (separater Release-Zyklus)

```bash
npm run dist:manager:mac
# manager/dist/Praxis Flow Manager-<managerVersion>-<arch>.dmg
```

Manager- und Stack-Release sind **getrennte** Artefakte. Praxis erhält typischerweise:

1. Manager-DMG (selten, bei neuer Manager-Generation)
2. `.pfupdate` (regelmäßig, Stack-Updates)

---

## Laufzeit: wo die Version sichtbar ist

| Ort | Feld | Bedeutung |
|-----|------|-----------|
| Manager UI Wartung | Software-Update „Aktuell“ | `HostStatus.deliveryImages` / `manager-state.json` |
| `manager-state.json` | `release.releaseVersion` | Zuletzt aktives Stack-Release |
| `.env` | `PRAXIS_FLOW_*_IMAGE` | Aktive Compose-Image-Refs |
| `.pfbackup` | Settings + manager-state Snapshot | Stand vor Restore/Update |

Nach erfolgreichem Update schreibt der Orchestrator neue Image-Tags und `releaseVersion` atomar.

---

## Release-Checkliste (Stack)

1. **Manager-Version** prüfen: Ist `minimumManagerVersion` im Paket ≤ ausgelieferte Manager-DMG?
2. **`PRAXIS_FLOW_RELEASE_VERSION`** setzen (nicht nur Root-`package.json` vertrauen)
3. `npm run release:pfupdate -- --version …` — „Package validation OK“
4. `.pfupdate` an Kunden (Drive o. ä.)
5. Kunde: Manager → Wartung → **Update-Paket wählen …** (Stack muss laufen für Settings-Backup)
6. Optional: Pre-Update-`.pfbackup` liegt unter `~/…/backups/` auf dem Host

---

## Häufige Fehler

| Symptom | Ursache |
|---------|---------|
| „Manager-Version … zu alt“ | `.pfupdate` verlangt höhere `minimumManagerVersion` als installierter Manager |
| „images.gateway muss … sein“ | `--version` weicht von Image-Tags ab oder Manifest manuell editiert |
| Update bricht bei Backup ab | Stack/App nicht erreichbar (Maintenance `:8082`) — Praxis muss laufen |
| Wizard findet Gateway nicht | `release:images` liefert nur app+sandbox — Gateway kommt erst mit vollem Stack / `.pfupdate` |

---

## Verwandte Dokumente

- [`deployment-docker.md`](deployment-docker.md) — Compose, Volumes, Betrieb
- [`settings-backup-classification.md`](settings-backup-classification.md) — Was beim Update erhalten bleibt
- [`../manager/README.md`](../manager/README.md) — Manager-Architektur und Setup-API
- [`../packages/server-shared/src/pfupdate.ts`](../packages/server-shared/src/pfupdate.ts) — Format-Validierung (Source of Truth)
