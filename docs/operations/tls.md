# LAN-TLS (Produkt)

Stand: 2026-09-13 · §1–10 ausgearbeitet (Ops-Ist LAN-TLS)

**Scope:** Vertrauenswürdiges HTTPS im Praxis-LAN — Modell, Aktivierung, Betrieb, Grenzen.  
**Ist:** Manager-Wizard (Schritt HTTPS) + Netzwerk-Tab; Setup-API `/api/setup/host/tls/*`; Proxy-Service mit Custom-Caddy-Image.

Quellen (Historie; Ops-Ist ist dieses Dokument):

- Architektur/ACME/Compose: [`../plan-proxy-tls.md`](../plan-proxy-tls.md)
- Manager-UX: [`../plan-proxy-tls-manager.md`](../plan-proxy-tls-manager.md)
- HTTPS-UI-Aufräumen (erledigt): [`../archive/plan-manager-https.md`](../archive/plan-manager-https.md)
- Lab (Pebble): [`../archive/tls-lab.md`](../archive/tls-lab.md) — **nicht Produkt**
- Code: `setup/src/host-tls.ts`, `proxy-tls.ts`, `docker.ts`; Manager `wizard-flow.ts`, `tls-network-controller.ts`; `SETUP_TLS_ROUTES` in `packages/server-shared/src/setup-api.ts`

Verwandt: Runtime/Compose → [`runtime.md`](runtime.md) · Backup-Grenze → [`backup.md`](backup.md) · Artefakte/Proxy-Image → [`delivery.md`](delivery.md)

---

## 1. Entscheidung (Produktmodell)

Pro Managed-Installation gibt es einen stabilen **Installationsraum**
`<id>.<zone>`. Der aktive Staff-Hostname ist `staff.<installationsraum>`; sein
A-Record zeigt auf die **feste private IPv4** des Praxisservers. Caddy holt
ausschließlich `*.<installationsraum>` per **ACME DNS-01**. Der damit bereits
abgedeckte Name `portal.<installationsraum>` bleibt ohne Restricted-Binding
reserviert und am Proxy geschlossen. Custom TLS bleibt ein einzelner FQDN mit
von der Praxis geliefertem PEM.

```text
Browser (LAN) ── HTTPS/h2 ──► proxy:443 ── HTTP/1.1 ──► app:8080
Browser (LAN) ── HTTP      ──► proxy:80  ── 301 → HTTPS   (nach Cutover)
```

| Festlegung                        | Ist                                                                                                        |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Öffentlicher Name → private IPv4  | ja (A-Record öffentlich sichtbar, Ziel aus dem Internet nicht routbar)                                     |
| Portfreigabe 443 ins Internet     | **nicht** nötig für LAN-Nutzung; Warnung wenn jemand weiterleitet                                          |
| DNS-API / Installationsregister   | **nein** — Betreiber legt DNS manuell/zeitversetzt an                                                      |
| Wer erzeugt ID + Korrelationswert | **Manager/Setup** bei `tls/prepare`; derzeit keine Authentifizierung oder serverseitige Prüfung            |
| Wer schreibt DNS                  | **Betreiber** (managed Zone) bzw. Praxis (eigene Domain); Mailtext aus dem Manager                         |
| Router-DNS-Rebind                 | Praxis richtet **gezielte** Ausnahme ein, falls der Router öffentliche Namen mit privaten Zielen blockiert |
| Eigener Resolver von Praxis Flow  | **nein**                                                                                                   |
| TLS ohne HTTP-Proxy               | **nein** — Port 80 ist Voraussetzung (siehe §3)                                                            |
| App terminiert TLS                | **nein** — nur Caddy/`proxy`                                                                               |

**Zone heute (Code):** `TLS_OPERATOR_ZONE_DEFAULT = lan.notaus.de`, Betreiber-Mail `cert@notaus.de` (`packages/server-shared/src/setup-api.ts`). Das ist die **aktuelle Betreiber-/Testzone**, nicht die spätere Marken-Domain (`*.lan.praxis-flow.de` nur Zielbild in den Plänen).

**Namenswahl (Manager, ein Schritt):**

| Modus         | Ergebnis                                                                                             | Zertifikat                        |
| ------------- | ---------------------------------------------------------------------------------------------------- | --------------------------------- |
| Vorschlag     | Installationsraum aus 6-Zeichen-Label + `.<zone>`; Staff unter `staff.<raum>`                        | managed / ACME, nur `*.<raum>`    |
| Eigenes Label | `label.<zone>` als Raum (RFC-1123; reserviert u. a. `staff`, `portal`, `lan`, `acme`, `www`, `mail`) | managed / ACME, nur `*.<raum>`    |
| Eigene Domain | voller Hostname außerhalb der Betreiber-Zone                                                         | **custom** / PEM, kein ACME-CNAME |

