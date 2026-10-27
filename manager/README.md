# Wartezimmer Manager

Electron-Hülle für Host-Setup, Status und Wartung. Docker-Stack steuern (Start/Stop/Neustart), Container/Logs, `.pfbackup`, Erreichbarkeit (Poll) — alles über Setup-API + IPC.

## Bekannte Sicherheitslücke offen

**CVE-2026-111497 betrifft die eingebettete Electron-/Node-Runtime und das darin
gestartete Setup.** Der lokale Betrieb reduziert die Exposition; der externe
ACME-DNS-Aufruf beim TLS-Setup bleibt relevant. Die Behebung ist bis zu einem
bestätigten stabilen Electron-Fix zurückgestellt. Vor Electron-Updates und Releases
[KNOWN_VULNERABILITIES.md](../KNOWN_VULNERABILITIES.md) lesen und aktualisieren.

## Lizenz

Für Manager und Setup gilt die [Wartezimmer-Lizenz, Version 1.1](../LICENSE). Installation,
individuelle Anpassung und Betreuung im konkreten Auftrag eines Nutzers dürfen
berechnet werden. Die Software selbst darf dabei nicht mit Lizenz- oder
Nutzungsgebühren versehen oder vom Fortbestand eines Supportvertrags abhängig
gemacht werden. Sonstige Weitergabe angepasster Fassungen, eigene oder fremde
Softwareprodukte mit übernommenen geschützten Teilen und fremde Softwaredienste
benötigen eine gesonderte Erlaubnis, auch bei kostenlosen Angeboten.
Details und Ausnahmen regelt der vollständige Lizenztext.

Öffentliche Downloadangebote bleiben den offiziellen Bezugsquellen vorbehalten;
GitHub-Plattformrechte, Forks, automatische Quellcodearchive und Projektbeiträge
sind in Abschnitt 3 der Lizenz gesondert berücksichtigt. Unveränderte Fassungen
dürfen kostenlos und nichtöffentlich unmittelbar an einzelne Empfänger weitergegeben
werden. Weitere öffentliche Angebote benötigen eine gesonderte Erlaubnis.

## Dev starten

Vom Repo-Root:

```bash
npm run dev:manager
```

Die Dev-Scripts setzen `ELECTRON_RUN_AS_NODE` leer (`cross-env`, Windows/macOS/Linux). Manche IDE-Terminals setzen die Variable und würden Electron sonst wie plain Node starten.

Isolierte Install-Iteration (empfohlen für Wizard-Tests):

```bash
export WARTEZIMMER_HOME=/tmp/pf-dev-001
export WARTEZIMMER_COMPOSE_PROFILE=dev
npm run setup:reset -- --yes
npm run dev:manager
```

**macOS-Menü „Electron“:** Im Dev-Modus startet die generische `Electron.app`; der sichtbare Menüname kommt aus deren `Info.plist`, nicht aus `app.setName()`. `npm run dev:manager` patcht das lokal automatisch auf **Wartezimmer Manager** (wird bei `npm install electron` zurückgesetzt). Dauerhaft korrekt erst nach Packaging mit `productName`.

## Geräteadresse

Im Wizard wird die IP-Adresse ausgewählt; der Proxy-Schalter bestimmt den HTTP-Port:
`http://<IP>:8080` ohne Proxy, `http://<IP>` mit Proxy. Eine zusätzliche Auswahl
zwischen IP, Rechnername und eigener HTTP-Domain entfällt. Die Namenswahl gehört
zur HTTPS-Einrichtung. Der Manager hält keine editierbaren `reachabilityMode`-/
`customHostname`-Felder mehr. Plan-, Apply- und Netzwerk-API akzeptieren kein
`canonicalBaseUrl` mehr; veraltete Anfragen werden vor Änderungen abgewiesen.
Backend und Vorschau verwenden dieselbe HTTP-Adressableitung. `CANONICAL_BASE_URL`
bleibt als abgeleiteter persistierter Wert für Geräte-URLs und TLS erhalten.
Bestehende eigene HTTP-Adressen werden weiterhin gelesen
und beim Laden der Netzwerkkonfiguration nicht auf IP oder einen neuen Rechnernamen umgeschrieben.

