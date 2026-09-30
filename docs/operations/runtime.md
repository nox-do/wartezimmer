# Runtime — Compose, Host, Tagesbetrieb

Stand: 2026-09-14 · am Code geprüft (`setup/src/docker.ts`, Compose Delivery/Dev)

**Scope:** Was nach der Installation läuft — Services, Compose-Stacking, Ports/Volumes, Alltag.  
Nicht: Release-Bau → [`delivery.md`](delivery.md) · LAN-TLS → [`tls.md`](tls.md) · Backup → [`backup.md`](backup.md) · Anbindungen → [`integrations.md`](integrations.md)

## 1. Zielbild

- Wenige Container, ein klarer Einstieg, **Manager-first** (Setup-API / Wartung)
- Praxis: versionierte Images starten — **kein** lokales `docker compose build`
- Delivery-Compose: nur `image:`, kein `build:` (`docker-compose.delivery.yml`)
- Kein Kubernetes, kein externer Broker, kein separater DB-Container (SQLite in `app`)

## 2. Product-Services

| Service            | Rolle                                      | Sichtbarkeit                                        |
| ------------------ | ------------------------------------------ | --------------------------------------------------- |
| `app`              | API + UI (Terminal/MFA/TV/Portal) + SQLite | ohne Proxy offen `:8080`; hinter Proxy nur Loopback |
| `sandbox`          | Dokumentenvorschau / Form2PDF, ClamAV      | nur Docker-Netz (`expose 8081`)                     |
| `proxy` (optional) | Caddy HTTP und ggf. HTTPS                  | `:80` / `:443` — [`tls.md`](tls.md)                 |

**Nicht Produktkern:** TLS-Lab (`pebble` / `acme-dns` / `coredns`) → [tls-lab.md](../development/tls-lab.md). openNDS-Gateway-Stack entfernt → [`../archive/gateway-captive-portal.md`](../archive/gateway-captive-portal.md).

UI-Rollen laufen als statische Assets aus dem `app`-Image. Praxisname/Kontakte: DB (Ops), nicht Wizard. Auth-Secrets nur serverseitig in `.env`.

## 3. Compose-Stacking (Ist)

Resolver: `resolveComposeFiles` / `resolveComposeFileList` in `setup/src/docker.ts`.

| Schicht   | Dev                                                               | Delivery                      | Wann                                  |
| --------- | ----------------------------------------------------------------- | ----------------------------- | ------------------------------------- |
| Base      | `docker-compose.yml`                                              | `docker-compose.delivery.yml` | immer                                 |
| Proxy     | `docker-compose.proxy.yml`                                        | `….proxy.delivery.yml`        | `PROXY_ENABLED` + Mode `http`/`tls-*` |
| Proxy-TLS | `….proxy-tls.yml`                                                 | `….proxy-tls.delivery.yml`    | Mode `tls-*` **oder** `TLS_STATE≠off` |
| TLS-Lab   | `docker-compose.tls-lab.yml` + `docker-compose.tls-lab-proxy.yml` | —                             | nur Dev + `TLS_ACME_DIRECTORY=pebble` |

Die vorhandene `docker-compose.yml` kennzeichnet das Dev-Profil; reine Delivery-Verzeichnisse
verwenden `docker-compose.delivery.yml`. Gespeicherte Release-Image-Referenzen in `.env`
oder Manager-Metadaten schalten ein Repository nicht auf Delivery um.

openNDS-Gateway-Compose ist entfernt (nicht Produkt). Historie: [`../archive/gateway-captive-portal.md`](../archive/gateway-captive-portal.md).

TLS-Overlay nur nach Proxy-Overlay. Default-Compose-Projektname typisch `praxis-flow` (Volumes z. B. `praxis-flow_app_data`).

Leitplanken: `restart: unless-stopped`, Healthchecks, **feste Image-Tags** (kein `latest` im Praxisbetrieb).

## 4. Persistenz & Host-Pfade

| Name                                  | Inhalt                                                                   |
| ------------------------------------- | ------------------------------------------------------------------------ |
| Volume `app_data`                     | SQLite + Runtime-Status (`/var/lib/praxis-flow/app`)                     |
| `tmpfs` Sandbox-Intake                | Temporäre Dokumente, maximal 256 MiB standardmäßig; Verlust bei Neustart |
| Volume `clamav_db`                    | ClamAV-Signaturen                                                        |
| Bind `EXPORTS_HOST_PATH` → `/exports` | Exporte bleiben liegen                                                   |
| Bind `IMPORTS_HOST_PATH` → `/imports` | z. B. CSV-Kontaktlookup                                                  |