Installations-ID: zufällig, stabil, kein Geheimnis. Der heute als
`oneTimeToken` bezeichnete Zufallswert wird im Mailtext mitgeführt und lokal
unter `<install-home>/state/tls/operator-token` gespeichert (nicht in
`GET /status`). Er wird von keinem Betreiberdienst entgegengenommen oder
verifiziert und ist deshalb **derzeit kein Authentifizierungs- oder
Autorisierungsmerkmal**. `tokenConsumed` beschreibt nur den lokalen
Lebenszyklus der Mail-Wiederholung. ACME-Delegation:
`_acme-challenge.<installationsraum>` zeigt per CNAME auf den acme-dns-Account.
Es gibt keinen zusätzlichen Challenge-CNAME für `staff.` oder `portal.`.

Warum HTTPS zusätzlich zur Vertraulichkeit: HTTP/2 über TLS umgeht Browser-Limits bei parallelen lang laufenden HTTP/1.1-Verbindungen (Queue-/Ops-SSE). Hop `proxy → app` bleibt HTTP/1.1.

---

## 2. Rollen & Verantwortlichkeiten

| Rolle                                | Tut                                                                                                                                                         | Tut nicht                                                                           |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| **Praxis / Praxis-IT**               | feste IPv4 oder DHCP-Reservierung; Rebind-Ausnahme; Mail an Betreiber (managed) bzw. A-Record + PEM (custom); nach Cutover Geräte-URLs/`CANONICAL_BASE_URL` | DNS-Zone des Betreibers pflegen; ACME-Credentials oder Private Keys in der UI sehen |
| **Produktbetreiber**                 | Zone `lan.notaus.de` (heute); Staff-A-Record + Wildcard-Challenge-CNAME nach Mail; ACME-DNS-Infrastruktur                                                   | Portal-A-Record vor Restricted-Binding; Host vor Ort administrieren                 |
| **Manager / Setup**                  | `prepare` (ID, Korrelationswert, Raum/Staff/Portal/Wildcard); Lease-Bestätigung; Mail-/PEM-Texte; `verify-dns`, Zertifikat, Cutover, Repair/Renew/Reset     | DNS schreiben; Portal-Listener vor Restricted-Binding öffnen                        |
| **Client (Terminal/TV/MFA/Browser)** | normalen DNS + HTTPS zum Praxisserver im LAN                                                                                                                | Zertifikate installieren; Hosts-Datei im Happy Path                                 |

**Happy Path (managed):** HTTP-Proxy **persistiert** (§3) → Installationsraum wählen → IPv4 bestätigen → Mail mit Staff-A-Record und Wildcard-CNAME an `cert@notaus.de` → Assistent geht mit **HTTP** weiter → unter **Netzwerk** warten/`verify-dns` → Wildcard-Zertifikat → Cutover auf `https://staff.<raum>`.
**Custom:** PEM stagen + A-Record bei der eigenen Domain → `verify-dns` (A) → Checks → Cutover (`tls-custom`).

Detailstrecken UI/API: §4–5.

## 3. Voraussetzung: HTTP-Proxy (Port 80)

TLS erweitert **denselben** `proxy`-Service (Caddy) — kein zweites System. Ohne Port-80-Proxy gibt es im Manager **keinen** HTTPS-Schritt und keinen TLS-Start unter Netzwerk (`wizardHttpsEligible(proxyEnabled)`).

### Was der Proxy tut

| Zustand                                                                   | Verhalten                                                                                        |
| ------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Proxy **aus**                                                             | App lauscht `0.0.0.0:8080` im LAN; kein Caddy                                                    |
| Proxy **an**, `PROXY_MODE=http`                                           | Caddy `:80` → `app:8080`; App nur noch `127.0.0.1:8080` (Setup-Probes lokal)                     |
| TLS vorbereitet/aktiv (`tls-managed` / `tls-custom` oder `TLS_STATE≠off`) | zusätzlich Overlay `proxy-tls`: Port **443**, `/data`/`/config`, Caddyfile/Certs/acme-dns-Mounts |

Compose-Stacking (`setup/src/docker.ts`): Base → `docker-compose.proxy(.delivery).yml` wenn `PROXY_ENABLED` + aktiver Mode → optional `proxy-tls(.delivery).yml` → Lab nur bei `TLS_ACME_DIRECTORY=pebble`.

Image: `PRAXIS_FLOW_PROXY_IMAGE` (Delivery: `praxis-flow-proxy:…-acmedns`, sonst Default `caddy:2.11.4`); Delivery `pull_policy: never` (app/sandbox/proxy/gateway) — siehe [`delivery.md`](delivery.md) §3.

### Env (Auszug)

| Variable             | Rolle                                                          |
| -------------------- | -------------------------------------------------------------- |
| `PROXY_ENABLED`      | `true`/`false`                                                 |
| `PROXY_MODE`         | `off` \| `http` \| `tls-managed` \| `tls-custom`               |
| `APP_BIND_ADDRESS`   | mit Proxy `127.0.0.1`, sonst typisch `0.0.0.0`                 |
| `PROXY_HTTP_PORT`    | Host-Port, Default 80                                          |
| `CANONICAL_BASE_URL` | Geräte-/Portal-Basis; nach TLS-Cutover `https://…` ohne `:443` |

