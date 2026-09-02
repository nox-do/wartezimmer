# Auslieferung, Erstinstallation & Update

Stand: 2026-08-31 · delivery ausgearbeitet (inkl. Update §5)

**Scope:** Was kommt an, wie Versionen und Artefakte zusammenhängen; danach Install & Update.  
**Nicht hier:** Compose/Volumes/Ports → [`runtime.md`](runtime.md) · LAN-TLS-Betrieb → [`tls.md`](tls.md) · Settings-Inhalt → [`backup.md`](backup.md) · Container-Innenleben → [`../architecture/`](../architecture/)

Format-Validierung `.pfupdate`: `packages/server-shared/src/pfupdate.ts` (Code = Vertrag).

---

## 1. Prinzip

Der Stack kommt als **versionierte Container-Images** zur Praxis. Dort wird **nicht** aus dem Monorepo gebaut — Images laden, Host-Zustand pflegen, Compose starten.

```text
Build (Repo)  →  Artefakte (.tar.gz / .pfupdate / Manager-DMG)
                     ↓
Manager + Setup-API (Loopback, Manager-Child)  →  Install-Home (.env, manager-state, Templates)
                     ↓
Docker Compose  →  app + sandbox (+ optional proxy)
```

| Rolle | Verantwortung |
| --- | --- |
| **Release-Build** | Images taggen, Pakete bauen, Manifest/Checksummen |
| **Manager** | Operative Hülle: Wizard, Wartung, Update-UI |
| **Setup-API** | Host schreiben, `docker load` / Compose, Probes |
| **Architektur** | Was in `app`/`sandbox` läuft — nicht wie es ausgeliefert wird |

Gateway-Images sind **Lab**, nicht Produkt-Default (`--with-gateway` nur bewusst).

---

## 2. Versionen

Drei Zahlen — nicht vermischen:

| Begriff | Beispiel | Wo | Wofür |
| --- | --- | --- | --- |
| **Manager-Version** | `0.3.0` | `manager/package.json` | Electron-App, DMG-Name, `minimumManagerVersion` im Update-Paket |
| **Stack-Release** | `0.4.0` | `--version` / `PRAXIS_FLOW_RELEASE_VERSION` beim Build | Image-Tags `praxis-flow/app:<ver>` + `sandbox:<ver>`, `manager-state`, Manifest `releaseVersion` |
| **Monorepo** | `0.4.0` | Root-`package.json` | npm-Workspaces — **nur Default**, wenn `--version` fehlt |

Stack-Release und Monorepo sind **nicht gekoppelt**. Kunden-Release immer explizit:

```bash
export PRAXIS_FLOW_RELEASE_VERSION=0.4.0
npm run release:pfupdate -- --version "$PRAXIS_FLOW_RELEASE_VERSION"
```

**Anzeige (keine vierte Version):** Beim App-Image-Build setzt `scripts/release-app-image.mjs` `PRAXIS_FLOW_STACK_VERSION` auf denselben Wert wie `--version`. Die UI liest ihn über `GET /api/v1/ops/health` → `stackVersion`. Lokal/Dev: Feld leer.

**Empfehlung:** Stack-Tags als Semver, unabhängig von der Manager-Semver (Manager darf öfter patchen). Major am Stack bei Breaking Changes an API/Images.

**Zur Laufzeit sichtbar:**

| Ort | Feld | Bedeutung |
| --- | --- | --- |
| Manager → Wartung | aktuelles Release | `HostStatus.deliveryImages` / `manager-state` |
| `manager-state.json` | `release.releaseVersion` | aktives Stack-Release |
| `.env` | `PRAXIS_FLOW_*_IMAGE` | Compose-Image-Refs |
| Health | `stackVersion` | in die App eingebranntes Release |

---

## 3. Artefakte

| Artefakt | Build | Manager-Weg | Inhalt (Produkt) |
| --- | --- | --- | --- |
| **`.tar.gz` + Sidecar** | `npm run release:images` | Wizard → Release-Paket | `app` + `sandbox` + Proxy-Image, Manifest, SHA256, Caddy-Lizenz |
| **`.pfupdate`** | `npm run release:pfupdate` | Wartung → Software-Update | dasselbe plus Compose-Templates, `.env.example`; Cutover/Rollback |
| **Manager-DMG** | `npm run dist:manager:mac` | Installation der Hülle | Electron + eingebettete Setup-API/Templates; eigener Versionszyklus |