Docker Desktop: File Sharing für Host-Pfade. Kein Log-Volume — stdout + json-file-Rotation:

- Default `DOCKER_LOG_MAX_SIZE=10m`, `DOCKER_LOG_MAX_FILE=5`
- Greift für **neu erstellte** Container (`--force-recreate` nach Limit-Änderung)
- Altlast `praxis_flow_logs_data` ggf. manuell löschen wenn leer

## 5. Netz & Ports

| Port         | Wer                           | Hinweis                                                                                         |
| ------------ | ----------------------------- | ----------------------------------------------------------------------------------------------- |
| `8080`       | App                           | ohne Proxy bewusst `0.0.0.0` für den initialen internen Betrieb; mit Proxy zwingend `127.0.0.1` |
| `8082`       | Maintenance                   | nur `127.0.0.1` am Host — Backup/Import ([`backup.md`](backup.md))                              |
| `9190`       | Setup-API (CLI `setup:serve`) | Default nur für manuelles Serve; der Manager bindet einen eigenen ephemeren Loopback-Port       |
| `80` / `443` | Proxy                         | nur an `SETUP_LAN_APP_IP`; TLS ab prepare/cutover — [`tls.md`](tls.md)                          |

Sandbox ohne öffentlichen Host-Port. Portal unter `/portal` im `app`-Container.
Der proxyfreie Modus bietet bewusst keine NIC-Isolation. Explizites
Staff-Binding, TLS und ein späteres Restricted-/Portal-Binding setzen den Proxy
voraus; dann blockiert Setup Start/Recreate bei fehlender oder nicht lokaler
Staff-IP und prüft nach dem Apply die tatsächlichen Docker-Publishes.

## 6. Tagesbetrieb

**Produktweg:** Praxis Flow Manager → Status / Wartung.

| Aktion                  | Bedeutung                                                                                   |
| ----------------------- | ------------------------------------------------------------------------------------------- |
| Start / Stop / Neustart | Compose up / **stop** (Volumes bleiben) / kontrolliertes Recreate; gestoppter Stack → Start |
| Logs                    | pro Service über Setup-API                                                                  |
| Health                  | `GET /api/v1/ops/health` (Compose-Healthcheck + Support)                                    |
| Update                  | Wartung → `.pfupdate` ([`delivery.md`](delivery.md) §5)                                     |
| Backup                  | Wartung → `.pfbackup` ([`backup.md`](backup.md))                                            |
| Staff-PIN               | Standard nach Install **`0000`**; Reset in Manager-Wartung                                  |

**Fachlicher Tagesreset** (MFA „Tag neu starten“ / Day-Lifecycle) ≠ Container neu spawnen — Tickets/Outbox/Sandbox-Intake, Stack bleibt stehen.

Nach Update (Stichprobe): Health OK, Check-in, MFA-Queue; optional Smoke `smoke:practice-hours` / `smoke:day-lifecycle`.

Die Proxy-Overlays ersetzen die offene Portliste des initialen Betriebs mit Compose `!override`.
Direkte Compose-Aufrufe benötigen deshalb Compose **≥ 2.24.4**; der
Manager-/Delivery-Weg setzt ebenfalls eine aktuelle Compose-v2-Installation
voraus.

Netzwerk-Apply und Proxy-Repair sichern die bisherige `.env` vor Änderungen.
Vor Container-Eingriffen wird die zusammengeführte Compose-Konfiguration mit
`config --quiet` auf fehlende Pflichtwerte und Konfigurationsfehler geprüft.
Scheitert diese Prüfung oder die Proxy-Image-Prüfung, wird nur der Env-Zustand restauriert;
laufende oder gestoppte Container bleiben unverändert. Bei einer frischen
Installation wird die dabei angelegte `.env` wieder entfernt.

Nach einem begonnenen Compose-Apply werden bei Fehlern Teil-Container ohne
Volume-Löschung bereinigt und die vorherige Env zurückgespielt. War der Stack
vorher gestoppt, bleibt er gestoppt. Beim Wiederanlauf wartet Setup bis zu
120 Sekunden auf gesunde Services (Prüfintervall 2 Sekunden) und prüft danach
im Proxy-Modus die tatsächlichen Bindings. `health=starting` ist während dieser
Wartezeit kein endgültiger Rollback-Fehler. Scheitern Cleanup, Wiederanlauf,
Healthchecks oder Binding-Prüfung, meldet Setup ausdrücklich, dass die Laufzeit
nicht vollständig wiederhergestellt wurde. Fehlerdetails bleiben in der Meldung;
bei nicht bereinigter Erstinstallation bleibt die `.env` für die Reparatur erhalten.