Ungültige Kombinationen (z. B. enabled + mode `off`) werden **abgelehnt**, nicht still korrigiert (`assertProxyEnvValid`).

### Manager / Setup-Regeln

- Wizard-Schritt **Zugang**: Proxy optional einschalten. Ohne Proxy → Sprung über HTTPS (§4). Die Checkbox steuert nur UI-Eligibilität (`wizardHttpsEligible`) — **nicht** die Setup-Gate.
- `tls/prepare` (und die weitere TLS-API) verlangt **persistiertes** `PROXY_ENABLED=true` in `.env` (`prepareHostTls`). Geschrieben wird das erst durch Wizard-Apply (Schritt 8) oder `POST /host/network` mit Proxy an — nicht allein durch Anhaken in Schritt 5.
- Praktisch: Bei reiner Erstinstallation ohne vorherigen Proxy-Apply HTTPS im Assistenten oft auf **später** lassen (oder Assistent zu Ende), Proxy mit Apply persistieren, dann HTTPS unter **Netzwerk** (oder erneut im Assistenten, wenn `.env` schon Proxy hat).
- `POST /host/network` setzt bei Proxy-an bewusst `PROXY_MODE=http` — darf einen **aktiven TLS-Mode weder ändern noch auf HTTP zurücksetzen**.
- Während HTTPS-Vorbereitung (`TLS_STATE` vorbereitet): Netzwerk-Save darf den Proxy **nicht abschalten**.
- TLS-Cutover schreibt Mode/`CANONICAL_BASE_URL` über die TLS-Routen (`tls/apply`), nicht über die reine Proxy-Checkbox.

HTTP-Proxy allein ist gültiger Endzustand (ohne Zertifikat). TLS setzt ihn voraus.

## 4. Aktivierungsstrecken (UI)

Zwei Flächen, eine Strecke: **Assistent bereitet vor**, **Netzwerk führt zu Ende** (DNS → Zertifikat → Cutover). Ohne Proxy-Eligibilität (§3) entfällt der HTTPS-Schritt; `tls/prepare` braucht zusätzlich **persistierten** HTTP-Proxy in `.env` (Checkbox allein reicht nicht).

Persistenz ab `prepare`: `GET /host/status` → `tls` (`TlsStatus`). Offenes HTTPS erkennt man **nicht** an `PROXY_MODE` (bleibt `http` bis Cutover).

### 4.1 Assistent — Schritt HTTPS (Badge 6)

Phasen: `offer` → `hostname` → `lease` → `mail` (`HTTPS_PHASES` / `wizard-flow.ts`).

| Phase        | Inhalt                                                                                                                                                                                                                                           |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **offer**    | Jetzt vorbereiten oder **später** → direkt Vorschau (Schritt 7), HTTP-only                                                                                                                                                                       |
| **hostname** | Vorschlag / eigenes Label / eigene Domain (§1); Validierung `tlsNameValid`                                                                                                                                                                       |
| **lease**    | feste IPv4 / DHCP-Reservierung bestätigen; blockiert bei `lanIpStale`                                                                                                                                                                            |
| **mail**     | Beim Eintritt: `prepare` (`tls/prepare`) — ID, lokaler Korrelationswert und Hostname fest. Scheitert, wenn `.env` noch keinen aktiven Proxy hat (§3). Managed: Mail an `cert@notaus.de` bestätigen. Custom: PEM einlesen (`custom-certificate`). |

Danach: Vorschau + Apply des **Stacks noch mit HTTP**-URLs. Hinweis: DNS/Zertifikat/Cutover folgen unter Netzwerk.

Zurück von der Vorschau: wenn TLS schon prepared → wieder Mail-Phase; ohne Proxy-Eligibilität → Zugang (Schritt 5).

Code: `WizardHttpsPanel.svelte`, `buildWizardPrepareTlsInput`, `planHttpsAdvance`.

### 4.2 Netzwerk-Tab — Fortsetzung / Resume / Betrieb

Einstieg auch nachträglich (Status/Wartung verweisen hierher, nicht zurück in den Assistenten). Controller: `tls-network-controller.ts` / `TlsNetworkPanel.svelte`.

**Start von vorn** (TLS noch `off`, Proxy an): ähnliche Kurzstrecke offer → hostname → lease → `prepare`, dann Operator-Records.

**Weiter nach prepare** (typisch `awaiting-operator-dns` …):