Im Netzwerk-Tab stehen die gespeicherte Geräteadresse, Öffnen/Kopieren und die
Erreichbarkeitsprüfung direkt unter „Praxisadresse dieses Rechners“. Änderungen
zeigen eine getrennte Vorschau; die Aktionen beziehen sich auf die gespeicherte
Adresse. Während der TLS-Vorbereitung und nach dem Cutover bleibt die TLS-Identität maßgeblich.

## Architektur

- **Main:** startet `@wartezimmer/setup serve` als eigenen Child-Prozess (ephemerer Loopback-Port, Override via `SETUP_HOST_PORT`); Health-Handshake (`protocolVersion`, Build-ID, Install-Home) plus einmaliges Start-Token. Alle Setup-API-Calls über IPC-Proxy (`setup-api.ts`, Allowlist `/api/setup/host/*`, nur `127.0.0.1`)
- **Preload:** CJS, `sandbox: true` — nur IPC, **kein `fetch`**
- **Renderer (Svelte 5):** Shell mit Health-Header + Tabs (Status / Netzwerk / Wartung / Assistent). Koordination über `manager-shell-state` (Sessions, Loading) und `createManagerAppController()` → `mount(App)` → `start()`. Browser-Handoff per `shell.openExternal`.

### Refresh / Poll

- **Config-only** (`scope: 'config'`): nur `fetchSetupStatus` — insbesondere beim ersten Boot. Kein Runtime-Fetch als Nebeneffekt.
- **Mutation** (`scope: 'mutation'`): Config und – sobald `.env` existiert – Runtime als eine gemeinsame Generation. Parallele Tab-Refreshes können die beiden Schritte dadurch nicht auseinanderreißen.
- **Full refresh** (Tab-Wechsel): Config immer; Runtime parallel nur wenn der letzte erfolgreiche Config-Snapshot `.env` hat (`envExists`). Ein Fail verwirft den anderen nicht.
- **Runtime-Poll** alle **12s** wenn `lastConfig.envExists` — **jede View**, einschließlich beider Wizard-Presentations. Ohne `.env` kein Timer. Config-Fehler am Start: kein Runtime, kein Poll; späterer Config-Fehler behält den letzten Snapshot und dessen Poll-Regel.
- **Config** (`configSnapshot`): nur erfolgreicher Config-Fetch; Runtime-Poll schreibt nicht hinein
- Fehler getrennt: `statusError` (Config) vs. `runtimeError` (Health-Header); Statusseite bleibt bei Health-Fehlern sichtbar
- Überlappende Felder: reine Selektoren (`effectiveCompose`, …) — keine Mischkopie

### Install-Wizard (Assistent)

1. Voraussetzungen (Docker, ggf. Release-Paket, lokale Port-Checks)
2. Import & Export (Kontakte / MFA-Exporte)
3. Praxiszugriff (IP-Adresse und HTTP-Zugriffsart gemeinsam)
4. Vorschau (`POST /plan`)
5. Abschluss (`POST /apply`), Prüfung und MFA-Einstieg

HTTPS wird nach der Host-Einrichtung vollständig unter **Netzwerk** vorbereitet und
aktiviert ([`docs/operations/tls.md`](../docs/operations/tls.md)).

Erst-/Neuinstallation und Recovery: [`docs/operations/reinstall-recovery.md`](../docs/operations/reinstall-recovery.md).

Ein zentral als sauber nicht installiert erkannter Zustand startet den Assistenten
fullscreen ohne Tabs. Unklare oder unvollständige Installationen bleiben auf der
Statusseite und öffnen den Assistenten auf Wunsch eingebettet. Ältere Setup-Hosts
ohne Lifecycle-Feld behalten die bisherige Einstiegslogik.

### Status-Screen

- Betriebsmodus aus der zentralen Setup-Auswertung, getrennt von Runtime und offenen
  Portaländerungen; [Vertrag und Grenzen](../docs/architecture/manager-operating-modes.md)
- Bewusster Setup-Einstieg bei unklarer oder widersprüchlicher Einrichtung;
  Docker-Ausfall einer bestehenden Installation bleibt ein Betriebsproblem