- Updates laufen **nur** über `.pfupdate`. Das Wizard-`.tar.gz` ist Erstinstall (kein Update-Cutover).
- Manager-DMG selten neu; unsigned/nicht notarisiert (interne Auslieferung).

### Image-Refs

```text
praxis-flow/app:<releaseVersion>       # Pflicht
praxis-flow/sandbox:<releaseVersion>   # Pflicht
praxis-flow-proxy:2.11.4-acmedns       # neue Pakete (PRAXIS_FLOW_PROXY_IMAGE)
caddy:2.11.4                           # Compose-Default / Legacy-Pakete ohne Custom-Proxy
praxis-flow/gateway:<releaseVersion>   # nur Lab (--with-gateway)
```

Konstante im Code: `PRAXIS_FLOW_PROXY_IMAGE_REF` in `packages/server-shared/src/pfupdate.ts`.

`<releaseVersion>` muss übereinstimmen mit Manifest `releaseVersion`, gesetzten versionierten `images.app|sandbox` (und `gateway` falls vorhanden) und `manager-state` → `release.releaseVersion`.

**Proxy in der Auslieferung:** Custom-Image (xcaddy + `dns.providers.acmedns`) liegt im Paket, startet **nicht** von allein. Aktivierung über Manager/Setup (`PROXY_ENABLED`); Compose `pull_policy: never` — keine Registry-Nachzüge in der Praxis. Betrieb und TLS: [`tls.md`](tls.md). Base-Image nur über freigegebenen Digest pullen (Build); Manifest trägt Registry-Digest + Archive-Image-ID + Plattform. Ältere Pakete mit `images.proxy=caddy:2.11.4` bleiben gültig.

**Dev-Tags:**

```bash
docker compose build                 # praxis-flow/app:local, sandbox:local
npm run release:pfupdate:current     # packt :local ohne Rebuild
```

### Build-Scripts (kurz)

| Script | Zweck |
| --- | --- |
| `release:images` / `:pack` / `:current` | Erstinstall-Archiv |
| `release:pfupdate` / `:pack` / `:current` | Update-Paket (+ Validierung) |
| `dist:manager:mac` | Manager-DMG |