| Aktion                          | API                                           | Wirkung                                                                                                                               |
| ------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| DNS prüfen                      | `POST …/tls/verify-dns`                       | A-Record (und CNAME nur managed); Tage warten ist Normalfall                                                                          |
| Zertifikat holen / lokal prüfen | `obtain-certificate` bzw. `check-certificate` | HTTP bleibt; danach lokale Checks (443, Name, h2, …)                                                                                  |
| Auf HTTPS umstellen             | `tls/apply`                                   | Cutover — Canonical/`CANONICAL_BASE_URL` → `https://…`; Geräte neu koppeln                                                            |
| Repair                          | `tls/repair`                                  | bei `state=error`/`degraded` (z. B. ACME/Prepare vor Cutover); State-Graph behalten                                                   |
| Apply erneut                    | `tls/apply`                                   | nach **fehlgeschlagenem Cutover**: Graph bleibt `dns-verified` + `applyReady` + `lastError` — Primäraktion erneut Apply, nicht Repair |
| Abbrechen (vor Cutover)         | `tls/reset`                                   | HTTPS-Strecke zurücknehmen (TLS-Env/`state/tls/` weg)                                                                                 |
| Reset (nach Cutover)            | `tls/reset`                                   | **kein** HTTP-Rollback: Custom wirft; Managed stellt unter gleicher HTTPS-Identität neu aus                                           |
| Erneuern                        | `tls/renew` (managed) bzw. PEM neu (custom)   | nach Cutover / Ablauf                                                                                                                 |

Vor Cutover: Warnung **keine Portweiterleitung 80/443** (sonst ggf. Internet-Expose). Nach erfolgreichem Obtain: lokaler Korrelationswert in der Mail-Wiederholung nicht mehr anzeigen; `applyReady` freigeben.

`POST /host/network` darf aktiven TLS-Mode nicht auf HTTP setzen (§3).

### 4.3 Managed vs. Custom

|                 | Managed (Betreiber-Zone)        | Custom (eigene Domain)             |
| --------------- | ------------------------------- | ---------------------------------- |
| Namensmodus     | `generated` / `label`           | `domain`                           |
| `tls.mode`      | `managed`                       | `custom`                           |
| Nach prepare    | Mail + Staff-A + Wildcard-CNAME | PEM stagen + A bei Domain-Anbieter |
| Nach grünem DNS | `obtain-certificate`            | `check-certificate`                |
| ACME            | ja (DNS-01)                     | nein                               |

Installationsraum und daraus abgeleitete Namen sind nach `prepare` fest —
Label-Wechsel ⇒ neue Strecke / ggf. Reset. Der Managed-Proxy leitet nur den
expliziten Matcher `staff.<raum>` zur App; andere Wildcard-Namen, insbesondere
`portal.<raum>`, werden abgebrochen.

## 5. Setup-API (Vertrag)

Source of Truth: `SETUP_TLS_ROUTES` + `TlsStatus` in `packages/server-shared/src/setup-api.ts`.  
Implementierung: `setup/src/host-tls.ts` (und Proxy-Helfer). Manager ruft nur über IPC auf `127.0.0.1` (eigenes Setup-Child) auf — kein TLS-Setup aus dem Praxis-LAN.

### 5.1 Routen

| Route                              | Zweck                                                                                                         |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| `POST /api/setup/host/tls/prepare` | ID, Korrelationswert und Hostname fest; State auf Disk; Operator-Mail/Records. Gate: persistierter HTTP-Proxy |
| `POST …/tls/verify-dns`            | A-Record (managed + CNAME); custom nur A                                                                      |
| `POST …/tls/obtain-certificate`    | managed: ACME DNS-01                                                                                          |
| `POST …/tls/custom-certificate`    | PEM stagen (vor/bei Custom-Pfad)                                                                              |
| `POST …/tls/check-certificate`     | custom: gestagtes PEM lokal prüfen                                                                            |
| `POST …/tls/apply`                 | Cutover — schreibt u. a. `PROXY_MODE=tls-*`, `CANONICAL_BASE_URL=https://…`. Bei Fail: Retry derselben Route  |
| `POST …/tls/repair`                | `error`/`degraded` → Retry-State (nicht Apply-Fail)                                                           |
| `POST …/tls/reset`                 | vor Cutover: Abbruch; nach Cutover: Custom gesperrt, Managed = Re-Issue gleiche ID                            |
| `POST …/tls/renew`                 | Erneuerung (managed ACME bzw. neuer PEM-Pfad)                                                                 |

`prepare`-Input: `{ mode: managed\|custom, hostname?, lanIp }`. Im Managed-Modus
bedeutet `hostname` den Installationsraum `<label>.<operator-zone>`; leer → Setup
mintet ein 6-Zeichen-Label. Im Custom-Modus bleibt `hostname` der eine FQDN.

### 5.2 `TlsStatus` (in `GET /host/status`)

Kein Token, kein Private Key in der Status-Antwort.