- DHCP-Hinweis bei `network.lanIpStale`
- Interne Zugänge mit Kopieren / Öffnen; Portal ausdrücklich für interne Nutzung
- Betriebsmodus als kompakte, neutrale Karte; zusätzliche Vorgangs-/Fehlermeldungen darunter. Patientenzugang wird im Status nur bei angewendetem Restricted-Binding aufgeführt.
- Installationsdetails: Installations-ID, Installationsordner und verfügbare Software-Version. `.env`, Docker/Images und Compose-Projekt unter zusätzlicher technischer Diagnose. Öffnungszustände bleiben bei Refresh erhalten.
- **Stack läuft / gestoppt** und Probe-Kacheln: Health-Header (aus Runtime-Poll)

### Netzwerk-Tab

- Staff-Adresse samt Adapter und optional Proxy (`POST /network` mit optionalem Stack-Neustart)
- ohne Proxy bewusst offener initialer interner Betrieb auf `0.0.0.0:8080`
- mit Proxy App nur auf Loopback und Port 80/443 nur an der Staff-Adresse;
  Netzwerkdiagramm + tatsächliche Runtime-Binding-Checks
- Proxy-Wiederherstellung auch nach HTTPS-Cutover; offene Entwürfe zuerst übernehmen/verwerfen
- Docker/Caddy als Produktgrenze; Host-Firewall und Netztrennung bleiben bei Praxis-IT
- „HTTPS eingerichtet“ wird nicht mit einem tatsächlich laufenden Proxy gleichgesetzt

### Layout und Netzwerkaktionen

- Standardfenster 1000 px breit, Mindestbreite 480 px. Inhaltsfläche und Navigation verwenden dieselbe Maximalbreite.
- Netzwerkbereiche teilen ein 50/50-Raster mit 20 px Abstand an der Trennlinie; unter 800 px werden sie einspaltig. Keine festen Höhen oder abgeschnittenen Adressen.
- Systemschrift: Netzwerk-Inhalt 15 px, Hinweise/technische Werte 14 px, Expander-Titel 16 px. Netzwerk-CSS in `src/renderer/network.css`.
- Neue Netzwerk-Sessions starten mit allen Expandern eingeklappt. Übergeordnete Störungshinweise bleiben sichtbar.
- Übersicht: Betriebsmodus, Adressen, Verbindung und Patientenfreigabe. Aktuelle Bindung und Adapter stehen bei Praxisadresse; keine zusätzliche technische Disclosure in der Übersicht.
- Erfolgreiche Binding-Prüfungen sind aufklappbar, Abweichungen direkt sichtbar.
- Übernehmen/Verwerfen nur im jeweils geänderten Bereich (Praxisadresse oder Proxy). Beide nutzen weiterhin denselben Entwurf und gemeinsamen Save/Discard. Sind beide geändert, verschwinden nach erfolgreichem Speichern beide Leisten. HTTPS und Patientenfreigabe haben getrennte Aktionen.
- IP-Risiken stehen direkt am Kandidaten; leere Patienten-IP-Auswahl erklärt den nächsten Schritt. Netztrennung bleibt Aufgabe der Praxis-IT.

### Wartung

- Stack: Start / Stop / Neustart (Stop ohne Volume-Löschung; Bestätigung bei Stop/Neustart)
- **Neustart bei gestopptem Stack** = Start (`compose up -d`)
- **Betrieb wiederherstellen:** vorhandene `.env` und lokale Images erforderlich;
  Proxy-Konfiguration prüfen/neu erzeugen, laufende Container ohne Pull/Build
  wiederaufbauen. Gestoppte Dienste bleiben gestoppt.
  [Voraussetzungen und Erhalt](../docs/operations/rebuild.md).
- Logs pro Service (`GET /compose/logs`)
- Backup/Restore `.pfbackup` (`POST /backup`, validate, restore) — Vertrag: [`docs/operations/backup.md`](../docs/operations/backup.md)
- Import-/Export-Hostordner (`POST /storage`)
- Staff-PIN-Reset MFA/Ops (`POST /reset-staff-pins`)
- **Routing-Modus:** wird ausschließlich in der Ops-Web-App konfiguriert. Der Manager enthält keinen Routing-Dialog.
- **Technischer Kompatibilitätspfad:** Der lokale Setup-Endpunkt `/routing-mode` bleibt für bestehende Host-/Restore-Abläufe verfügbar, ist aber keine zweite fachliche Konfigurationsoberfläche.

