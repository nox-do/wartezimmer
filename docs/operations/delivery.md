# Auslieferung, Erstinstallation & Update

Stand: 2026-08-31 · delivery ausgearbeitet (inkl. Update §5)

**Scope:** Was kommt an, wie Versionen und Artefakte zusammenhängen; danach Install & Update.
**Nicht hier:** Compose/Volumes/Ports → [`runtime.md`](runtime.md) · LAN-TLS-Betrieb → [`tls.md`](tls.md) · Settings-Inhalt → [`backup.md`](backup.md) · Container-Innenleben → [`../architecture/`](../architecture/)

Format-Validierung `.pfupdate`: `packages/server-shared/src/pfupdate.ts` (Code = Vertrag).

---

## 1. Prinzip

Der Stack kommt als **versionierte Container-Images** zur Praxis. Dort wird **nicht** aus dem Monorepo gebaut — Images laden, Host-Zustand pflegen, Compose starten.

```text
Build (Repo)  →  Artefakte (.pfinstall / .pfupdate / Manager-DMG)
                     ↓
Manager + Setup-API (Loopback, Manager-Child)  →  Install-Home (.env, manager-state, Templates)
                     ↓
Docker Compose  →  app + sandbox (+ optional proxy)
```

| Rolle             | Verantwortung                                                 |
| ----------------- | ------------------------------------------------------------- |
| **Release-Build** | Images taggen, Pakete bauen, Manifest/Checksummen             |
| **Manager**       | Operative Hülle: Wizard, Wartung, Update-UI                   |
| **Setup-API**     | Host schreiben, `docker load` / Compose, Probes               |
| **Architektur**   | Was in `app`/`sandbox` läuft — nicht wie es ausgeliefert wird |

---

## 2. Versionen

Drei Zahlen — nicht vermischen:

| Begriff             | Beispiel | Wo                                                     | Wofür                                                                                            |
| ------------------- | -------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| **Manager-Version** | `6.1.0`  | `manager/package.json`                                 | Electron-App, DMG-Name, `minimumManagerVersion` im Update-Paket                                  |
| **Stack-Release**   | `6.1.0`  | `--version` / `PRAXIS_FLOW_RELEASE_VERSION` beim Build | Image-Tags `praxis-flow/app:<ver>` + `sandbox:<ver>`, `manager-state`, Manifest `releaseVersion` |
| **Monorepo**        | `6.1.0`  | Root-`package.json`                                    | npm-Workspaces — **nur Default**, wenn `--version` fehlt                                         |

Stack-Release und Monorepo sind **nicht gekoppelt**. Kunden-Release immer explizit:

```bash
export PRAXIS_FLOW_RELEASE_VERSION=6.1.0
npm run release:pfupdate -- --version "$PRAXIS_FLOW_RELEASE_VERSION"
```

**Anzeige (keine vierte Version):** Beim App-Image-Build setzt `scripts/release-app-image.mjs` `PRAXIS_FLOW_STACK_VERSION` auf denselben Wert wie `--version`. Die UI liest ihn über `GET /api/v1/ops/health` → `stackVersion`. Lokal/Dev: Feld leer.

**Empfehlung:** Stack-Tags als Semver, unabhängig von der Manager-Semver (Manager darf öfter patchen). Major am Stack bei Breaking Changes an API/Images.

**Zur Laufzeit sichtbar:**

| Ort                  | Feld                     | Bedeutung                                     |
| -------------------- | ------------------------ | --------------------------------------------- |
| Manager → Wartung    | aktuelles Release        | `HostStatus.deliveryImages` / `manager-state` |
| `manager-state.json` | `release.releaseVersion` | aktives Stack-Release                         |
| `.env`               | `PRAXIS_FLOW_*_IMAGE`    | Compose-Image-Refs                            |
| Health               | `stackVersion`           | in die App eingebranntes Release              |

---

## 3. Artefakte

| Artefakt                   | Build                      | Manager-Weg               | Inhalt (Produkt)                                                           |
| -------------------------- | -------------------------- | ------------------------- | -------------------------------------------------------------------------- |
| **`.pfinstall` + Sidecar** | `npm run release:images`   | Wizard → Release-Paket    | Images, Compose-Templates, Basis-Caddyfile, Manifest, SHA256, Caddy-Lizenz |
| **`.pfupdate`**            | `npm run release:pfupdate` | Wartung → Software-Update | dasselbe plus Compose-Templates, `.env.example`; Cutover/Rollback          |
| **Manager-DMG**            | `npm run dist:manager:mac` | Installation der Hülle    | Electron + eingebettete Setup-API/Templates; eigener Versionszyklus        |

- Updates laufen **nur** über `.pfupdate`. Das Wizard-`.pfinstall` ist Erstinstall (kein Update-Cutover).
- Manager-DMG selten neu; unsigned/nicht notarisiert (interne Auslieferung).

### Image-Refs

```text
praxis-flow/app:<releaseVersion>       # Pflicht
praxis-flow/sandbox:<releaseVersion>   # Pflicht
praxis-flow-proxy:2.11.4-acmedns       # neue Pakete (PRAXIS_FLOW_PROXY_IMAGE)
caddy:2.11.4                           # Compose-Default / Legacy-Pakete ohne Custom-Proxy
```