| Feld                          | Bedeutung                                                                                                                         |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `state`                       | `off` \| `preparing` \| `awaiting-operator-dns` \| `dns-verified` \| `obtaining-certificate` \| `active` \| `degraded` \| `error` |
| `mode`                        | `managed` \| `custom` \| `null`                                                                                                   |
| `hostname` / `installationId` | `hostname` bleibt Kompatibilitätsalias für den aktiven Staff-FQDN; ID fest nach prepare                                           |
| `installationDomain`          | managed: `<label>.<operator-zone>`; custom/Legacy: `null`                                                                         |
| `staffHostname`               | managed: `staff.<raum>`; custom: der einzelne FQDN                                                                                |
| `portalHostname`              | managed: reserviertes `portal.<raum>`; noch keine Freigabe                                                                        |
| `wildcardCertificateName`     | managed: einziger ACME-Bestellname `*.<raum>`                                                                                     |
| `tokenConsumed`               | lokaler Korrelationswert nach erfolgreichem Obtain entfernt; keine Aussage über Betreiber-Authentifizierung                       |
| `applyReady`                  | lokale Checks grün — Gate für Cutover, oft bei `state=dns-verified`                                                               |
| `cutoverApplied`              | unterscheidet `error` vor vs. nach Cutover (nicht aus `PROXY_MODE` ableiten)                                                      |
| `certificate`                 | issuer, notBefore/After, names — oder `null`                                                                                      |
| `lastError`                   | `{ class, message }` oder `null`                                                                                                  |
| `acmeCnameTarget`             | öffentliches ACME-DNS-Ziel für Mail (kein Secret)                                                                                 |

**Wichtig:** Bis Cutover bleibt `PROXY_MODE` typisch `http`. Offenes HTTPS nur über `tls.*` erkennen.

### 5.3 Fehlerklassen (`TlsErrorClass`)

`a-record` · `collision` · `dns-filter` · `isolation` · `firewall` · `port-443` · `clock` · `acme` · `cert-name`

UI-Copy: `tlsErrorCopy` in `tls-network-view-model.ts`. Rebind ist vor allem UX-/Diagnosehinweis (Router), keine eigene Error-Class.

### 5.4 Abgrenzung `POST /host/network`

- Darf Proxy an/aus und `http`-Mode setzen, **solange** kein aktiver TLS-Mode und keine HTTPS-Vorbereitung blockiert (§3).
- Darf **nicht** `tls-managed` / `tls-custom` ändern oder auf HTTP zurücksetzen.
- TLS-Cutover und Mode-Wechsel nur über die TLS-Routen oben.

## 6. Compose, Image, State auf dem Host

Ein `proxy`-Service, gestapelte Compose-Dateien. Setup wählt Overlays über `.env` (`resolveComposeFiles` / `resolveComposeFileList` in `setup/src/docker.ts`). Genereller Stacking-Überblick: [`runtime.md`](runtime.md) § Compose (Skelett); Artefakt/Image-Bau: [`delivery.md`](delivery.md) §3.

### 6.1 Dateien

| Schicht             | Dev                                                               | Delivery                                |
| ------------------- | ----------------------------------------------------------------- | --------------------------------------- |
| Base                | `docker-compose.yml`                                              | `docker-compose.delivery.yml`           |
| HTTP-Proxy          | `docker-compose.proxy.yml`                                        | `docker-compose.proxy.delivery.yml`     |
| LAN-TLS             | `docker-compose.proxy-tls.yml`                                    | `docker-compose.proxy-tls.delivery.yml` |
| Lab (nicht Produkt) | `docker-compose.tls-lab.yml` + `docker-compose.tls-lab-proxy.yml` | —                                       |

**Regel:** TLS-Overlay nur **nach** Proxy-Overlay. Lab nur wenn TLS-Overlay an **und** `TLS_ACME_DIRECTORY=pebble` **und** Dev-Compose (nie Delivery). Gateway bleibt orthogonal.

### 6.2 Wann welches Overlay

| Bedingung (`.env`)                                       | Overlay                  |
| -------------------------------------------------------- | ------------------------ |
| `PROXY_ENABLED` aus / Mode `off`                         | nur Base                 |
| Proxy an + Mode `http`/`tls-*`                           | + `proxy`                |
| Mode `tls-managed`/`tls-custom` **oder** `TLS_STATE≠off` | zusätzlich + `proxy-tls` |

Wichtig: `proxy-tls` kommt schon **ab `prepare`** (`TLS_STATE` ≠ `off`), nicht erst beim Cutover. Bis Cutover bleibt `PROXY_MODE` typisch `http`; Port 443 und TLS-Mounts sind dennoch dran. HTTP-only-Betrieb (nie prepared) lädt `proxy-tls` **nicht**.

### 6.3 Image & Ports

|          |                                                                                                                                        |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Image    | `PRAXIS_FLOW_PROXY_IMAGE` — Delivery: `praxis-flow-proxy:…-acmedns` (xcaddy + `dns.providers.acmedns`); Fallback/Legacy `caddy:2.11.4` |
| Delivery | `pull_policy: never` auf app/sandbox/proxy (+ gateway) — kein Registry-Nachzug in der Praxis                                           |
| Port 80  | immer mit Proxy-Overlay (`PROXY_HTTP_PORT`, Default 80)                                                                                |
| Port 443 | nur mit TLS-Overlay (`PROXY_HTTPS_PORT`, Default 443)                                                                                  |

Managed-ACME braucht das Custom-Image. Stock-Caddy reicht für reines HTTP und kann Custom-PEM technisch bedienen; ohne `acmedns`-Modul scheitert managed Obtain.