### Routing-Modus

- **Fachliche Autorität:** Ops Settings unter `/ops/routing`; dort werden `GET/PATCH /api/v1/ops/settings` und die Routing-Capabilities verwendet.
- **Manager:** Host-Setup, Docker, Netzwerk, Backup und Wartung. Der interaktive Wizard schreibt den Routing-Modus nicht mehr.
- **Kompatibilität:** Der lokale Setup-Endpunkt darf für technische Restore-/Host-Abläufe bestehen bleiben; er ist explizit kein regulärer UI-Pfad.
- **Serverregeln:** Moduswechsel werden serverseitig bei offenen Visits abgelehnt. Complex Routing ist standardmäßig erlaubt; nur `COMPLEX_ROUTING_LICENSED=false` optet explizit aus.

Setup-API (Manager-Child auf Loopback; CLI-Default `127.0.0.1:9190`):

| Methode | Pfad                               | Zweck                                                                                                  |
| ------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------ |
| GET     | `/api/setup/host/status`           | Config-Snapshot (`HostStatus`)                                                                         |
| GET     | `/api/setup/host/runtime-health`   | Pollbarer Runtime-Snapshot                                                                             |
| GET     | `/api/setup/host/compose`          | Container-Status                                                                                       |
| GET     | `/api/setup/host/compose/logs`     | Log-Auszug                                                                                             |
| POST    | `/api/setup/host/compose`          | `{ action: start\|stop\|restart }`                                                                     |
| GET     | `/api/setup/host/backup`           | Info zum letzten `.pfbackup`                                                                           |
| POST    | `/api/setup/host/backup`           | eine `.pfbackup` v2 erzeugen (bei HTTPS mit eingebettetem TLS-Archiv)                                  |
| POST    | `/api/setup/host/backup/inspect`   | Inspect/Vorschau inkl. Kompatibilität & TLS-Gate                                                       |
| POST    | `/api/setup/host/backup/restore`   | Fresh-DB-Cutover + Settings-Import                                                                     |
| POST    | `/api/setup/host/storage`          | `{ importsHostPath, exportsHostPath, restartCompose? }`                                                |
| POST    | `/api/setup/host/network`          | `{ lanAppIp, proxy?, gateway, restartCompose? }` — Staff-/Proxy-Binding (gateway im Manager stets aus) |
| POST    | `/api/setup/host/reset-staff-pins` | MFA- & Ops-PIN auf Default `0000` (DB), Stack stop → reset → start                                     |
| GET     | `/api/setup/host/routing-mode`     | Kompatibilitätsroute: Capabilities inkl. `routingMode`, `complexRoutingLicensed`                       |
| POST    | `/api/setup/host/routing-mode`     | Kompatibilitätsroute: `{ routingMode: "simple"\|"complex" }` — proxied zur App-API mit Manager-Trust   |

| POST | `/api/setup/host/images/load` | Erstinstallation: einzelne `.pfinstall` mit internem Manifest (Format 2 erforderlich) |
| POST | `/api/setup/host/update/inspect` | Wartung: `.pfupdate`-Datei prüfen (Release, Kompatibilität, Warnungen) |
| POST | `/api/setup/host/update/apply` | Wartung: `.pfupdate`-Datei (Pfad), Cutover + Rollback |

Vollständiger Install-Reset bleibt CLI: `npm run setup:reset`.

Release-Pakete erzeugen: [`build-release-images.mjs`](../scripts/build-release-images.mjs) und [`build-pfupdate.mjs`](../scripts/build-pfupdate.mjs).

## macOS-Build erstellen

Vom Repo-Root:

```bash
npm run dist:manager:mac
```

Der Build erzeugt `dist/releases/<releaseVersion>/WartezimmerManager-<managerVersion>-<arch>.dmg`.
Der gemeinsame Release-Ordner wird über `WARTEZIMMER_RELEASE_VERSION` gewählt
(Standard: Root-Version aus `package.json`). Der Manager behält seine eigene
Version im Dateinamen. Entpackte Apps und Builder-Dateien liegen ausschließlich
unter `.tmp/build/manager/`.