## 7. Proxy / TLS

HTTP-Proxy (Port 80) ist optionaler Endzustand und **Voraussetzung** für LAN-HTTPS. Stacking/Ports hier; Aktivierung, Cutover, `state/tls/`: [`tls.md`](tls.md). Lab-ACME nicht in den Produktbetrieb mischen.

## 8. Support-Fallback (ohne Manager)

Nur Notfall — **kein** Settings-Cutover/Rollback wie beim `.pfupdate`.

```bash
# Delivery-Beispiel (cwd = Install-Home, .env gesetzt)
# Base immer; bei PROXY_ENABLED zusätzlich Proxy-Overlay; bei TLS_STATE≠off / tls-* auch proxy-tls
# (gleiche Reihenfolge wie setup/src/docker.ts — sonst kein Caddy auf 80/443, App oft nur Loopback)

docker compose \
  -f docker-compose.delivery.yml \
  -f docker-compose.proxy.delivery.yml \
  -f docker-compose.proxy-tls.delivery.yml \
  --env-file .env up -d

# Nur HTTP-Proxy (kein TLS prepared/active): proxy-tls-Zeile weglassen
# Ohne Proxy: nur docker-compose.delivery.yml

docker compose -f docker-compose.delivery.yml -f docker-compose.proxy.delivery.yml \
  -f docker-compose.proxy-tls.delivery.yml --env-file .env ps
docker compose -f docker-compose.delivery.yml -f docker-compose.proxy.delivery.yml \
  -f docker-compose.proxy-tls.delivery.yml --env-file .env stop   # Volumes bleiben
```

`compose down` entfernt Container/Netz; Volumes mit Default-`down` typisch nicht — trotzdem Manager-`stop` bevorzugen. Image-Tags nur in `.env` tauschen ist kein Produkt-Update. Overlay-Auswahl: §3 bzw. Manager.

### Sandbox: Umstellung auf temporäre Dokumente

Der tägliche Betrieb benötigt weder Manager noch Docker-Socket. Die Sandbox hat ein schreibgeschütztes Root-Dateisystem; Docker startet den bestehenden Container nach dem kontrollierten Prozessende neu. Der Tagesreset bleibt gesperrt, bis Purge und neuer Prozess bestätigt sind. Compose prüft die Prozess-Liveness; die Scanner-Bereitschaft wird separat angezeigt und beim tatsächlichen Scan durchgesetzt. Dadurch bleibt die App auch bei fehlenden Signaturen erreichbar.

Vor der erstmaligen Umstellung alle offenen Dokumente exportieren oder verwerfen und den alten Tagesreset abschließen. Anschließend die aktualisierten Images und Compose-Dateien ausrollen. Einen bisher explizit gesetzten Wert `CLAMAV_MAX_SIGNATURE_AGE_HOURS=24` auf `48` ändern, um die neue 24/48-Stunden-Regel zu verwenden. Der Wert bezeichnet nun die Zeit seit dem letzten erfolgreichen Aktualitätscheck.

Das bisherige benannte Volume `sandbox_intake_data` wird nicht mehr eingebunden. Docker entfernt es beim Wechsel nicht automatisch. Nach abgeschlossener Umstellung anhand der Compose-Projekt- und Volume-Labels das zu dieser Installation gehörende alte Volume ermitteln und gezielt entfernen; niemals pauschal `docker volume prune` oder `compose down -v` verwenden. Die übrigen Datenvolumes und Exporte bleiben erhalten. Es werden durch tägliche Neustarts keine neuen Images oder Container angesammelt; die Aufbewahrung alter Release-Images gehört zum Softwareupdate, nicht zum Tagesreset.

Verifikation ohne Änderung der Installation: `npm run build:server-shared`, `npm run -w @praxis-flow/sandbox build`, anschließend `SANDBOX_TEST_IMAGE=praxis-flow/sandbox:<lokaler-Tag> node scripts/smoke-sandbox-lifecycle.mjs`. Der Test erzeugt ausschließlich einen eigenen kurzlebigen Container samt Testvolume und entfernt beides anschließend. Er prüft Schreibschutz, Dokumentverlust beim Neustart, erhaltenen Cache und die Schreibrechte des realen FreshClam-Updaters offline.