### 6.4 Persistenz `state/tls/` (Install-Home)

Pfade: `resolveProxyTlsPaths` → `{installHome}/state/tls/`. **Nicht** in Git, **nicht** im `.pfbackup` v1 (§8).

| Pfad                                           | Inhalt                                                                                                                                                   |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Caddyfile`                                    | generiert (`writeGeneratedTlsCaddyfile`, Marker `# PRAXIS-FLOW-GENERATED LAN-TLS v2`) — ersetzt den Stock-`proxy/Caddyfile`-Mount, sobald Overlay an ist |
| `caddy-data/`, `caddy-config/`                 | Caddy ACME/Storage (`/data`, `/config`)                                                                                                                  |
| `acme-dns.json`                                | ACME-DNS-Credentials (managed); Custom: leeres `{}` damit Docker die Datei nicht als Dir anlegt                                                          |
| `certs/fullchain.pem`, `certs/private-key.pem` | Custom-PEM                                                                                                                                               |
| `operator-token`                               | lokaler Mail-Korrelationswert (managed), Mode `0600`; derzeit nicht extern verifiziert                                                                   |

Compose bind-mountet über Host-Pfad-Env (`PROXY_CADDY_*_HOST_PATH`, `PROXY_ACME_DNS_CREDENTIALS_HOST_PATH`, `PROXY_CERTS_HOST_PATH`) — gesetzt bei `prepare` (`buildProxyTlsEnvUpdates`). Fehlende `:?`-Pfade → Compose startet nicht. Bereits gemountete Einzeldateien werden beim Umschalten und Erneuern inode-erhaltend überschrieben; ein Rename würde im laufenden Container am alten Dateiinhalt hängen bleiben.

### 6.5 Generiertes Caddyfile (Verhalten)

Vor Cutover: `:80` → `app:8080`; HTTPS-Block mit TLS (ACME DNS-01 bzw. PEM) + lokaler Check-Pfad `/__praxis-flow/setup/tls-sse`.
Nach Cutover: `:80` → **301** auf den Staff-FQDN; App nur noch über 443.
Managed ist der Caddy-Site-Name ausschließlich `*.<raum>`, damit keine zweite
Exact-Name-Order entsteht. Ein expliziter Host-Matcher leitet nur
`staff.<raum>` zur App; der Fallback `abort` hält `portal.<raum>` und unbekannte
Wildcard-Namen geschlossen. Custom/Legacy bleibt ein Exact-FQDN.

TLS-Status-Felder und Mode liegen parallel in `.env` (`TLS_*`, siehe §5). Overlay-Auswahl liest `TLS_STATE` / `PROXY_MODE`; Secrets liegen auf Disk unter `state/tls/`, nicht in der Status-API.

### 6.6 Fallstricke

| Symptom                                        | Ursache                                                                                                       |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Port 443 zu, obwohl prepared                   | Overlay fehlt / Compose ohne `proxy-tls` neu gestartet; `TLS_STATE`/`PROXY_*_HOST_PATH` prüfen                |
| Managed Obtain: unknown module `acmedns`       | falsches Image (Stock-Caddy statt `…-acmedns`)                                                                |
| Docker legt `acme-dns.json` als Verzeichnis an | Datei fehlte vor dem ersten `up` — Setup legt leeres JSON an; manuell nicht löschen ohne Ersatzdatei          |
| Delivery pull-Fehler für Proxy                 | erwartet bei `pull_policy: never` ohne geladenes Image — Image aus Paket laden ([`delivery.md`](delivery.md)) |

## 7. Nach dem Cutover (Betrieb)

Nach erfolgreichem `tls/apply` ist HTTPS die Geräte-Identität. Fläche: **Netzwerk** (Status/Wartung verweisen hierher). Unwiderruflich am Cutover: Canonical, Cookies/Pairing, Port-80-Redirect — kein HTTP-Rollback (§4.2 Reset).

### 7.1 Was sich ändert

| Vorher (HTTP)                 | Nachher                                                                     |
| ----------------------------- | --------------------------------------------------------------------------- |
| `CANONICAL_BASE_URL=http://…` | managed `https://staff.<raum>`; custom `https://{hostname}` **ohne** `:443` |
| `PROXY_MODE=http`             | `tls-managed` oder `tls-custom`                                             |
| `:80` → App                   | `:80` → **301** auf den aktiven Staff-FQDN                                  |
| Geräte-/Portal-URLs HTTP      | Staff-FQDN (Portal-Vorschau weiter intern unter `/portal`)                  |
| App im LAN ggf. `:8080`       | App nur Loopback hinter Proxy — Geräte nicht auf 8080                       |

`TRUST_PROXY_HEADERS=true` nach Cutover. Sessions und Pairing sind ungültig (host-only Cookies, `SameSite=Strict`) — Terminal/TV/MFA **neu koppeln**, Browser-URLs aktualisieren.