Beim Packaging werden der kompilierte Setup-Server und die Delivery-Templates in die App-Ressourcen gelegt.
Im gepackten Modus startet der Manager die Setup-API aus diesen Ressourcen und nutzt standardmäßig
`~/Library/Application Support/Wartezimmer` als Install-Home.

## Dev-Hinweise

**Electron-/IPC-Smoke-Test:** `npm run smoke:manager` baut den Manager, startet ihn mit
einem temporären Install-Home und prüft den vollständigen Weg von Renderer über Preload
und IPC bis zur Setup-API. Die Testinstanz beendet sich anschließend automatisch.

**Zweite Manager-Instanz:** Produktiv eine Instanz. Im Dev-Modus gilt die Sperre **pro Install-Home** — parallele `WARTEZIMMER_HOME=…` bleiben möglich, zweimal dieselbe Home nicht.

**Fremde Setup-API:** Der Manager übernimmt **nicht** still einen Prozess auf Port 9190. Produktiv startet er immer einen eigenen Child. Expliziter Dev-Attach:

```bash
npm run setup:serve   # Terminal 1, Default :9190
WARTEZIMMER_SETUP_ATTACH=1 npm run dev:manager
```

Attach prüft denselben Handshake (Protokoll, Build-ID, Install-Home). Passt die Identität nicht, startet der Manager **nicht** auf der fremden API. Token: `setup:serve` ohne `WARTEZIMMER_SETUP_TOKEN` bleibt per curl nutzbar; ein Manager-Child verlangt das Start-Token.

**`Failed to fetch` / Setup-API nicht erreichbar:** Status-HTTP läuft über den **Main Process** (IPC), nicht per `fetch` im Preload — Sandbox blockiert localhost dort. Wenn der Fehler bleibt: Terminal mit `[setup]`-Logs prüfen, ggf. `npm run setup:serve` separat testen (`curl http://127.0.0.1:9190/api/setup/health`).

**LAN rot nach DHCP-Wechsel:** Unter **Netzwerk** aktuelle WLAN-IP wählen und übernehmen (oder Assistent erneut).

**LAN rot, lokal grün (Dev):** Shell-`HTTP_PROXY` leitet auch `192.168.*` um, wenn `NO_PROXY` nur `localhost` enthält. `proxy-toggle` muss RFC1918 ausschließen (`192.168.0.0/16`, `10.0.0.0/8`, …) oder Proxy für Praxis-Tests aus. Setup-Probes umgehen den Proxy direkt (`setup/src/probes.ts`).

## Typecheck

```bash
npm run -w @wartezimmer/manager typecheck
npm run -w @wartezimmer/setup test
```

LAN-TLS (Produkt): [`docs/operations/tls.md`](../docs/operations/tls.md).

## macOS — separate DMGs für Apple Silicon und Intel

```bash
npm run dist:manager:mac
```