Pipelines und Ausgabe-Layouts: [§6](#6-build-wie-die-artefakte-entstehen).

CI: `.github/workflows/release-images.yml` baut bei Tag `v*` das Erstinstall-Artifact — **nicht** automatisch `.pfupdate`/DMG.

---

## 4. Erstinstallation

**Kundenweg:** Praxis Flow Manager (Assistent).  
**Support-Fallback:** CLI `npm run setup`.  
**TLS-Details** (Schritt HTTPS + später Cutover): [`tls.md`](tls.md).

### 4.1 Voraussetzungen

| Bedarf | Warum |
| --- | --- |
| **Docker** (Desktop oder Engine) + Compose v2, Daemon läuft | Stack starten; Wizard-Schritt 1 prüft Installation/Daemon/Compose |
| **Manager** (DMG oder `npm run dev:manager`) | Operative Hülle; startet die Setup-API als eigenen Child auf Loopback (ephemerer Port, nicht still `:9190`) |
| **Release-Paket** `.tar.gz` + Sidecar (`manifest.json` / `SHA256SUMS.txt`) | Delivery: Images laden (`POST /api/setup/host/images/load`). Dev-Profil (`PRAXIS_FLOW_COMPOSE_PROFILE=dev`): oft **nicht** erforderlich |
| **Freie Ports** | App **8080** (ohne Proxy); mit Proxy später **80** (und **443** bei TLS). Belegte 8080 → Netzwerk-Prerequisite „bereits belegt“ |
| **Import- & Export-Ordner** auf dem Host | Wizard-Schritt 3; unter Docker Desktop: File Sharing für diese Pfade |
| Optional: **feste LAN-IPv4** / DHCP-Reservierung | Stabil für Geräte-URLs; später relevant für TLS-Lease |

Setup-API und Manager sprechen nur Loopback — kein Setup aus dem Praxis-LAN.

### 4.2 Install-Home

| Plattform | Default ohne `PRAXIS_FLOW_HOME` |
| --- | --- |
| macOS | `~/Library/Application Support/PraxisFlow` |
| Windows | `%ProgramData%\PraxisFlow` |
| Linux | `~/.local/share/PraxisFlow` |

Override: `PRAXIS_FLOW_HOME` (absolut). Compose-Projektname: Default-Install-Home → `praxis-flow`; abweichender Basename → `pf-<basename>`; Override `COMPOSE_PROJECT_NAME` — isoliert parallele Test-Installs.

Beim ersten Start kopiert Setup fehlende Templates (`.env.example`, Delivery-Compose, Proxy-Overlays) ins Install-Home.

Zurücksetzen (Dev/Support): `npm run setup:reset -- --yes` (löscht Install-Home-Inhalt nach Compose-Down — mit Bedacht).

### 4.3 Manager-Assistent (8 Schritte)

Labels: `WIZARD_STEP_LABELS` in `manager/src/renderer/wizard-flow.ts`.

| # | Schritt | Inhalt |
| --- | --- | --- |
| 1 | **Voraussetzungen** | Docker OK; Release-Paket laden falls `deliveryImages.required`; Netzwerk-Prerequisites (u. a. Port 8080). Weiter nur wenn `canLeaveWizardStep1` |
| 2 | **Routing** | Simple/Complex. **Kein** Praxis-Anzeigename hier — der gehört nach Ops `/ops/setup` |
| 3 | **Import & Export** | Host-Pfade Pflicht (sonst Validierungsfehler) |
| 4 | **Netzwerk** | LAN-IP + Erreichbarkeit (LAN-IP / Rechnername / Custom-Host) → kanonische `http://`-URL |
| 5 | **Zugang** | Optional **Port 80** (HTTP-Proxy). Gateway im Manager immer **aus** (`DISABLED_GATEWAY_PLAN`) |
| 6 | **HTTPS** | Nur wenn Proxy an; sonst Sprung → 7. Phasen: offer → hostname → lease → mail/PEM. Assistent endet bei Mail/Staging — **DNS-Warten, Zertifikat, Cutover unter Netzwerk** |
| 7 | **Vorschau** | `POST /api/setup/host/plan` → Geräte-URLs |
| 8 | **Abschluss** | `POST /api/setup/host/apply` (`runCompose`), danach Probes / Links |

Ersteinrichtung ohne `.env`: Assistent fullscreen. Späterer Re-Run: Tab „Assistent“.

Nach Apply: MFA/Ops-PIN Standard **`0000`** (änderbar in der App; Reset im Manager → Wartung).

### 4.4 CLI-Fallback

```bash
npm run setup                 # interaktiv: LAN-IP, Praxisname, optional Gateway (Linux), Compose
npm run setup:reset -- --yes
```

Abweichungen zum Manager: CLI fragt den **Praxisnamen**; Gateway-Option existiert (Lab/Linux). Produktweg bleibt der Manager ohne Gateway.

### 4.5 Dev-Iteration

```bash
export PRAXIS_FLOW_HOME=/tmp/pf-dev-001
export PRAXIS_FLOW_COMPOSE_PROFILE=dev
npm run setup:reset -- --yes
npm run dev:manager
```

Dev baut lokal (`docker-compose.yml`); Release-Paket oft nicht nötig.

### 4.6 Fallstricke

| Symptom | Typische Ursache | Was tun |
| --- | --- | --- |
| Schritt 1 blockiert: Docker | Daemon aus / Compose fehlt | Docker Desktop starten; Hinweise aus Setup |
| „Release-Paket fehlt“ / Images nicht geladen | Delivery ohne `docker load` | `.tar.gz` + passenden Sidecar wählen; Laden kann Minuten dauern |
| SHA256-Fehler beim Laden | Sidecar ≠ Archiv | Gleichen Release-Ordner verwenden, nicht mischen |
| Port 8080 belegt | anderer Container/Prozess | Prerequisite-Detail prüfen; Port freigeben oder Konflikt beenden |
| „Import- und Exportordner angeben“ | leere Pfade | Ordner anlegen; Docker File Sharing |
| Keine / falsche LAN-IP; `lanIpStale` | DHCP-Wechsel, VPN, Adapter | IP neu wählen; bei TLS-Lease erst IP klären (stale blockiert Lease) |
| Kein HTTPS-Schritt | Proxy aus | Port 80 in Schritt 5 aktivieren — sonst bewusst HTTP-only |
| HTTPS „fertig“, Geräte noch HTTP | erwartet | Cutover erst unter **Netzwerk** nach DNS/Zertifikat — [`tls.md`](tls.md) |
| LAN rot, lokal grün (Dev) | Shell-`HTTP_PROXY` leitet RFC1918 um | `NO_PROXY` um Privatnetze ergänzen; siehe Manager-README |
| Praxisname fehlt im Wizard | Absicht | Ops `/ops/setup` nach dem ersten Start |
| Gateway im Manager nicht wählbar | Absicht (Produktgrenze) | Captive = Praxis-IT / Lab — [`integrations.md`](integrations.md) |

## 5. Update (`.pfupdate`)

**Einziger unterstützter Update-Weg:** Manager → Wartung → Software-Update → eine `.pfupdate`-Datei.  
Erstinstall-`.tar.gz` ist **kein** Update. Manuelles Tag-Tauschen in `.env` + `compose up` ist nur Support-Notfall **ohne** Settings-Cutover/Rollback.

Paket bauen: [§6.2](#62-update--npm-run-releasepfupdate). Was Settings behalten: [`backup.md`](backup.md).

### 5.1 Voraussetzungen

| Bedarf | Warum |
| --- | --- |
| Laufende Installation (`.env`, `manager-state`) | Sonst Apply: „Keine .env — Setup zuerst“ |
| **Stack läuft** vor Apply | Pre-Update-`.pfbackup` über Maintenance-App `127.0.0.1:8082` |
| Manager ≥ `minimumManagerVersion` im Paket | Inspect/Apply lehnen ältere Manager ab |
| Passendes Settings-Format | `supportedSettingsFormatVersions` (heute `[1]`) |
| Docker Daemon | `docker load` + Compose stop/up |

Apply-Timeout im Manager: **15 Minuten** (`UPDATE_APPLY_TIMEOUT_MS` / gleich für Image-Load).

### 5.2 Ablauf (UI)

1. `.pfupdate` wählen  
2. **Inspect** — `POST /api/setup/host/update/inspect` (Struktur, Checksummen, Kompatibilität, Release-Vergleich)  
3. **Vorschau** — Ziel-/Ist-Release, Mindest-Manager, Settings-Formate, Schema  
4. **Bestätigen** — automatisches Praxis-Backup; Queue geht verloren; Praxis kurz offline  
5. **Apply** — `POST /api/setup/host/update/apply`

UI-Phasen: `inspect` → `preview` → `applying` → `success` | `failed` (`pfupdate-wizard-flow.ts`).

### 5.3 Kompatibilität

| Prüfung | Quelle |
| --- | --- |
| Archiv + Manifest + SHA256 | `packages/server-shared/src/pfupdate.ts` / `validateExtractedPfupdate` |
| Manager ≥ `minimumManagerVersion` | Manager sendet Version mit; Build setzt Default = `manager/package.json` |
| Settings-Format | laufende Maintenance-App oder Build-Default |
| Image-Tags = `releaseVersion` | Pflicht für app/sandbox (gateway strikt, falls im Paket) |
| Nach Cutover | `targetSchemaVersion: 1` → Fresh DB + Settings-Import |

**Regel:** Ein `.pfupdate` darf keine höhere `minimumManagerVersion` verlangen als die Manager-DMG, mit der es freigegeben wurde.

### 5.4 Apply-Phasen (Ist-Code)

Vorbereitung (**Stack noch oben**, Backup über `:8082`):

| Phase | Aktion |
| --- | --- |
| `stage_package` | Archiv extrahieren |
| `validate_package` | Struktur + Kompatibilität |
| `create_settings_backup` | `.pfbackup` → u. a. `<install-home>/backups/` |
| `load_images` | `docker load` aus `images/praxis-flow-images.tar` |

Cutover (**Stack gestoppt**):

| Phase | Aktion |
| --- | --- |
| `stop_stack` | `compose stop` |
| `backup_rollback_state` | Snapshot `.env`, `manager-state`, Templates, DB-aside |
| `install_templates` | Compose/Caddy-Templates aus Paket |
| `write_release_state` | Image-Tags + `releaseVersion` atomar |
| Fresh-DB-Cutover | alte DB beiseite → App mit neuem Image → Settings importieren → aktive Gerätefreigaben aus Aside kopieren → verifizieren → Full-Stack + Health (`fresh-db-settings-cutover.ts`; Phasen u. a. `move_database` … `copy_device_authorizations` … `health_check`) |

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

| Symptom | Ursache | Was tun |
| --- | --- | --- |
| „Manager-Version … zu alt“ | Paket verlangt neueren Manager | Manager-DMG zuerst aktualisieren |
| Inspect/Apply: Settings-Format | Format-Mismatch | passendes Paket / neuerer Stack |
| Update bricht bei Backup ab | Stack/Maintenance `:8082` nicht erreichbar | Stack starten, dann Update erneut |
| „Keine .env“ | Install unvollständig | Erstinstall (§4) nachholen |
| Images laden fehlgeschlagen | kaputtes Archiv / Docker voll | Logs prüfen; Disk/Docker |
| Timeout nach ~15 min | langsamer Host / großer Load | erneut versuchen; Host-Ressourcen |
| Warteschlange weg nach Update | erwartet (Fresh DB) | Kommunikationshinweis vor Apply |
| Nur Image-Tags in `.env` geändert | kein Cutover/Rollback | nicht als Produkt-Update nutzen |

## 6. Build — wie die Artefakte entstehen

Gemeinsam (Stack-Pakete): Docker muss laufen. `--version` / `PRAXIS_FLOW_RELEASE_VERSION` setzt den Stack-Tag.  
`:pack` / `--no-build` überspringt `docker build` und packt vorhandene lokale Tags.  
`:current` = `--no-build --version local`.

Proxy-Schritt (beide Stack-Pakete): `scripts/release-proxy-image.mjs` → Base `caddy:2.11.4@<Registry-Digest>` pullen, Custom-Image `praxis-flow-proxy:2.11.4-acmedns` aus `proxy/Dockerfile` bauen, Modul `dns.providers.acmedns` prüfen, Digest-Metadaten ins Manifest. Konstanten: `packages/server-shared/src/pfupdate.ts`.

App/Sandbox-Build: `scripts/release-app-image.mjs` (u. a. Build-Arg `PRAXIS_FLOW_STACK_VERSION`); Release-Builds mit SBOM + Provenance (`--sbom=true`, `--provenance=mode=max`).

### 6.1 Erstinstall — `npm run release:images`

Script: `scripts/build-release-images.mjs`

1. Optional: `docker build` → `praxis-flow/app:<ver>`, `praxis-flow/sandbox:<ver>`
2. Proxy-Image wie oben vorbereiten
3. `docker save` der drei Images → gzip → `praxis-flow-<ver>-images.tar.gz`
4. Sidecar daneben: `manifest.json`, `SHA256SUMS.txt`, `THIRD_PARTY_NOTICES.txt`, `licenses/caddy/LICENSE.txt`

**Ausgabe:** `dist/releases/praxis-flow-<ver>/`

Kein Gateway im Produkt-Archiv. Keine Compose-Templates in diesem Paket (Templates kommen aus Manager/Setup-Bootstrap bzw. `.pfupdate`).

### 6.2 Update — `npm run release:pfupdate`

Script: `scripts/build-pfupdate.mjs`

1. Optional: `docker build` app + sandbox (+ gateway nur mit `--with-gateway`)
2. Proxy-Image wie oben
3. Staging: `docker save` → **unkomprimiertes** `images/praxis-flow-images.tar`
4. Templates kopieren: `docker-compose.delivery.yml`, `docker-compose.proxy.delivery.yml`, `docker-compose.proxy-tls.delivery.yml`, `proxy/Caddyfile`, generiertes `templates/.env.example` (Image-Tags gesetzt); Gateway-Compose nur mit Flag
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

Ältere Pakete ohne Proxy-/Gateway-Felder bleiben gültig (v1-kompatibel).

### 6.3 Manager-DMG — `npm run dist:manager:mac`

1. `prepare:packaged` (`manager/scripts/prepare-packaged-resources.mjs`): Setup-`dist` + `server-shared` nach `manager/build-resources/setup/` (Imports umschreiben, Production-Strip); Delivery-Templates + `.env.example` + `proxy/Caddyfile` nach `build-resources/templates/`
2. `electron-vite build` (Main, Preload CJS, Renderer)
3. `electron-builder --mac dmg` → `manager/dist/Praxis Flow Manager-<managerVersion>-<arch>.dmg`

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
