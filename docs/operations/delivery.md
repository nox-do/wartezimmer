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

| Artefakt         | Build                      | Manager-Weg               | Inhalt (Produkt)                                                           |
| ---------------- | -------------------------- | ------------------------- | -------------------------------------------------------------------------- |
| **`.pfinstall`** | `npm run release:images`   | Wizard → Release-Paket    | Images, Compose-Templates, Basis-Caddyfile, Manifest, SHA256, Caddy-Lizenz |
| **`.pfupdate`**  | `npm run release:pfupdate` | Wartung → Software-Update | dasselbe plus Compose-Templates, `.env.example`; Cutover/Rollback          |
| **Manager-DMG**  | `npm run dist:manager:mac` | Installation der Hülle    | Electron + eingebettete Setup-API/Templates; eigener Versionszyklus        |

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

**Kundenweg:** Wartezimmer Manager (Assistent).
**Support-Fallback:** CLI `npm run setup`.
**TLS-Details** (Schritt HTTPS + später Cutover): [`tls.md`](tls.md).

### 4.1 Voraussetzungen

| Bedarf                                                                   | Warum                                                                                                                                   |
| ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| **Docker** (Desktop oder Engine) + Compose v2, Daemon läuft              | Stack starten; Wizard-Schritt 1 prüft Installation/Daemon/Compose                                                                       |
| **Manager** (DMG oder `npm run dev:manager`)                             | Operative Hülle; startet die Setup-API als eigenen Child auf Loopback (ephemerer Port, nicht still `:9190`)                             |
| **Release-Paket** `.pfinstall` (internes Manifest und Inhaltsprüfsummen) | Delivery: Images laden (`POST /api/setup/host/images/load`). Dev-Profil (`PRAXIS_FLOW_COMPOSE_PROFILE=dev`): oft **nicht** erforderlich |
| **Freie Ports**                                                          | App intern am Host immer **8080** (ohne Proxy offen, mit Proxy nur Loopback); Proxy zusätzlich **80** und bei TLS **443**               |
| **Import- & Export-Ordner** auf dem Host                                 | Wizard-Schritt 2; unter Docker Desktop: File Sharing für diese Pfade                                                                    |
| **Feste LAN-IPv4** / DHCP-Reservierung                                   | Für Demo ohne Proxy optional; für Proxy-Staff-Binding, Geräte-URLs und TLS verbindlich                                                  |

Setup-API und Manager sprechen nur Loopback — kein Setup aus dem Praxis-LAN.

### 4.2 Install-Home

| Plattform | Default ohne `PRAXIS_FLOW_HOME`            |
| --------- | ------------------------------------------ |
| macOS     | `~/Library/Application Support/PraxisFlow` |
| Windows   | `%LOCALAPPDATA%\PraxisFlow` (Legacy: `%ProgramData%\PraxisFlow`) |
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
| „Release-Paket fehlt“ / Images nicht geladen | Delivery ohne `docker load`          | `.pfinstall` wählen (Format 2); Laden kann Minuten dauern                |
| SHA256-Fehler beim Laden                     | Paket beschädigt                     | Paket erneut kopieren oder mit aktuellem Build-Script neu erstellen      |
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
4. **Bestätigen** — automatisches Wartezimmer-Backup; Queue geht verloren; Wartezimmer kurz offline
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

Beide Paket-Builds verwenden `scripts/release-archive.mjs`. Unter macOS werden
AppleDouble-Metadaten und Extended Attributes beim Verpacken deaktiviert
(`--no-mac-metadata`, `--no-xattrs`, `COPYFILE_DISABLE=1`). Damit entstehen keine
zusätzlichen `._*`-Einträge wie `._.`, die der Windows-Import zu Recht ablehnt.
Bei `PFUPDATE_TAR_PATH_UNSAFE: ._.` das Paket mit den aktuellen Scripts neu bauen;
der Importfilter wird dafür nicht gelockert. Ein Regressionstest setzt auf macOS
reale Extended Attributes auf Staging-Verzeichnis und Datei und prüft beide Pakettypen.

### 6.1 Erstinstall — `npm run release:images`

Script: `scripts/build-release-images.mjs`

`npm run release:images` baut standardmäßig **beide** Plattformen, jeweils App,
Sandbox und Proxy. Getrennte Ausgaben:

- `dist/releases/praxis-flow-<ver>/linux-amd64/praxis-flow-<ver>-linux-amd64.pfinstall` — Intel/AMD x64
- `dist/releases/praxis-flow-<ver>/linux-arm64/praxis-flow-<ver>-linux-arm64.pfinstall` — ARM64, unter anderem Apple Silicon

Nur eine Plattform: `npm run release:images -- --platform amd64` bzw. `--platform arm64`.
Auch `linux/amd64`, `linux/arm64` und `all` sind gültig. Pack-only:
`npm run release:images:current -- --platform amd64`; vorhandene Architektur-Tags
(`:<version>-amd64`/`-arm64`, entsprechend beim Proxy) werden bevorzugt und vor
Export geprüft. Ohne Auswahl werden auch bei Pack-only beide Plattformen erwartet.
Nach dem Build zeigen die ursprünglichen Tags auf die zuletzt gebaute Plattform;
die zusätzlichen Architektur-Tags erhalten beide Varianten für spätere Pack-only-Läufe.

Der Build verwendet explizites `buildx build --load --platform` und exportiert mit
`docker save --platform`. Voraussetzung auf dem **Build-Rechner**: Docker API ≥ 1.49,
Buildx und native Builder oder funktionierende Emulation für beide Architekturen.
Docker Desktop unterstützt [Multi-Plattform-Builds per Emulation](https://docs.docker.com/build/building/multi-platform/).
[Inspect mit Plattformauswahl](https://docs.docker.com/reference/cli/docker/image/inspect/)
benötigt API 1.49, [Save mit Plattformauswahl](https://docs.docker.com/reference/cli/docker/image/save/)
API 1.48. Cross-Builds können deutlich länger dauern; fehlende Emulation bricht den Build ab.

Der Manager vergleicht die Paketplattform vor dem Docker-Import mit der Architektur
der Docker-Engine, anschließend zusätzlich jedes importierte Image. Eine falsche
Architektur ergibt einen verständlichen API-Validierungsfehler mit passendem
Dateinamenssuffix. ARM64-Images sind keine Freigabe des Windows-ARM64-Managers
oder des Restricted-Zugangs; deren reale Abnahmen bleiben erforderlich.

1. Optional: `docker build` → `praxis-flow/app:<ver>`, `praxis-flow/sandbox:<ver>`
2. Proxy-Image wie oben vorbereiten
3. `docker save` der drei Images → `images/praxis-flow-images.tar`
4. Compose-Templates und `proxy/Caddyfile` nach `templates/` kopieren
5. Lizenznachweise und internes `manifest.json` mit `installFormatVersion: 2`, Image-Metadaten und SHA256 pro Nutzdatei einbetten
6. Bundle → `praxis-flow-<ver>-linux-<arch>.pfinstall`; externe Build-Metadaten und `SHA256SUMS.txt` bleiben optional für Transferkontrollen

Für die Weitergabe genügt die einzelne `.pfinstall`. Der aktualisierte Manager prüft
Archivpfade, Dateitypen, die vollständige Dateiliste und Inhaltsprüfsummen vor Compose-Prüfung
und Docker-Import. Auch ein umbenanntes Paket ist lesbar. Fehlerhafte interne Metadaten
führen zum Abbruch, niemals zum Rückgriff auf eine externe Datei. Lizenznachweise liegen
im Archiv. Die SHA256 des Gesamtarchivs wird lokal für die gepinnte Installationsoperation
berechnet und vor Aktivierung erneut geprüft. Interne Hashes erkennen Beschädigungen,
sind aber keine Herausgebersignatur.

Nur `installFormatVersion: 2` mit internem Manifest wird unterstützt. Pakete ohne internes
Manifest und Format 1 werden abgelehnt; externe Begleitdateien ermöglichen keinen Import.
Alte Manager können das neue Format nicht lesen: zuerst den Manager aktualisieren.
Bestehende Pakete werden nicht nachträglich umgewandelt; für das Ein-Datei-Format neu bauen.

**Ausgabe:** `dist/releases/praxis-flow-<ver>/`

Kein Gateway im Produkt-Archiv. Compose-Templates und Basis-Caddyfile kommen aus diesem vollständigen Release-Bundle; das TLS-Caddyfile wird später aus dem Installationszustand erzeugt.

### 6.2 Update — `npm run release:pfupdate`

Script: `scripts/build-pfupdate.mjs`

Wie bei `release:images` werden standardmäßig AMD64 **und** ARM64 gebaut.
Eine Plattform: `npm run release:pfupdate -- --platform amd64` bzw. `--platform arm64`.
Pack-only: `npm run release:pfupdate:current -- --platform amd64`.
Ausgabe: `dist/releases/praxis-flow-<ver>/linux-<arch>/praxis-flow-update-<ver>-linux-<arch>.pfupdate`.
Build, Proxy-Modulprobe, App-Vertragsprobe, Inspektion und Export verwenden die
gewählte Plattform explizit (Build-Engine API ≥ 1.49). Der Manager prüft die
Manifest-Plattform gegen den Docker-Daemon bereits vor Backup und Image-Import;
nach dem Import prüft er zusätzlich jedes Image gegen dieselbe Daemon-Plattform.
Die vorhandene Manifestversion und der Proxy-Digestvertrag bleiben erhalten.

1. Optional: `docker build` app + sandbox
2. Proxy-Image wie oben
3. Staging: `docker save` → **unkomprimiertes** `images/praxis-flow-images.tar`
4. Templates kopieren: `docker-compose.delivery.yml`, `docker-compose.proxy.delivery.yml`, `docker-compose.proxy-tls.delivery.yml`, `proxy/Caddyfile`, generiertes `templates/.env.example` (Image-Tags gesetzt)
5. `manifest.json` inkl. `minimumManagerVersion` (Default = aktuelle `manager/package.json`-Version), `imageDigests.proxy`, Dateiliste
6. `SHA256SUMS.txt` + Lizenzen/Notices
7. `tar czf` → `dist/releases/praxis-flow-<ver>/linux-<arch>/praxis-flow-update-<ver>-linux-<arch>.pfupdate`
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
3. `electron-builder --mac dmg` → `manager/dist/WartezimmerManager-<managerVersion>-<arch>.dmg`

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
Wartezimmer-Freigabe.

### Build und Installationsgrenze

`npm run dist:manager:win` baut einen NSIS-x64-Installer unter
`manager/dist/WartezimmerManager-<version>-windows-x64-setup.exe`.
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

### Aktuelle Code-Bestandsaufnahme (Abgleich 2026-10-04)

Die frühere P0/P1-Spalte bezeichnete den **ursprünglichen Fehler vor der Umsetzung**,
nicht dessen aktuellen Status. Die folgenden Korrekturen sind im Code vorhanden.
Fehlende Windows-Nachweise sind gesonderte Freigabepunkte, keine erneut bestätigten
Codefehler. Grundlage: Codeabgleich, vollständiger lokaler Test-/Lint-/Prettier-Lauf
auf macOS am 2026-10-04 und die unten abgegrenzten Anwenderberichte. Ein erfolgreicher
Windows-CI-Lauf ist in diesen Unterlagen weiterhin nicht belegt.

| Thema / ursprüngliche Priorität            | Aktueller Codebefund                                                                                                                                                                                          | Verbleibende Relevanz                                                                                                                                                                                        |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Directory-fsync (P0)                       | Behoben: `maintenance-files.ts:syncDirectory` überspringt nur Verzeichnis-fsync unter Windows; `restricted-operation.ts:durableWrite`, `proxy-tls.ts` und `app-data-volume.ts` flushen weiterhin Dateien.     | Kein bekannter ursprünglicher Startfehler mehr. Prozessabbruch-/Recovery-Nachweis vor Produktionsbetrieb erforderlich; ein Prozess-Kill belegt keine NTFS-Stromausfall-Durabilität.                          |
| Archiv-/Pfadgrenzen (P0)                   | Behoben: `server-shared/src/pfupdate.ts:isPfupdateRelativePath`, `pfupdate-package.ts` und `tls-backup-sidecar.ts` prüfen portable Namen, Links und Kollisionen; reale Pfadgrenzen statt String-Präfixe.      | Kein offener P0 aus dem damaligen Befund. Regressionen vorhanden; nativen Windows-Lauf protokollieren.                                                                                                       |
| Installer und Prozesskette (P1)            | Implementiert: NSIS x64 in `manager/package.json`, direkter Electron-Node-Start in `setup-server.ts`, IPC-/Kindprozess-Lebenszyklus. NSIS-CRC-Fix inklusive Prüfung des eingebetteten Deinstallers vorhanden. | Erneute Installation/Versionsupgrade/Deinstallation mit Datenerhalt real nachweisen. Frühere Meldung „Manager kann nicht geschlossen werden“ ist nicht durch den CRC-Fix allein erklärt.                     |
| Paketierter Start / cwd (P1)               | Behoben: explizites Install-Home, absoluter Setup-Einstieg und mitgelieferte Runtime/Templates.                                                                                                               | Windows-Start im Anwenderbericht positiv; vollständiger Standardkonto-/PATH-/Neustart-Nachweis noch offen.                                                                                                   |
| Docker-Erkennung (P1)                      | Behoben: `docker-cli.ts` kennt Windows-Pfade, prüft lokale Named-Pipe-Kontexte und Linux-Daemon; `docker.ts` prüft Compose ≥2.24.4.                                                                           | Start bei ausgeschaltetem Docker, Docker-/Host-Neustart und Fehlkontexte weiterhin real abnehmen. Kein belegter offener Erkennungsfehler.                                                                    |
| Windows-Hostpfade (P1)                     | Install-Home bleibt lokal. Import/Export, Docker-Start und Restore akzeptieren zusätzlich gemappte Netzlaufwerke; UNC-/WSL-Pfade und Junctions bleiben gesperrt.                                              | Praxis-IT stellt Mapping, Anmeldung und Erreichbarkeit bereit. Realen CSV-/Docker-Mount-Test samt Verbindungsverlust und Neustart nachweisen; Aufhebung der Sperre allein ist kein Kompatibilitätsnachweis.  |
| Gesperrte Dateien / Rename (P1)            | Behoben: `maintenance-files.ts:replaceFile` wiederholt begrenzt bei EPERM/EACCES/EBUSY; löscht das alte Ziel nicht als Ersatz. Windows-exklusiver Sperrtest vorhanden.                                        | Nativen Sperrtest und Recovery nach einer länger bestehenden Sperre nachweisen; macOS überspringt den exklusiven Windows-Test.                                                                               |
| Install/Update/Restore-Recovery (P1)       | Journal-/Snapshot-Pfade und Regressionstests vorhanden (`install-recovery.ts`, `restore-operation.ts`, `settings-backup-update.ts`, `tls-operation-files.ts`).                                                | **Freigabestopper für unbeaufsichtigten Produktivbetrieb, solange reale Windows-Cutover-/Abbruch-/Rollback-Tests fehlen.** Kein durch diesen Abgleich neu bestätigter Datenverlustfehler.                    |
| Restricted-Patientenzugang (P1)            | Gates bleiben aktiv (`restricted-network.ts`, `host-state.ts`, `docker.ts`, Restore); Windows darf aktive Restricted-Bindings nicht starten.                                                                  | Kein Stopper für den Staff-Manager. **Stopper, wenn Restricted auf Windows Bestandteil des zugesagten Umfangs ist.** Separate Zwei-NIC-/Host-/SNI-/IPv6-/Fail-closed-Abnahme nötig.                          |
| Secrets / NTFS-ACLs (P1 Betriebsbedingung) | Keine automatische ACL-Verwaltung; POSIX-Modi ersetzen keine Windows-Zugriffsprüfung.                                                                                                                         | Vor echten Praxisdaten Zugriff als zweites Standardkonto auf Home, Secrets, Temp und Backup testen. Unzureichende ACLs sind ein Einsatzstopper; sie sind hier nicht als tatsächlich fehlerhaft nachgewiesen. |
| Virtuelle Adapter / VPN (P2)               | `network.ts:listLanIpv4Candidates` lässt die bewusste Auswahl bei der IT.                                                                                                                                     | Bessere Beschriftung ist Komfort. Die korrekte Staff-IP und Bindings müssen unabhängig davon abgenommen werden.                                                                                              |

### Zusätzliche aktuelle Freigabepunkte

1. **Updatepakete für Intel-Windows:** Architekturwahl, getrennte Dateinamen und
   Daemon- statt Prozessarchitektur sind umgesetzt. CLI-Regressionen mit simulierter
   Docker-CLI und Update-Regressionen prüfen beide Plattformen und frühe Ablehnung
   falscher Pakete. Echte Cross-Build-/Windows-Update-/Rollback-Abnahme bleibt offen.
2. **Staff-HTTPS:** Erfolgreiche Wildcard-Ausstellung unter Windows nach dem
   Resolver-Fix ist bestätigt. Browserzugriff, vollständiger HTTPS-Cutover,
   Loopback-Abschirmung, Zertifikatserneuerung und TLS-Restore sind dadurch nicht
   nachgewiesen. `1.1.1.1:53` muss für ACME aus dem Container erreichbar sein.
   Die pauschale 90-Sekunden-Timeoutmeldung in `host-tls.ts` bleibt eine Diagnose-
   schwäche; sie erklärt nicht jeden noch möglichen TLS-Fehler.
3. **Externe Auslieferung:** Signierung ist gemäß dem bestehenden Liefervertrag
   noch festzulegen; sie ist kein technischer Startstopper für interne Tests.
   Die konkrete Windows-/WSL-/Docker-Version und ein erfolgreiches natives
   CI-/Installer-/Daten-Erhalt-Protokoll fehlen weiterhin als vollständiger Nachweis.

Praktische Reihenfolge: zuerst den benötigten CSV-Speicherort festlegen, dann auf dem vorhandenen Intel-Windows-Rechner
Backup/Restore/Update samt erzwungenem Abbruch prüfen, anschließend HTTPS-/Netz-
und ACL-Abnahme. Die ausführlichen Schritte bleiben im bestehenden
[Windows-Abnahmeprotokoll](../open-items.md#windows-abnahmeprotokoll).

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

Aktualisierung 2026-10-04: Windows-NSIS wurde inzwischen mehrfach auf macOS
gebaut; Installer- und eingebettete Uninstaller-CRC wurden erfolgreich geprüft.
Der Anwender meldet positiven Windows-Betrieb sowie erfolgreiche ACME-Ausstellung
nach Resolver-Korrektur. Ein vollständiger PowerShell-Installer-/Windows-CI-Lauf
und die reale Docker-/WSL-/Netz-/Recovery-Matrix sind weiterhin nicht protokolliert; maßgeblich ist das [Abnahmeprotokoll](../open-items.md#windows-abnahmeprotokoll).

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

### Recherche Windows ARM64 / Snapdragon (2026-09-30)

Ergebnis: technisch plausibel als native Kombination Windows-ARM64-Manager +
Docker Desktop ARM/WSL2 + Linux-ARM64-Images; noch keine Produktionsfreigabe.
Docker führt Windows ARM auch in den aktuellen
[Release Notes](https://docs.docker.com/desktop/release-notes/) als Early Access.
Die [Windows-Anforderungen](https://docs.docker.com/desktop/setup/install/windows-install/)
führen WSL2 für ARM und keine Windows-Container auf. Ziel für einen Pilotversuch:
physisches Snapdragon-Gerät, unterstütztes Windows 11, lokaler Linux-Daemon,
ein festes Betriebskonto und lokale Import-/Exportordner. Die Fusion-ARM-VM ist
kein Ersatz für die Docker-Abnahme auf dieser Hardware.

Konkrete Codebefunde:

- Electron 44 unterstützt native Windows-ARM64-Binaries
  ([Electron 44](https://www.electronjs.org/blog/electron-44-0)). Manager und
  paketierte Setup-API zeigen keine zusätzlich erforderlichen nativen
  Drittanbieter-Addons im untersuchten Startpfad. Dennoch tatsächlichen
  ARM64-Paketimport/IPC-Start prüfen. `manager/package.json`,
  `manager/scripts/build-windows.mjs`, Smoke-/Installer-Skripte und CI sind
  derzeit ausdrücklich x64. NSIS unterstützt grundsätzlich auch kombinierte
  x64/ARM64-Installer ([Builder-Dokumentation](https://www.electron.build/docs/nsis/));
  zunächst getrennte architekturspezifische Testinstaller bevorzugen.
- Installation und Update prüfen jetzt die Architektur des Docker-Daemons statt
  des Manager-Prozesses. Emulierter x64-Betrieb auf Snapdragon bleibt real abzunehmen.
- `release:images` und `release:pfupdate` bauen beide Architekturen explizit,
  mit getrennten Dateinamen, Ausgabeordnern und geprüftem Export (Abschnitt 6).
- Lokal rein lesend geprüft: `praxis-flow/app:6.1.0`,
  `praxis-flow/sandbox:6.1.0` und `praxis-flow-proxy:2.11.4-acmedns` melden jeweils
  `linux/arm64`. Das belegt vorhandene ARM-Images, keine Windows-Laufzeitabnahme.
  App/Flow-Core verwenden `node:sqlite`; Sandbox enthält ClamAV und libunrar;
  Proxy baut Caddy mit acmedns. ARM64-Pakete sind verfügbar
  ([ClamAV/libunrar](https://pkgs.alpinelinux.org/package/v3.24/community/aarch64/clamav-libunrar),
  [Caddy](https://hub.docker.com/_/caddy)). Scan, Signaturupdate, SQLite und
  Caddy-Modul müssen trotzdem mit den tatsächlichen Release-Images getestet werden.
- App und Sandbox basieren auf `node:22-alpine`. Die
  [Node-Image-Dokumentation](https://github.com/nodejs/docker-node#musl-builds-for-alpine)
  weist auf fehlende Vorabtests für ARM64-musl hin. Für belastbare Freigabe
  eigene ARM-Laufzeittests verbindlich machen; Debian/glibc als gesonderte
  Alternative bewerten, nicht im Rahmen dieser Recherche ungeprüft umstellen.
- TLS-Labor-Compose enthält ausdrücklich amd64-only-Testimages; daher nicht
  automatisch als native ARM-Abnahme verwenden. Restricted bleibt unabhängig
  vom Manager-Build ohne separaten Netzwerknachweis unter Windows gesperrt.

Prüfpfad vor Freigabe: native Manager-/NSIS-Tests auf einem
[Windows-ARM-Runner](https://docs.github.com/en/actions/reference/runners/github-hosted-runners)
und Linux-ARM64-Image-Tests getrennt ausführen. Anschließend auf echtem Snapdragon
Installation/Update/Deinstallation, CSV-Dateiwechsel im Windows-Bind-Mount,
SQLite/Backup/Restore, ClamAV mit synthetischen Prüfdaten, Staff-HTTPS,
Docker-/Host-Neustart und Energiesparmodus prüfen. Falsche Architektur muss vor
dem Installations-Cutover verständlich abgewiesen werden. Ein x64-Manager auf
ARM soll dieselbe Daemonarchitektur erkennen wie ein nativer ARM64-Manager.
Kein neuer ARM-Build, Containerstart oder Installationsversuch erfolgte bei
dieser Recherche; es wurden Code, Herstellerquellen und vorhandene Image-Metadaten geprüft.

### Gemappte SMB-Laufwerke für Import/Export

Seit 2026-10-04 sind verbundene Netzlaufwerke wie `Z:\Kontakte` für Import/Export
zugelassen. Die Praxis-IT verantwortet Mapping im Betriebskonto, Zugangsdaten,
Rechte und Wiederverbindung. Direkte UNC-Eingaben bleiben gesperrt; Install-Home,
Journale und TLS-Dateien bleiben auf lokalem festen Speicher. Windows prüft weiter
Laufwerkstyp, Pfadsyntax und Junctions; ein nicht erkennbares Laufwerk wird abgewiesen.

Ein Laufwerksbuchstabe macht SMB nicht lokal: [Windows-Laufwerkszuordnungen](https://learn.microsoft.com/en-us/windows/win32/services/services-and-redirected-drives)
sind an Anmeldesitzungen gebunden, [Docker-Bind-Mounts](https://docs.docker.com/engine/storage/bind-mounts/)
werden durch den Daemon in der Linux-VM bereitgestellt. Deshalb unter dem realen
Betriebskonto Host-/Container-Dateiinhalt, CSV-Wechsel, Schreibrechte für Export,
Verbindungsverlust und Docker-/Host-Neustart prüfen. Die Freigabe im Validator
ist keine Aussage, dass jede Docker-/SMB-Konfiguration ohne weitere IT-Einrichtung funktioniert.