Konstante im Code: `PRAXIS_FLOW_PROXY_IMAGE_REF` in `packages/server-shared/src/pfupdate.ts`.

`<releaseVersion>` muss übereinstimmen mit Manifest `releaseVersion`, gesetzten versionierten `images.app|sandbox` und `manager-state` → `release.releaseVersion`.

**Proxy in der Auslieferung:** Custom-Image (xcaddy + `dns.providers.acmedns`) liegt im Paket, startet **nicht** von allein. Aktivierung über Manager/Setup (`PROXY_ENABLED`). Delivery-Compose setzt `pull_policy: never` für app, sandbox, proxy — keine Registry-Nachzüge in der Praxis. Betrieb und TLS: [`tls.md`](tls.md). Base-Image nur über freigegebenen Digest pullen (Build); Manifest trägt Registry-Digest + Archive-Image-ID + Plattform. Ältere Pakete mit `images.proxy=caddy:2.11.4` bleiben gültig.

**Dev-Tags:**

```bash
docker compose build                                  # praxis-flow/app:local, sandbox:local
npm run release:pfupdate:current -- --version local   # packt :local ohne Rebuild
```

### Build-Scripts (kurz)

| Script                          | Zweck                                                         |
| ------------------------------- | ------------------------------------------------------------- |
| `release:images` / `:current`   | Erstinstall-Archiv; `:current` packt vorhandene lokale Images |
| `release:pfupdate` / `:current` | Update-Paket; `:current` packt vorhandene lokale Images       |
| `dist:manager:mac`              | Manager-DMG                                                   |