Karte im Manager: Hostname, Installations-ID, Aussteller, Ablauf — **kein** Token. Warnung gegen Portweiterleitung 80/443 bleibt sinnvoll, solange das Zertifikat existiert.

### 7.2 Erneuerung

Caddy renewt managed-Zertifikate im Normalfall **selbst**. Praxis Flow setzt kein eigenes Intervall: Caddy-Default ≈ Erneuerung bei **⅓ Restlaufzeit** (Let's Encrypt typisch ~90 Tage → ca. **30 Tage vor Ablauf**; CA-ARI kann das Fenster verschieben). Die Manager-UI warnt später (`TLS_EXPIRY_SOON_DAYS = 21`) — im Happy Path greift Auto-Renew oft schon vor der Warnung. `tls/renew` ist expliziter Fallback.

| Lage                        | typ. `tls.state` | Aktion                                                       |
| --------------------------- | ---------------- | ------------------------------------------------------------ |
| gültig, Ablauf > 21 Tage    | `active`         | Ruhe (Caddy kann bereits im ~30-Tage-Fenster renewen)        |
| bald abgelaufen (≤ 21 Tage) | oft `degraded`   | Warnung + `tls/renew` („Jetzt erneuern“)                     |
| abgelaufen / Renew tot      | `error`          | sofort `renew`                                               |
| Custom PEM                  | —                | neues PEM über `renew` (kein Let's Encrypt, kein Auto-Renew) |

`renew` ist **kein** zweites Cutover — Canonical bleibt `https://`. Nach Cutover: Custom-`reset` gesperrt; Managed-`reset` = Re-Issue unter gleicher ID (§4.2). `repair` bei `error`/`degraded` (State behalten); Apply-Fail vor Cutover bleibt §4.2.

### 7.3 Typische Störungen

UI-Copy: `tlsErrorCopy` (`tls-network-view-model.ts`). Rebind (Router filtert private A-Ziele) ist Diagnosehinweis an Praxis-IT, **keine** eigene `TlsErrorClass`.

| Klasse       | Bedeutung                                      | typ. Maßnahme                                         |
| ------------ | ---------------------------------------------- | ----------------------------------------------------- |
| `a-record`   | A-Record fehlt / zeigt nicht auf LAN-IP        | warten / Eintrag setzen                               |
| `collision`  | A zeigt auf **andere** IP                      | Label/Mail prüfen                                     |
| `dns-filter` | öffentlicher Resolver filtert private Ziel-IP  | Filter/Resolver in der Praxis                         |
| `isolation`  | Client erreicht Server nicht (z. B. Gast-WLAN) | LAN: TCP 443 zum Host                                 |
| `firewall`   | Port 443 am Host nicht erreichbar              | Host-Firewall (z. B. Windows) für Caddy               |
| `port-443`   | Port belegt                                    | anderen Dienst beenden                                |
| `clock`      | Host-Uhr von CA abgelehnt                      | Zeit sync                                             |
| `acme`       | Ausstellung/Challenge/Rate-Limit               | `repair`/`renew`; Korrelationswert nicht neu erzeugen |
| `cert-name`  | SAN ≠ Hostname                                 | vor Cutover: retry/`reset`; nach Cutover: `renew`     |

LAN-IP veraltet bei noch gültigem Cert: oft `degraded` — IP korrigieren bzw. Operator-Mail **ohne** neuen Korrelationswert (Delegation bleibt); Details UI Netzwerk.

### 7.4 Fallstricke

| Symptom                                    | Hinweis                                               |
| ------------------------------------------ | ----------------------------------------------------- |
| Geräte noch auf alter HTTP-URL             | erwartet nach Cutover — neu pairen / Canonical folgen |
| HTTP:80 „funktioniert“ noch                | nur Redirect; Geräte-URL ist HTTPS                    |
| `error` nach Cutover, Canonical noch HTTPS | richtig — kein Rollback; `renew`/`repair`             |
| Manuell `PROXY_MODE=http` in `.env`        | verboten / bricht Gate — nur TLS-API                  |

## 8. Backup & Restore

Kurz die TLS-Grenze; Tiefe (Export-Allowlist, Cutover mit Update, Manager-Wizard): [`backup.md`](backup.md). Code: `packages/server-shared/src/tls-backup.ts`, `setup/src/tls-backup-sidecar.ts`.

### 8.1 Zwei Artefakte

| Artefakt                                  | Enthält TLS?                                                                                               | Wann                                                        |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `.pfbackup`                               | **keinen** Caddy-/ACME-/PEM-State unter `state/tls/`                                                       | immer Settings-Backup                                       |
| Sidecar `praxis-flow-tls-<timestamp>.tgz` | `caddy-data/`, `caddy-config/`, `acme-dns.json`, `certs/`, plus Manifest v2 mit ID und TLS-Namensidentität | sobald `tls.state ≠ off` (ab `prepare`, nicht erst Cutover) |

`.pfbackup` kann trotzdem nicht-geheime Marker tragen (`TLS_STATE`,
`TLS_HOSTNAME`, `TLS_INSTALLATION_ID` und bei Managed die vier Felder für Raum,
Staff, Portal und Wildcard) und nach Cutover `PROXY_MODE=tls-*` /
`CANONICAL_BASE_URL=https://…`. Generiertes Caddyfile und `operator-token` sind
**nicht** im Sidecar — nach Restore regeneriert Setup den Laufzeitzustand; der
lokale Mail-Korrelationswert wird nicht restauriert. Sidecar-Manifeste v1
bleiben lesbar; neue Sicherungen schreiben v2.

Gleicher Timestamp wie die `.pfbackup`-Datei; Ablage im selben Backup-Ordner. Electron-Main findet Geschwisterdatei bzw. zweiten Dateidialog; Setup bekommt nur `tlsSidecarBase64` — **keinen** Host-Pfad.

### 8.2 Inspect / Restore-Gate

„Backup beansprucht aktives HTTPS“ = `CANONICAL_BASE_URL` beginnt mit `https://` **oder** `PROXY_MODE` ist `tls-*` — **nicht** allein `TLS_STATE` (`tlsInBackup`).

| Lage                                                                       | Restore                                                                       |
| -------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| aktives HTTPS, Sidecar fehlt oder TLS-Namensidentität stimmt nicht überein | **abgelehnt** (`restoreSupported = false`) — sonst Geräte auf https ohne Cert |
| nur vorbereitet (`TLS_STATE` prepared, Canonical noch HTTP), Sidecar fehlt | **erlaubt** mit Warnung; Vorbereitung wird verworfen (`off`), HTTP bleibt     |
| Metadaten widersprüchlich (z. B. `active` ohne HTTPS-Canonical)            | **abgelehnt**                                                                 |

Match: `installationId` + Staff-Kompatibilitätshostname müssen übereinstimmen
und nicht leer sein. Sobald Managed-v2-Felder vorhanden sind, müssen außerdem
Installationsraum, Staff-, Portal- und Wildcard-Name vollständig übereinstimmen.

### 8.3 v2

TLS im **selben** Archiv = Format-Bump — nur Plan [`../plan-backup-v2.md`](../plan-backup-v2.md), hier nicht spezifizieren.

## 9. Nicht Produkt / Lab

Produkt-Stack enthält **nie** Pebble / Lab-acme-dns / CoreDNS (`COMPOSE_TLS_LAB_SERVICES`). Lab nur Dev:

- Env: `TLS_ACME_DIRECTORY=pebble` (+ typ. Lab-URLs)
- Compose: `docker-compose.tls-lab.yml` + `docker-compose.tls-lab-proxy.yml` — nur non-Delivery und nur wenn TLS-Overlay an (§6)
- Doku/Smokes: [`../archive/tls-lab.md`](../archive/tls-lab.md),
  `scripts/smoke-tls-managed.mjs` und `scripts/smoke-tls-cutover.mjs`. Beide
  prüfen genau eine Pebble-Order und als einzigen Zertifikatsnamen `*.<raum>`.
  Die Lab-Zone enthält nur den Staff-A-Record und
  `_acme-challenge.<raum>` als CNAME; `portal.<raum>` hat keinen A-Record.
  Der Portal-SNI muss trotzdem den Wildcard-TLS-Handshake schaffen und wird
  anschließend ohne HTTP-Antwort abgebrochen.

Gateway/Captive/Internet-Portal sind **andere** Themen → [`integrations.md`](integrations.md), nicht LAN-TLS.

## 10. Abgrenzung zu Plänen

| Dokument                                                                                       | Rolle                                                         |
| ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| **Dieses** (`operations/tls.md`)                                                               | **Ops-Ist** — was Betreiber/Support/Entwickler heute brauchen |
| [`../plan-proxy-tls.md`](../plan-proxy-tls.md)                                                 | Architektur-/Zielhistorie (ACME, Compose, State-Maschine)     |
| [`../plan-proxy-tls-manager.md`](../plan-proxy-tls-manager.md)                                 | Manager-UX-Historie                                           |
| [`../archive/plan-manager-https.md`](../archive/plan-manager-https.md)                         | HTTPS-UI-Aufräumen (erledigt; Gates in Manager-View-Model)    |
| [`../plan-portal-lan-isolation.md`](../plan-portal-lan-isolation.md)                           | Zukunft: Staff-/Portal-Origin und Wildcard-Zertifikat         |
| [`../plan-manager-restricted-network-access.md`](../plan-manager-restricted-network-access.md) | Zukunft: zusätzliche eingeschränkte Host-IP im Manager        |
| [`../archive/tls-lab.md`](../archive/tls-lab.md)                                               | Lab, nicht Produkt                                            |
| [`../plan-backup-v2.md`](../plan-backup-v2.md)                                                 | Backup-Format v2 — **nicht** hier fortschreiben               |

Wenn Ist und Plan kollidieren: **Code + dieses Dokument**. Pläne nach und nach auf „übernommen / archivieren“ setzen, nicht parallel als zweite Ops-Wahrheit pflegen.