Der Build auf macOS verwendet electron-builder **26.15.3** mit
`Platform.MAC.createTarget('dmg', Arch.arm64, Arch.x64)`. Auch
`build.mac.target` legt ARM64 und x64 explizit fest. Der Universal-Build ist
stillgelegt; beide Apps werden separat verpackt und geprüft.
Grundlage: [electron-builder v26](https://www.electron.build/v26/docs/architecture/).

Setup, vendortes `server-shared`, Main/Preload/Renderer, Schrift und Templates
sind architekturunabhängig. Setup startet über `process.execPath` mit der
jeweils eingebauten Electron-Node-Laufzeit; ein separates Node-Binary wird
nicht mitgeliefert. Es sind keine nativen `.node`-Module oder zusätzlichen
architekturspezifischen Programme erforderlich. Neue native Ressourcen müssen
für die jeweilige Zielarchitektur bereitgestellt werden.

Vor der DMG-Erstellung prüft `scripts/verify-macos-architecture.mjs` im
`afterPack`-Hook mit `lipo` die Zielarchitektur: Hauptprogramm, Electron
Framework, alle vier Helper und sämtliche weiteren Mach-O-/`.node`-Dateien
in der App, ihren Ressourcen und dem entpackten ASAR. ARM64 muss ausschließlich
`arm64`, Intel ausschließlich `x86_64` enthalten. Ein Fehler stoppt den Build;
beide DMGs müssen vorliegen, bevor sie in den Release-Ordner kopiert werden.
Manuell wiederholbar:

```bash
node manager/scripts/verify-macos-architecture.mjs ".tmp/build/manager/mac-arm64/Wartezimmer Manager.app" arm64
node manager/scripts/verify-macos-architecture.mjs ".tmp/build/manager/mac/Wartezimmer Manager.app" x64
node manager/scripts/smoke-packaged-setup.mjs ".tmp/build/manager/mac-arm64/Wartezimmer Manager.app/Contents/MacOS/Wartezimmer Manager" ".tmp/build/manager/mac-arm64/Wartezimmer Manager.app/Contents/Resources"
node manager/scripts/smoke-electron.mjs ".tmp/build/manager/mac-arm64/Wartezimmer Manager.app/Contents/MacOS/Wartezimmer Manager"
```

Downloads unter `dist/releases/<releaseVersion>/`:

- Apple Silicon: `WartezimmerManager-<managerVersion>-arm64.dmg`
- Intel: `WartezimmerManager-<managerVersion>-x64.dmg`

Manager-Version und Release-Version behalten ihre bisherigen Quellen;
`WARTEZIMMER_RELEASE_VERSION` überschreibt weiterhin nur das Release-Verzeichnis.
Build-Zwischenstände liegen unter `.tmp/build/manager/`.

Ohne Override lädt der Builder die Electron-Distributionen für beide
Architekturen. `WARTEZIMMER_ELECTRON_DIST` muss bei Verwendung auf einen Ordner
mit **beiden** unveränderten ZIPs zeigen:
`electron-v<electronVersion>-darwin-x64.zip` und
`electron-v<electronVersion>-darwin-arm64.zip`. Ein einzelnes ARM64-ZIP oder
die lokale ARM64-`node_modules/electron/dist` reicht für beide Builds nicht aus.

Die macOS-Apps werden ohne Signierung und Notarisierung ausgeliefert.
Native Intel-GUI-/Docker-Tests erfolgen auf einem Intel-Mac.

Die Projektlizenz liegt in `Contents/Resources/LICENSE`. Der Paketbau prüft,
dass sie mit der kanonischen `LICENSE` übereinstimmt. Artefakte und Prüfsummen
liegen unter `dist/releases/<releaseVersion>/`.

## Windows

`npm run dist:manager:win` erzeugt einen internen NSIS-Installer für x64.
Der Windows-Installer wird ohne Codesignierung veröffentlicht. Die Manager-Installer
für macOS und Windows bleiben bewusst unsigniert. Die bei Installation und Start
auftretenden Betriebssystemmeldungen sind Bestandteil der Plattformabnahme und
werden mit den Releasehinweisen dokumentiert.
Ziel: Windows 11, lokaler Docker Desktop mit WSL2/Linux-Containern und Compose
ab 2.24.4. Keine ARM64-Zusage. Der benutzerbezogene Manager braucht kein
separates Node/npm und fordert keine Administratorrechte an.

Windows ARM hat Early-Access-Status. Bisherige Versuche in einer VM ersetzen
keine Abnahme auf echter ARM-Hardware; ein natives ARM64-Releasepaket wird
derzeit nicht angeboten. Die reguläre Windows-Zusage gilt für x64.

Neue Daten liegen unter `%LOCALAPPDATA%\Wartezimmer`, außerhalb von Programm
und ASAR.
Das Betriebskonto bleibt über Installation, Docker-Betrieb und Updates gleich.
Deinstallation entfernt keine Praxisdaten. Windows-Pfadgrenzen beschreibt
[Runtime](../docs/operations/runtime.md), Dateirechte und Wiederherstellung
[Backup](../docs/operations/backup.md).
Der separate Patientenzugang ist unter Windows unterstützt. Die Netztrennung
ist nach jeder Installation im konkreten Praxisnetz zu prüfen.

Isolierter Runtime-Smoke nach `prepare:packaged`:

```powershell
node manager/scripts/smoke-packaged-setup.mjs
# Nach Windows-Packaging tatsächlich die gebaute EXE prüfen:
node manager/scripts/smoke-packaged-setup.mjs ".tmp/build/manager/win-unpacked/WartezimmerManager.exe" .tmp/build/manager/win-unpacked/resources
```

Der Smoke prüft den paketierten Setup-Prozess, ohne einen Docker-Stack zu verändern.
Installation, Update und Deinstallation sind separat mit einer isolierten
Windows-Testinstallation zu prüfen; Praxisdaten müssen dabei erhalten bleiben.

Windows verwendet die technischen Namen `WartezimmerManager.exe`,
`UninstallWartezimmerManager.exe` und
`WartezimmerManager-<version>-windows-x64-setup.exe`. Bei einer frischen
Installation heißt der Programmordner `%LOCALAPPDATA%\Programs\WartezimmerManager`.
Der sichtbare Produktname bleibt „Wartezimmer Manager“; Versionen bleiben in
Dateimetadaten und im Setup-Dateinamen. App-ID und Datenordner bleiben unverändert.
NSIS kann bei Updates einen registrierten bisherigen Installationspfad übernehmen;
ein alter Ordner mit Leerzeichen wird nicht automatisch umbenannt.
Der Windows-Build läuft über `scripts/build-windows.mjs`. Der macOS-Workaround
für den festgelegten electron-builder 26.15.3 übernimmt die NSIS-Uninstaller-
Icon-Patches, die dessen `UninstallerReader` auslässt. Die ursprüngliche CRC
bleibt unverändert und muss passen; die Integritätsprüfung wird nicht deaktiviert.
Nach dem Build werden sowohl die Setup.exe als auch der daraus extrahierte
Deinstaller geprüft. Fehler lassen den Build scheitern. Nur nach erfolgreicher
Prüfung wird die Setup.exe in den gemeinsamen Release-Ordner kopiert.
Eine zusätzliche `.exe.sha256`-Datei wird nicht erzeugt.
Bei einem Builder-Versionswechsel muss der Workaround neu bewertet werden.
`npm run -w @wartezimmer/manager test:packaging` prüft Rekonstruktion und negative
CRC-/Grenzfälle. Die echte Windows-Installations-/Deinstallationsabnahme bleibt
trotz bestandener Dateiprüfung erforderlich.

## Marke und App-Icons

Der Manager heißt **Wartezimmer Manager**. Das Logo basiert auf den drei Balken
aus `website/index.html`: Grün `#2d5941`, Orange `#eea978`.
Die Vektorvorlage liegt unter `build/icons/logo.svg`; die abgerundete helle
Fläche bildet das App-Icon. `icon.icns` wird für macOS verwendet, `icon.ico`
für die Windows-App sowie Installation und Deinstallation. `icon.png` dient
als Fenster-Icon. Der Manager zeigt dieselbe Vorlage kompakt links vor „Status“
in der Navigation. Der Produktname steht in der nativen Fensterleiste; eine
zusätzliche Titelzeile im Inhalt entfällt.

Bei Änderungen an der Vorlage: `python3 scripts/generate-icons.py` aus dem
Manager-Verzeichnis ausführen (Python mit Pillow; in Codex über
`load_workspace_dependencies` verfügbar). Die erzeugten Icons sind eingecheckt;
der reguläre Build braucht Python nicht.

Die App-ID lautet `de.wartezimmer.manager`, die npm-Pakete heißen
`@wartezimmer/*`. Installations- und Datenpfade verwenden `Wartezimmer`
beziehungsweise `wartezimmer`; es gibt keine Übernahme alter Installationen.

Die internen Electron-Namen heißen `WartezimmerManagerApi`,
`window.wartezimmerManager` und `window.wartezimmerManagerBridge`; die
IPC-Kanäle verwenden `wartezimmer:*`. Main, Preload und Renderer werden
gemeinsam ausgeliefert. Der GUI-Starttest nutzt `WARTEZIMMER_MANAGER_SMOKE`.
Setup und Proxy verwenden `WARTEZIMMER_*`-Variablen und den HTTP-Header
`X-Wartezimmer-Rejection`. Die Archivformate heißen `.pfinstall`, `.pfupdate`
und `.pfbackup`.