Pipelines und Ausgabe-Layouts: [§6](#6-build-wie-die-artefakte-entstehen).

CI: `.github/workflows/release-images.yml` baut bei Tag `v*` das Erstinstall-Artifact — **nicht** automatisch `.pfupdate`/DMG.

---

## 4. Erstinstallation

**Kundenweg:** Praxis Flow Manager (Assistent).
**Support-Fallback:** CLI `npm run setup`.
**TLS-Details** (Schritt HTTPS + später Cutover): [`tls.md`](tls.md).

### 4.1 Voraussetzungen

| Bedarf                                                                        | Warum                                                                                                                                   |
| ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| **Docker** (Desktop oder Engine) + Compose v2, Daemon läuft                   | Stack starten; Wizard-Schritt 1 prüft Installation/Daemon/Compose                                                                       |
| **Manager** (DMG oder `npm run dev:manager`)                                  | Operative Hülle; startet die Setup-API als eigenen Child auf Loopback (ephemerer Port, nicht still `:9190`)                             |
| **Release-Paket** `.pfinstall` + Sidecar (`manifest.json` / `SHA256SUMS.txt`) | Delivery: Images laden (`POST /api/setup/host/images/load`). Dev-Profil (`PRAXIS_FLOW_COMPOSE_PROFILE=dev`): oft **nicht** erforderlich |
| **Freie Ports**                                                               | App intern am Host immer **8080** (ohne Proxy offen, mit Proxy nur Loopback); Proxy zusätzlich **80** und bei TLS **443**               |
| **Import- & Export-Ordner** auf dem Host                                      | Wizard-Schritt 2; unter Docker Desktop: File Sharing für diese Pfade                                                                    |
| **Feste LAN-IPv4** / DHCP-Reservierung                                        | Für Demo ohne Proxy optional; für Proxy-Staff-Binding, Geräte-URLs und TLS verbindlich                                                  |

Setup-API und Manager sprechen nur Loopback — kein Setup aus dem Praxis-LAN.

### 4.2 Install-Home

| Plattform | Default ohne `PRAXIS_FLOW_HOME`            |
| --------- | ------------------------------------------ |
| macOS     | `~/Library/Application Support/PraxisFlow` |
| Windows   | `%ProgramData%\PraxisFlow`                 |
| Linux     | `~/.local/share/PraxisFlow`                |

Override: `PRAXIS_FLOW_HOME` (absolut). Compose-Projektname: Default-Install-Home → `praxis-flow`; abweichender Basename → `pf-<basename>`; Override `COMPOSE_PROJECT_NAME` — isoliert parallele Test-Installs.

Der Manager speichert sein Electron-Profil einschließlich Chromium-Cache,
Preferences und Session Storage im Unterordner `manager/` des Install-Home;
Manager-Logs liegen in `manager/logs/`. `.env`, Compose-Dateien, `state/`,
`updates/`, `rollback/` und `backups/` behalten ihre bestehenden Pfade.
Diese Profildaten gehören nicht zum fachlichen `.pfbackup`.

Der Manager legt ausschließlich die neue Profilstruktur an. Es gibt keine
Migration oder Übernahme aus dem bisherigen separaten Ordner `Praxis Flow`.

Dev-Manager verwenden `manager/instance-<Hash des Install-Home>` unter dem
plattformüblichen `PraxisFlow`-Ordner. Ihr Setup arbeitet weiterhin im
Repository beziehungsweise im expliziten `PRAXIS_FLOW_HOME`. So landen
Electron-Profile nicht im Quellcode und verschiedene Dev-Instanzen bleiben
getrennt. Die Profilpfade werden vor dem Single-Instance-Lock und `app.ready`
festgelegt. Diese Änderung benötigt einen neuen Manager-Build; ein reines
`.pfupdate` ersetzt den Electron-Main-Prozess nicht.

Beim ersten Start kopiert Setup fehlende Templates (`.env.example`, Delivery-Compose, Proxy-Overlays) ins Install-Home.

Zurücksetzen (Dev/Support): `npm run setup:reset -- --yes` (löscht Install-Home-Inhalt nach Compose-Down — mit Bedacht).

### 4.3 Erstinstallation im Manager

Der verbindliche Ablauf einschließlich Prepare/Commit, Bestätigung bei
Neuinstallation, Backup-Übernahme und Fehlerbehandlung steht unter
[Neuinstallation und Recovery](reinstall-recovery.md).
Die fünf aktuellen Assistentenschritte beschreibt das
[Manager-README](../../manager/README.md#install-wizard-assistent).
HTTPS wird anschließend ausschließlich unter Netzwerk eingerichtet.

Nach Apply: MFA/Ops-PIN Standard **`0000`** (änderbar in der App; Reset im Manager → Wartung).

### 4.4 CLI-Fallback

```bash
npm run setup                 # interaktiv: LAN-IP, Praxisname, Compose
npm run setup:reset -- --yes
```

Abweichungen zum Manager: CLI fragt den **Praxisnamen**. Captive-/Gateway-Einrichtung gibt es nicht mehr (Portal-v1: Restricted-Netz).

### 4.5 Dev-Iteration

```bash
export PRAXIS_FLOW_HOME=/tmp/pf-dev-001
export PRAXIS_FLOW_COMPOSE_PROFILE=dev
npm run setup:reset -- --yes
npm run dev:manager
```

Dev baut lokal (`docker-compose.yml`); Release-Paket oft nicht nötig.

### 4.6 Fallstricke

| Symptom                                      | Typische Ursache                     | Was tun                                                                  |
| -------------------------------------------- | ------------------------------------ | ------------------------------------------------------------------------ |
| Schritt 1 blockiert: Docker                  | Daemon aus / Compose fehlt           | Docker Desktop starten; Hinweise aus Setup                               |
| „Release-Paket fehlt“ / Images nicht geladen | Delivery ohne `docker load`          | `.pfinstall` + passenden Sidecar wählen; Laden kann Minuten dauern       |
| SHA256-Fehler beim Laden                     | Sidecar ≠ Archiv                     | Gleichen Release-Ordner verwenden, nicht mischen                         |
| Port 8080 belegt                             | anderer Container/Prozess            | Docker-Fehler im Start-/Apply-Ergebnis prüfen; Portkonflikt beheben      |
| „Import- und Exportordner angeben“           | leere Pfade                          | Ordner anlegen; Docker File Sharing                                      |
| Keine / falsche LAN-IP; `lanIpStale`         | DHCP-Wechsel, VPN, Adapter           | IP neu wählen; bei TLS-Lease erst IP klären (stale blockiert Lease)      |
| HTTPS unter Netzwerk noch nicht startbar     | Proxy aus                            | Port 80 unter Netzwerk aktivieren und Einstellungen übernehmen           |
| Geräte nach HTTPS-Vorbereitung noch auf HTTP | erwartet                             | Cutover erst nach DNS/Zertifikat unter **Netzwerk** — [`tls.md`](tls.md) |
| LAN rot, lokal grün (Dev)                    | Shell-`HTTP_PROXY` leitet RFC1918 um | `NO_PROXY` um Privatnetze ergänzen; siehe Manager-README                 |
| Praxisname fehlt im Wizard                   | Absicht                              | Ops `/ops/setup` nach dem ersten Start                                   |
| Gateway im Manager nicht wählbar             | Absicht (Produktgrenze)              | Captive = Praxis-IT / Lab — [`integrations.md`](integrations.md)         |

## 5. Update (`.pfupdate`)

**Einziger unterstützter Update-Weg:** Manager → Wartung → Software-Update → eine `.pfupdate`-Datei.
Erstinstall-`.pfinstall` ist **kein** Update. Manuelles Tag-Tauschen in `.env` + `compose up` ist nur Support-Notfall **ohne** Settings-Cutover/Rollback.

Paket bauen: [§6.2](#62-update--npm-run-releasepfupdate). Was Settings behalten: [`backup.md`](backup.md).

### 5.1 Voraussetzungen

| Bedarf                                          | Warum                                                        |
| ----------------------------------------------- | ------------------------------------------------------------ |
| Laufende Installation (`.env`, `manager-state`) | Sonst Apply: „Keine .env — Setup zuerst“                     |
| **Stack läuft** vor Apply                       | Pre-Update-`.pfbackup` über Maintenance-App `127.0.0.1:8082` |
| Manager ≥ `minimumManagerVersion` im Paket      | Inspect/Apply lehnen ältere Manager ab                       |
| Passendes Settings-Format                       | `supportedSettingsFormatVersions` (heute `[1]`)              |
| Docker Daemon                                   | `docker load` + Compose stop/up                              |

Apply-Timeout im Manager: **15 Minuten** (`UPDATE_APPLY_TIMEOUT_MS` / gleich für Image-Load).

### 5.2 Ablauf (UI)

1. `.pfupdate` wählen
2. **Inspect** — `POST /api/setup/host/update/inspect` (Struktur, Checksummen, Kompatibilität, Release-Vergleich)
3. **Vorschau** — Ziel-/Ist-Release, Mindest-Manager, Settings-Formate, Schema
4. **Bestätigen** — automatisches Praxis-Backup; Queue geht verloren; Praxis kurz offline
5. **Apply** — `POST /api/setup/host/update/apply`

UI-Phasen: `inspect` → `preview` → `applying` → `success` | `failed` (`pfupdate-wizard-flow.ts`).

### 5.3 Kompatibilität

| Prüfung                           | Quelle                                                                   |
| --------------------------------- | ------------------------------------------------------------------------ |
| Archiv + Manifest + SHA256        | `packages/server-shared/src/pfupdate.ts` / `validateExtractedPfupdate`   |
| Manager ≥ `minimumManagerVersion` | Manager sendet Version mit; Build setzt Default = `manager/package.json` |
| Settings-Format                   | laufende Maintenance-App oder Build-Default                              |
| Image-Tags = `releaseVersion`     | Pflicht für app/sandbox                                                  |
| Nach Cutover                      | `targetSchemaVersion: 1` → Fresh DB + Settings-Import                    |

**Regel:** Ein `.pfupdate` darf keine höhere `minimumManagerVersion` verlangen als die Manager-DMG, mit der es freigegeben wurde.

### 5.4 Apply-Phasen (Ist-Code)

Vorbereitung (**Stack noch oben**, Backup über `:8082`):

| Phase                    | Aktion                                            |
| ------------------------ | ------------------------------------------------- |
| `stage_package`          | Archiv extrahieren                                |
| `validate_package`       | Struktur + Kompatibilität                         |
| `create_settings_backup` | `.pfbackup` → u. a. `<install-home>/backups/`     |
| `load_images`            | `docker load` aus `images/praxis-flow-images.tar` |

Cutover (**Stack gestoppt**):

| Phase                   | Aktion                                                                                                                                                                                                                                                        |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `stop_stack`            | `compose stop`                                                                                                                                                                                                                                                |
| `backup_rollback_state` | Snapshot `.env`, `manager-state`, Templates, DB-aside                                                                                                                                                                                                         |
| `install_templates`     | Compose/Caddy-Templates aus Paket                                                                                                                                                                                                                             |
| `write_release_state`   | Image-Tags + `releaseVersion` atomar                                                                                                                                                                                                                          |
| Fresh-DB-Cutover        | alte DB beiseite → App mit neuem Image → Settings importieren → aktive Gerätefreigaben aus Aside kopieren → verifizieren → Full-Stack + Health (`fresh-db-settings-cutover.ts`; Phasen u. a. `move_database` … `copy_device_authorizations` … `health_check`) |

Bei Fehler **nach** Rollback-Artefakten: `executeUpdateRollback()` stellt den vorherigen Zustand wieder her. Pre-Update-`.pfbackup` bleibt als Datei erhalten.

Fresh-DB-Cutover ist dasselbe Muster wie Restore, **außer** dass Restore die Gerätefreigaben nicht kopiert — Details: [`backup.md`](backup.md).

### 5.5 Manifest (Auszug)

```json
{
  "updateFormatVersion": 1,
  "releaseVersion": "2.1.0",
  "minimumManagerVersion": "0.3.0",
  "supportedSettingsFormatVersions": [1],
  "targetSchemaVersion": 1,
  "images": {
    "app": "praxis-flow/app:2.1.0",
    "sandbox": "praxis-flow/sandbox:2.1.0",
    "proxy": "praxis-flow-proxy:2.11.4-acmedns"
  },
  "imageDigests": {
    "proxy": {
      "registryDigest": "sha256:…",
      "archiveImageId": "sha256:…",
      "platform": "linux/arm64"
    }
  }
}
```

### 5.6 Fallstricke

| Symptom                           | Ursache                                    | Was tun                           |
| --------------------------------- | ------------------------------------------ | --------------------------------- |
| „Manager-Version … zu alt“        | Paket verlangt neueren Manager             | Manager-DMG zuerst aktualisieren  |
| Inspect/Apply: Settings-Format    | Format-Mismatch                            | passendes Paket / neuerer Stack   |
| Update bricht bei Backup ab       | Stack/Maintenance `:8082` nicht erreichbar | Stack starten, dann Update erneut |
| „Keine .env“                      | Install unvollständig                      | Erstinstall (§4) nachholen        |
| Images laden fehlgeschlagen       | kaputtes Archiv / Docker voll              | Logs prüfen; Disk/Docker          |
| Timeout nach ~15 min              | langsamer Host / großer Load               | erneut versuchen; Host-Ressourcen |
| Warteschlange weg nach Update     | erwartet (Fresh DB)                        | Kommunikationshinweis vor Apply   |
| Nur Image-Tags in `.env` geändert | kein Cutover/Rollback                      | nicht als Produkt-Update nutzen   |

## 6. Build — wie die Artefakte entstehen

Gemeinsam (Stack-Pakete): Docker muss laufen. `--version` / `PRAXIS_FLOW_RELEASE_VERSION` setzt den Stack-Tag.
`:pack` / `--no-build` überspringt `docker build` und packt vorhandene lokale Tags.
`:current` = `--no-build`; es verwendet den explizit gesetzten
`PRAXIS_FLOW_RELEASE_VERSION` oder sonst die Version aus `package.json` und erzwingt keinen
`local`-Tag.

Proxy-Schritt (beide Stack-Pakete): Beim Build Base `caddy:2.11.4@<Registry-Digest>` pullen, Custom-Image `praxis-flow-proxy:2.11.4-acmedns` aus `proxy/Dockerfile` bauen, Modul `dns.providers.acmedns` prüfen, Digest-Metadaten ins Manifest. Im Pack-only-Modus (`--no-build`) werden die vorhandenen lokalen Images inklusive Custom-Proxy nur inspiziert; es gibt keinen Registry-Zugriff. Konstanten: `packages/server-shared/src/pfupdate.ts`.

App/Sandbox-Build: `scripts/release-app-image.mjs` (u. a. Build-Arg `PRAXIS_FLOW_STACK_VERSION`); Release-Builds mit SBOM + Provenance (`--sbom=true`, `--provenance=mode=max`).

### 6.1 Erstinstall — `npm run release:images`

Script: `scripts/build-release-images.mjs`

1. Optional: `docker build` → `praxis-flow/app:<ver>`, `praxis-flow/sandbox:<ver>`
2. Proxy-Image wie oben vorbereiten
3. `docker save` der drei Images → `images/praxis-flow-images.tar`
4. Compose-Templates und `proxy/Caddyfile` nach `templates/` kopieren
5. Bundle → `praxis-flow-<ver>.pfinstall`
6. Sidecar daneben: `manifest.json`, `SHA256SUMS.txt`, `THIRD_PARTY_NOTICES.txt`, `licenses/caddy/LICENSE.txt`

**Ausgabe:** `dist/releases/praxis-flow-<ver>/`

Kein Gateway im Produkt-Archiv. Compose-Templates und Basis-Caddyfile kommen aus diesem vollständigen Release-Bundle; das TLS-Caddyfile wird später aus dem Installationszustand erzeugt.

### 6.2 Update — `npm run release:pfupdate`

Script: `scripts/build-pfupdate.mjs`

1. Optional: `docker build` app + sandbox
2. Proxy-Image wie oben
3. Staging: `docker save` → **unkomprimiertes** `images/praxis-flow-images.tar`
4. Templates kopieren: `docker-compose.delivery.yml`, `docker-compose.proxy.delivery.yml`, `docker-compose.proxy-tls.delivery.yml`, `proxy/Caddyfile`, generiertes `templates/.env.example` (Image-Tags gesetzt)
5. `manifest.json` inkl. `minimumManagerVersion` (Default = aktuelle `manager/package.json`-Version), `imageDigests.proxy`, Dateiliste
6. `SHA256SUMS.txt` + Lizenzen/Notices
7. `tar czf` → `dist/releases/praxis-flow-update-<ver>.pfupdate`
8. Roundtrip: `validatePfupdatePackage()` — bricht bei Fehler ab

**Layout nach Extraktion (Produkt):**

```text
manifest.json
SHA256SUMS.txt
images/praxis-flow-images.tar
templates/docker-compose.delivery.yml
templates/docker-compose.proxy.delivery.yml
templates/docker-compose.proxy-tls.delivery.yml
templates/proxy/Caddyfile
templates/.env.example
THIRD_PARTY_NOTICES.txt
licenses/caddy/LICENSE.txt
```

Ältere Pakete ohne Proxy-Felder (und optionale Legacy-Gateway-Felder) bleiben gültig (v1-kompatibel).

### 6.3 Manager-DMG — `npm run dist:manager:mac`

1. `prepare:packaged` (`manager/scripts/prepare-packaged-resources.mjs`): Setup-`dist` + `server-shared` nach `manager/build-resources/setup/` (Imports umschreiben, Production-Strip); Delivery-Templates + `.env.example` nach `build-resources/templates/`. Das Basis-Caddyfile kommt aus dem importierten Release-Bundle.
2. `electron-vite build` (Main, Preload CJS, Renderer)
3. `electron-builder --mac dmg` → `manager/dist/PraxisFlowManager-<managerVersion>-<arch>.dmg`

Gepackter Manager startet Setup-API aus `resources/setup/`; Default-Install-Home macOS: `~/Library/Application Support/PraxisFlow`. Aktuell unsigned / nicht notarisiert.

### 6.4 Release-Checkliste (kurz)

1. Manager-Version: `minimumManagerVersion` im `.pfupdate` ≤ ausgelieferte DMG?
2. `PRAXIS_FLOW_RELEASE_VERSION` explizit setzen
3. `npm run release:pfupdate -- --version …` → „Package validation OK“
4. Optional: `npm run release:images` für Erstinstall-Ordner
5. Manifest: Proxy-Registry-Digest = Pin in `pfupdate.ts`; Image-ID + Plattform gesetzt
6. Notices/Lizenzdateien im Paket
7. Optional DMG bei Manager-Änderungen
8. Kunde: laufender Stack → Manager → Wartung → Update-Paket

## 7. Verweise

- Runtime: [`runtime.md`](runtime.md)
- LAN-TLS: [`tls.md`](tls.md)
- Backup-Vertrag: [`backup.md`](backup.md)
- Manager: [`../../manager/README.md`](../../manager/README.md)
- `.pfupdate`-Validierung: `packages/server-shared/src/pfupdate.ts`

## 8. Windows-Vorbereitung (2026-09-30, noch keine Plattformfreigabe)

Zielkonfiguration: Windows 11 x64 auf einem von Microsoft und Docker noch
unterstützten Stand (Abnahmekandidat: Pro/Enterprise 24H2 oder neuer), ein
festes Betriebskonto, lokaler Docker Desktop mit WSL2 und Linux/amd64-Images.
Compose muss mindestens 2.24.4 unterstützen. Windows ARM64, Windows Server,
Remote-Docker, Hyper-V/VMM als freigegebene Produktkonfiguration sowie
Mehrbenutzerbetrieb sind nicht zugesagt. Der Server-Runner der CI prüft
Windows-Dateisystem und Paketbau, nicht Docker Desktop auf Windows Server.
Die konkrete Docker-Desktop-/WSL-/Windows-Version wird erst mit der realen
Abnahme festgeschrieben; die Hersteller-Mindestanforderungen sind keine
Praxis-Flow-Freigabe.

### Build und Installationsgrenze

`npm run dist:manager:win` baut einen NSIS-x64-Installer unter
`manager/dist/PraxisFlowManager-<version>-windows-x64-setup.exe`.
Der Installer ist benutzerbezogen, fordert keine Elevation an und legt
Desktop-/Startmenü-Verknüpfungen an. Keine automatische Veröffentlichung,
kein Auto-Updater und keine Firewalländerung. Ohne bereitgestellte
Signieridentität ist dies ein interner unsignierter Build. Vor externer
Auslieferung: Authenticode-Zertifikat, geschützte Signierpipeline,
Zeitstempel und Prüfung von EXE **und** Installer festlegen; SmartScreen-
Verhalten auf sauberem Host prüfen. Keine privaten Signierschlüssel im Repo.

Programmdateien/ASAR und Daten sind getrennt. Neue Windows-Installationen
verwenden `%LOCALAPPDATA%\PraxisFlow`; ein vorhandenes
`%ProgramData%\PraxisFlow` bleibt als Legacy-Home erhalten und wird nicht
still migriert. `PRAXIS_FLOW_HOME` überschreibt bewusst diese Auswahl.
Das Betriebskonto muss Schreibrechte haben; kein automatischer UAC-Fallback.
Installer-Upgrade und Deinstallation dürfen dieses Home, externe Ordner und
Docker-Volumes nicht entfernen. Die NSIS-Konfiguration setzt
`deleteAppDataOnUninstall: false`; der reale Erhalt ist noch abzunehmen.
Ein NSIS-Upgrade ersetzt nur den Manager. Stack-Updates bleiben `.pfupdate`.

Setup startet direkt mit der mitgelieferten Electron-Node-Runtime und
absolutem Einstiegspfad; Node/npm werden beim Kunden nicht benötigt.
`resources/setup` enthält kompilierten Server und vendortes `server-shared`,
`resources/templates` die zentrale `DELIVERY_BOOTSTRAP_FILES`-Liste samt
`.env.example`. Das Basis-Caddyfile kommt weiterhin aus `.pfinstall`.
Der Build prüft den Import außerhalb des Repositories. Der zusätzliche
`manager/scripts/smoke-packaged-setup.mjs` prüft mit Electron Token,
Loopback-Handshake, Bootstrap, Wiederstart und IPC-Verlust bei reduziertem
PATH und fremdem Arbeitsverzeichnis. `runAsNode` darf nicht per Electron-Fuse
deaktiviert werden, solange dieser Startpfad verwendet wird.

### Priorisierte Code-Bestandsaufnahme

| Priorität / Einordnung | Konkrete Fundstelle und Befund                                                                                                                                                                | Umsetzung / verbleibender Nachweis                                                                                                                                                                                                                                              |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P0 bestätigt           | `setup/src/restricted-operation.ts:durableWrite`, `maintenance-files.ts:syncParents`, `proxy-tls.ts:writeGeneratedTlsCaddyfile`, `app-data-volume.ts:restoreDbFiles`: POSIX-Verzeichnis-fsync | Windows überspringt nur Directory-fsync; Dateien werden weiter geflusht, Fehler nicht pauschal geschluckt. Stromausfall-Durabilität auf NTFS bleibt reale Abnahme.                                                                                                              |
| P0 bestätigt           | `packages/server-shared/src/pfupdate.ts:isPfupdateRelativePath`, `setup/src/tls-backup-sidecar.ts`: Windows-Laufwerke, ADS und Gerätenamen nicht vollständig ausgeschlossen                   | Portable Archivnamen, Link-Ablehnung, Groß-/Kleinschreibungs-Kollisionen und unsichere Leerzeichen geprüft. `assertPathInsideRoot` prüft reale Vorfahren statt Textpräfixe.                                                                                                     |
| P1 bestätigt           | `manager/package.json`, `manager/src/main/setup-server.ts:startDevSetupServer`: nur DMG, npm-/Shell-Prozesskette                                                                              | NSIS x64; Dev und Paket starten Electron direkt mit Argumentarray. IPC-Verlust beendet Setup; `setup/src/child-lifecycle.ts` beendet laufende Windows-CLI-Prozessbäume, nicht Docker Desktop oder Container.                                                                    |
| P1 bestätigt           | `manager/src/main/setup-server.ts:startPackagedSetupServer`, `setup/src/server.ts`: geerbtes cwd und nicht kanonisierter Einstieg                                                             | Paket übergibt Install-Home explizit; Server erkennt realen Einstieg auch unter Symlink-Vorfahren. Isolierter Smoke erfolgreich auf macOS.                                                                                                                                      |
| P1 bestätigt           | `setup/src/docker-cli.ts:resolveDockerCli`, `docker.ts:detectDocker`: Unix-Suchpfade, kein Kontext-/OS-Gate, keine Compose-Mindestversion                                                     | docker.exe, Docker-Desktop-Pfade für System/Benutzer, eindeutiger PATH, Named-Pipe-/Linux-Prüfung unter Windows und Compose ≥2.24.4. Keine automatische Kontextumschaltung.                                                                                                     |
| P1 bestätigt           | `setup/src/install-home.ts`, `storage-folders.ts`, `settings-backup-restore.ts`: zu breite Windows-Pfadannahmen                                                                               | Lokale feste Laufwerke, absolute Pfade, beide Separatoren; UNC/WSL/Netzlaufwerke/Junctions/ungültige Namen und überlange Eingaben bewusst abweisen. Restore prüft Windows-Hostpfade vor Cutover.                                                                                |
| P1 bestätigt           | `setup/src/maintenance-files.ts:replaceFile`: unmittelbarer Rename-Fehler bei kurzzeitiger Sperre                                                                                             | Begrenzte Wiederholung nur bei Windows-Sperrfehlern; kein Löschen des alten Ziels als Ersatz für Rename. Fehler lassen Recovery-Evidenz bestehen. Nativer Windows-Sperrtest in CI.                                                                                              |
| P1 prüfbedürftig       | `install-operation.ts`, `install-recovery.ts`, `restore-operation.ts`, `settings-backup-update.ts`, `tls-operation-files.ts`: Journal-/Snapshot-Lebenszyklus                                  | Bestehende Recovery-Phasen erhalten; Windows-CI prüft Dateivorgänge/Update-Recovery. Echte Docker-Cutover, Abbruch und Rollback bleiben Abnahmepflicht. Install-`installing` verspricht keine Fortsetzung jeder Einzelaktion.                                                   |
| P1 prüfbedürftig       | `restricted-network.ts:buildRestrictedNetworkStatus`, `host-state.ts:prepareRestrictedNetwork / applyRestrictedNetwork`, `docker.ts:validateStaffBindingEnv`, `host-tls.ts`, `proxy-tls.ts`   | macOS-Gates schützen den separaten Patientenzugang und dessen Listener-/Binding-Nachweis. Sie bleiben bestehen; Windows blockiert zusätzlich persistierte aktive Bindings beim Start und Restore vor Cutover. Staff-HTTPS ist eine separate Abnahme, keine Restricted-Freigabe. |
| P1 Betriebsbedingung   | `tls-operation-files.ts:captureTlsRollback`, `.env`, temporäre TLS-Archive                                                                                                                    | chmod 0600/0700 ist unter Windows keine ACL. Privates Betriebskonto, geschützte NTFS-Vererbung und Backup-Ziel durch IT prüfen; keine neue automatische ACL-/Firewallverwaltung.                                                                                                |
| P2 Komfort             | `setup/src/network.ts:listLanIpv4Candidates`: virtuelle Adapter/VPNs erscheinen ebenfalls                                                                                                     | Keine heuristische automatische Auswahl einer „richtigen“ NIC. Physische Staff-IP samt Erreichbarkeit durch IT wählen; bessere Adapterbeschriftung kann später folgen.                                                                                                          |

`/bin/sh`, `/tmp`, `/imports`, `/exports` und `/var/lib/praxis-flow/app` in
Docker-Argumenten sind Linux-**Container**pfade, keine Windows-Hostfehler.
Externe Import-/Exportordner bleiben bei Reset/Recovery außerhalb der
verwalteten Löschgrenze. Der Host-Mutex bleibt pro Prozess; der Manager ist
Einzelinstanz. Parallele manuelle Setup-Server sind kein unterstützter Betrieb.

### Automatisierung und Prüfnachweis

`.github/workflows/manager-windows.yml` führt auf einem Windows-x64-Runner
gezielte native Datei-, Argument-, Archiv-, Journal- und Recoverytests,
Typprüfung, Lint, NSIS-Build und den Smoke mit der **gebauten EXE** aus.
Ein separater PowerShell-Test installiert den NSIS-Build im Wegwerf-Runner,
installiert dieselbe Version erneut, prüft die installierte Runtime und
deinstalliert sie; ein Datenmarker muss erhalten bleiben. Das ist kein
Nachweis eines Upgrades von einer älteren Produktversion oder eines Standardkontos.
Kein Release und kein Artefakt-Upload. Die Auswahl ist ausdrücklich keine
Behauptung, die gesamte bestehende POSIX-Testfixturesuite laufe unter Windows.
`path.win32`-Fälle laufen zusätzlich auf macOS, ersetzen aber keinen nativen Lauf.
GUI-Installation, Docker Desktop/WSL und physische Netzwerkadapter sind nicht
Teil dieser Hosted-CI. Offene Schritte und erwartete Ergebnisse stehen zentral
in [open-items.md](../open-items.md#windows-abnahmeprotokoll).

### Geprüfte Versionsquellen

- [Electron 44.4.3](https://releases.electronjs.org/release/v44.4.3) enthält Node 24.21.0; lokal mit `process.versions` bestätigt. [Node-24-Prozessvertrag](https://nodejs.org/download/release/v24.21.0/docs/api/child_process.html) erklärt Windows-Shell-Shims, PATH-Großschreibung und Prozessbeendigung. [Electron Node-Modus](https://www.electronjs.org/docs/latest/api/environment-variables#electron_run_as_node) verlangt das aktive `runAsNode`-Fuse.
- [Node-24-Dateisystemvertrag](https://nodejs.org/docs/latest-v24.x/api/fs.html): Windows-Dateimodi sind keine POSIX-Zugriffskontrolle. File-flush und Rename sind von Directory-fsync und Stromausfallgarantien zu unterscheiden.
- [Docker Windows-Anforderungen](https://docs.docker.com/desktop/setup/install/windows-install/): WSL2-Anforderungen, unterstützte Client-Windows-Stände und Installationsarten. [Compose-Merge](https://docs.docker.com/reference/compose-file/merge/#replace-value) belegt 2.24.4 für `!override`.
- [Docker-Kontexte](https://docs.docker.com/engine/manage-resources/contexts/) und [Bind-Mounts](https://docs.docker.com/engine/storage/bind-mounts/) erklären, warum lokale Hostpfade keinen Remote-Daemon unterstützen. [NSIS-Optionen](https://www.electron.build/nsis/) wurden zusätzlich gegen die installierte electron-builder-Implementierung geprüft.

### Lokaler Prüfstand dieses Arbeitsstands

2026-09-30, macOS arm64 (Darwin 25.5.0): Setup-, Manager- und
server-shared-Tests erfolgreich; der Windows-exklusive Dateisperrtest ist hier
übersprungen. Typprüfungen dieser drei Workspaces, deren Lint sowie Lint der
geänderten Manager-Skripte erfolgreich. Setup-/Shared-Build,
`prepare:packaged` mit isoliertem Import und Manager-Build erfolgreich.

`electron-builder --mac dir --publish never` konnte im eingeschränkten Netz
Electron nicht erneut herunterladen. Mit der bereits installierten identischen
Distribution (`--config.electronDist=../node_modules/electron/dist`) wurde die
unsignierte `.app` erfolgreich paketiert. Der GUI/IPC-Smoke und der isolierte
Token-/Bootstrap-/Restart-/Disconnect-Smoke bestanden auch mit dieser gebauten
App und ihren tatsächlichen Ressourcen. Kein DMG-Release, keine Veröffentlichung
und keine destruktive Prüfung einer bestehenden Installation.

Windows-NSIS, PowerShell-Installerprüfung und Windows-Runner sind in diesem
Arbeitsstand **vorbereitet, nicht ausgeführt**. Reale Docker-/WSL-/Netzabnahmen
bleiben offen; maßgeblich ist das [Abnahmeprotokoll](../open-items.md#windows-abnahmeprotokoll).

### Windows-NSIS-Integrität beim macOS-Cross-Build

Der auf macOS erzeugte erste Testinstaller enthielt einen Deinstaller mit falscher
CRC, obwohl die äußere Setup.exe ihre Prüfung bestand. Ursache im verwendeten
electron-builder 26.15.3: `UninstallerReader` kopiert den Installer-Stub ohne die
Uninstaller-Icon-Patches. Der lokale Buildwrapper rekonstruiert diese gemäß
[NSIS EW_WRITEUNINSTALLER](https://github.com/kichik/nsis/blob/v304/Source/exehead/exec.c)
und validiert die bestehende CRC, statt sie neu zu schreiben. Der Builder ist auf
diese Version festgelegt; ein Versionswechsel erfordert erneute Prüfung.

`npm run dist:manager:win` prüft anschließend die fertige Setup.exe und den
extrahierten Deinstaller auf allen Buildhosts. Ein Prüffehler bedeutet einen
fehlgeschlagenen Build, keine Freigabe. Die zusätzlich erzeugte `.exe.sha256`
dient zum Vergleich nach Kopieren per SMB oder Download (`Get-FileHash -Algorithm
SHA256` unter Windows). Alte Testdateien mit Leerzeichen im Namen sind nicht der
korrigierte Build. Die Prüfsumme bestätigt Dateiintegrität, keine Signierung und
keine erfolgreiche Windows-Laufzeitabnahme.
