# Plan: TLS, HTTP/2 und Internet-Portal

Stand: 2026-08-24

Status: **Zielbild mit beschlossenem LAN-TLS-Pilot, nicht Teil des laufenden Kunden-Tests.**
HTTP-Proxy auf Port 80 ist Ist — Betrieb in [`delivery.md`](delivery.md) und
[`deployment-docker.md`](deployment-docker.md). Historie:
[`archive/plan-proxy-container.md`](archive/plan-proxy-container.md).

TLS erweitert denselben `proxy`-Service, dieselbe Setup-/Manager-Strecke und denselben
Delivery-Vertrag. Es ist kein paralleles System.

## Ausgangslage

Der optionale Caddy-Proxy nimmt HTTP auf Port 80 entgegen und leitet auf `app:8080`.
`CANONICAL_BASE_URL` ist die Basis für Geräte- und Portal-URLs. Mit aktivem Proxy ist
App-Port 8080 nur noch auf Host-Loopback. Sandbox bleibt intern. TLS, Port 443 und ein
öffentliches Portal fehlen.

Heutige harte Grenzen im Code (P2a), die TLS bewusst aufbrechen muss:

- `PROXY_MODE` nur `off | http`; `tls-*` wird abgelehnt
- Overlay publiziert `0.0.0.0:80`, ohne `/data`, ohne 443
- `proxy/Caddyfile` ist `:80 { reverse_proxy app:8080 }` und wird bei Update nicht
  überschrieben
- Delivery pinnt `images.proxy` auf `caddy:2.11.4`
- Manager: Checkbox „Port 80“; Reachability schreibt immer `http://`
- `TRUST_PROXY_HEADERS` existiert, steht nicht in Compose
- `.pfbackup` enthält Settings und `.env`, keinen Caddy-/ACME-State

```text
Ist:   Browser ── HTTP/1.1 ──> proxy:80  ── HTTP/1.1 ──> app:8080
Ziel:  Browser ── HTTPS/h2 ───> proxy:443 ─ HTTP/1.1 ──> app:8080
```

TLS ist Vertraulichkeit und löst ein Echtzeitproblem: Browser begrenzen lang laufende
HTTP/1.1-Verbindungen pro Origin typischerweise auf wenige. SSE belegt jede Verbindung
dauerhaft; MFA hält Queue- und Ops-Stream parallel (fetch-SSE). Mehrere Tabs blockieren
dann REST. Browser nutzen HTTP/2 praktisch nur über HTTPS; `h2c` ist kein Produktweg.

HTTP/2 behebt das **Transportlimit**. Ein app-seitiges Connection-Budget (Tab-Koordination,
Reconnect-Jitter) bleibt ein separates Thema — [`todo.md`](../todo.md),
[`archive/plan-auth-session-slots.md`](archive/plan-auth-session-slots.md).

Caddy terminiert TLS und handelt `h2` aus. Der Hop `proxy → app` bleibt HTTP/1.1.
Caddy flusht `text/event-stream` ohne Extra-SSE-Konfiguration.

## Ziel

Zwei Ebenen, ein Proxy-Container, zwei getrennte Umsetzungsphasen:

| Ebene          | Erreichbarkeit                                   | TLS               | Regel                                      |
| -------------- | ------------------------------------------------ | ----------------- | ------------------------------------------ |
| **Praxis-LAN** | Terminal, MFA, TV, Ops, Raum-Panel, Portal       | HTTPS             | voller Reverse-Proxy; `CANONICAL_BASE_URL` |
| **Internet**   | nur Portal (+ explizite Portal-APIs und -Assets) | **HTTPS Pflicht** | eigener VHost, Allow-Liste, kein MFA/Ops/… |

Die App bleibt ohne TLS-Code. Der Proxy übernimmt Zertifikate, Redirects und HTTP/2.
Bei aktivem TLS ist `CANONICAL_BASE_URL` immer `https://<hostname>` ohne Port 443.

LAN-TLS veröffentlicht nicht die gesamte App ins Internet. Das ist eine **technische**
Vorgabe (Bindung, kein öffentlicher A-Record, Manager-Warnung), nicht nur eine Bitte.

## TLS-Wege

1. **Ohne TLS** — vorhandener HTTP-Proxy (`PROXY_MODE=http`) für Entwicklung oder
   begrenzten Test.
2. **Eigenes Zertifikat** (`tls-custom`) — Praxis-IT liefert Hostname, PEM-Fullchain und
   Private Key. Erneuerung liegt bei der Praxis-IT. Vertrag ist PEM; PFX ist nicht v1.
3. **Managed TLS** (`tls-managed`) — Anbieter-Subdomain, Let's Encrypt über DNS-01,
   automatische Erneuerung.

Managed TLS ist der empfohlene Produktweg. Custom-TLS bleibt IT-Option.

Alle drei Wege nutzen **dasselbe gepinnte Caddy-Image mit `dns.providers.acmedns`**.
Kein zweites Stock-Image im Delivery-Vertrag. Das Plugin bleibt bei HTTP und Custom-TLS
ungenutzt.

## Nicht-Ziele

- Kein Gateway-/Captive-Ersatz
- Kein Kubernetes oder Service-Mesh
- Keine TLS-Logik im App-Container
- Kein Zwang, lokale Entwicklung über Port 443 zu fahren
- Kein öffentliches Exposing der gesamten App
- Kein TLS zwischen `app` und `sandbox`; der Hop bleibt Docker-intern
- Kein paralleles Hostname-Feld in der Netzwerk-Reachability; TLS-Hostname kommt aus dem Praxisnamen
- Keine freie Hostname-Wahl als Happy Path
- Kein Hineinstecken der TLS-State-Machine in `POST /host/network`
- Kein eigener ACME-DNS-Dienst im LAN-TLS-Pilot — Self-Hosting ist Produkthärtung danach

## Beschlossene Managed-TLS-Architektur

### Einmalige DNS-Delegation

Die kostenpflichtige DNS-API des Domainproviders ist nicht erforderlich. Pro Praxis ein
fester CNAME:

```text
_acme-challenge.<praxis>.<anbieter-domain>
  CNAME <installations-id>.<acme-dns-zone>
```

Der CNAME bleibt über Ausstellungen und Renewals gleich. Caddy ändert mit einem eng
begrenzten ACME-DNS-Credential nur den TXT-Wert unter dem delegierten Ziel.

Let's Encrypt bleibt die CA. ACME-DNS stellt keine Zertifikate aus. Der Betreiber des
ACME-DNS-Dienstes ist eine Vertrauensstelle. Der LAN-TLS-Pilot nutzt `auth.acme-dns.io`.
Self-Hosting (eigene oder professionell betriebene Instanz) kommt später in der
Produkthärtung; Server-URL und Zone bleiben ausgelieferte Produktkonfiguration, damit
der Wechsel kein neues Protokoll braucht.

Caddy pinnt Let's Encrypt (kein ZeroSSL-Fallback). DNS-01 deaktiviert HTTP-01 und
TLS-ALPN — Port 80/443 müssen dafür nicht öffentlich erreichbar sein. Caddy braucht
**Outbound** zu Let's Encrypt und zum ACME-DNS-Server.

### Trennung von Zertifikat und LAN-IP

```text
Zertifikatsrecht:
  _acme-challenge.seidel.notaus.de → fester ACME-DNS-CNAME

Lokale Erreichbarkeit:
  seidel.notaus.de → aktuelle LAN-IP (Pilot: 127.0.0.1 per Hosts)
```

Das Zertifikat gilt für den Hostnamen, unabhängig von der LAN-IP. Bei IP-Wechsel bleiben
CNAME, Credential und Zertifikat. Nur die lokale Namensauflösung ändert sich. Empfohlen:
DHCP-Reservierung.

Kein öffentlicher A-Record auf eine private LAN-IP. Pilot: Hosts-Datei. Produktiv: lokaler
DNS (Fritzbox, AD, …). Der Manager zeigt die Anweisung für die erkannte LAN-IP, ändert
aber keine fremde DNS-Infrastruktur.

### Hostname aus dem Praxisnamen

Der TLS-Hostname wird aus dem vergebenen Praxisnamen abgeleitet, nicht frei gewählt und
nicht aus der LAN-Reachability (Maschinenname / Custom-Host). Beispiel: Anzeigename
„Seidel“ → `seidel.notaus.de`. `CANONICAL_BASE_URL` bleibt die Wahrheit nach dem Cutover.

Die genaue Slug-Normalisierung (Umlaute, Leerzeichen, führendes „Praxis“) wird bei der
Implementierung festgelegt. Der abgeleitete Name wird bei der TLS-Aktivierung
festgeschrieben; ein späterer Wechsel des Anzeigenamens ändert den Hostnamen nicht.

**Happy Path:** Manager zeigt den abgeleiteten Hostnamen nur lesend. Kein Hostname-Feld.

**Kollision (Fehlerweg):** **DNS prüfen** stellt fest, dass der Name schon vergeben ist
(bestehende Delegation, fremder CNAME, Anbieter lehnt ab). Dann muss die Praxis einen
**anderen Hostnamen** setzen. Das ist Fehlerbehandlung, kein zweiter Happy Path.

Nach erfolgreicher Aktivierung bleibt der (ggf. abweichende) Hostname die Identität dieser
Installation.

## Setup-API: eigene TLS-Strecke

`POST /api/setup/host/network` bleibt LAN-IP, Gateway und HTTP-Proxy. TLS bekommt eigene
Endpunkte, weil der Ablauf eine State-Machine ist, kein einzelner Save:

```text
prepare → (Credential + CNAME-Anweisung)
verify-dns → (exakter CNAME)
apply → (Caddyfile rendern, Proxy starten, Zertifikat + h2 prüfen)
status
repair → (idempotent: State behalten, Container ggf. neu)
reset-tls → (getrennte, warnende Wartung — löscht State)
```

Wire-Werte (Richtung, Schema folgt bei Implementierung): abgeleiteter Hostname,
optionaler Override nur im Kollisionsfall, ACME-Kontakt-E-Mail, Modus
`tls-custom | tls-managed`, optional Custom-Zertifikatpfade.

Gerenderte Host-Env, ein Enum:

```text
PROXY_MODE=off | http | tls-custom | tls-managed
PROXY_HTTP_PORT=80
PROXY_HTTPS_PORT=443
PROXY_BIND_ADDRESS=<127.0.0.1 | LAN-IP>
TLS_ACME_DIRECTORY=production | staging | pebble
```

Kein zweites `TLS_MODE` / `TLS_CERT_SOURCE`. ACME-Secrets nicht in App-DB, nicht in der
gerenderten Caddyfile, nicht im normalen `.env`.

## Aktivierungsablauf (Managed TLS)

1. Praxis wählt Managed TLS. Der Hostname wird aus dem Praxisnamen abgeleitet und
   angezeigt, nicht eingegeben.
2. Setup registriert genau einen ACME-DNS-Account für diese Installation.
3. Manager zeigt eine kopierbare **TLS-Aktivierungsanfrage** (Hostname, CNAME-Name,
   CNAME-Ziel, Installations-ID).
4. Praxis übermittelt das an den Anbieter; der trägt den CNAME einmalig ein.
5. **DNS prüfen** — Setup prüft, dass der Name frei bzw. die Delegation genau zu diesem
   Credential gehört. Kollision → Fehler, anderer Hostname, zurück zu Schritt 3.
6. Manager zeigt die lokale DNS-/Hosts-Anweisung für die erkannte Ziel-IP.
7. Erst nach erfolgreicher Verifikation rendert Setup die Caddy-Konfiguration, startet
   den TLS-Proxy und prüft Zertifikat sowie HTTP/2.
8. Manager führt den **Origin-Cutover** explizit aus: `CANONICAL_BASE_URL` auf
   `https://<hostname>`, Geräteliste inkl. Raum-Panel, Hinweis auf Neu-Anmeldung und
   erneutes Pairing.
9. Caddy erneuert danach automatisch.

Zustände:

```text
off → preparing → awaiting-provider-dns → dns-verified
    → provisioning → active
                    ↘ degraded / error → retry
```

UI zeigt Geheimnisse nicht dauerhaft. Nach Registrierung: Hostname, CNAME-Anweisung,
Status, Aussteller, Ablaufdatum.

## Origin-Cutover

Cookies sind host-only und `SameSite=Strict`. Wechsel von `http://<ip>` oder Port 80 auf
`https://<hostname>` invalidiert Staff-, Geräte- und Raum-Panel-Sessions.

Das ist ein geplanter Schritt, kein Nebeneffekt: neue kanonische URLs, QR-Codes, Hinweis
zum erneuten Koppeln. `DeviceUrls` nimmt Raum-Panel auf.

Gateway-Lab-URLs (`APP_PORTAL_URL` u. a.) folgen demselben kanonischen HTTPS-Origin,
falls Gateway aktiv ist. Captive bleibt LAN-Thema, nicht Internet-Whitelist.

## Proxy-Runtime

### Bindung

Heute: `'${PROXY_HTTP_PORT:-80}:80'` → alle Interfaces.

Ziel: Proxy-Ports an `PROXY_BIND_ADDRESS` (Loopback im Laptop-Pilot, sonst konfigurierte
LAN-IP), nicht an eine öffentliche Host-NIC.

Das verhindert Exposing über eine zweite, öffentliche Schnittstelle. Es verhindert
**nicht** eine Router-Portweiterleitung auf die LAN-IP. Deshalb zusätzlich:

- kein öffentlicher A-Record auf die LAN-IP
- Manager-Warnung: gültiges LE-Zertifikat + Weiterleitung 443 = ganze App im Internet
- Internet-VHost mit Allow-Liste **bevor** irgendwer 443 weiterleitet

`remote_ip` im Container ist unter Docker Desktop unzuverlässig (NAT) und keine
alleinige Kontrolle.

### Caddyfile

Setup rendert die Caddyfile. Markierung im Dateikopf, dass sie generiert ist. Apply,
Repair und Update dürfen generierte Dateien ersetzen. Eine handeditierte Caddyfile ist
eine warnende IT-Abweichung, nicht der Normalweg.

Bei TLS: Named Site (Hostname, nicht `:80`), HTTP→HTTPS auf Port 80, DNS-01 für Managed,
Datei-Zertifikat für Custom. HTTP/3 aus (LAN-Pilot). Pilot ohne HSTS oder mit kurzem
`max-age`; Produktion darf HSTS.

Credential-Datei als Bind-Mount, nicht inline in der Caddyfile. Plugin-JSON gegen die gepinnte Plugin-Version von `caddy-dns/acmedns` prüfen.

### Compose (Ziel, derselbe `proxy`-Service)

```yaml
ports:
  - '${PROXY_BIND_ADDRESS}:${PROXY_HTTP_PORT:-80}:80'
  - '${PROXY_BIND_ADDRESS}:${PROXY_HTTPS_PORT:-443}:443'
volumes:
  - ${PROXY_CADDY_DATA_HOST_PATH}:/data
  - ${PROXY_CADDY_CONFIG_HOST_PATH}:/config
  - ${PROXY_CADDYFILE_HOST_PATH}:/etc/caddy/Caddyfile:ro
  - ${PROXY_ACME_DNS_CREDENTIALS_HOST_PATH}:/run/secrets/acme-dns.json:ro
  - ${PROXY_CERTS_HOST_PATH}:/certs:ro
```

`/data` und `/config` überleben Container-Neubau, Update und Repair. Ohne diese Volumes
ist Managed TLS nicht idempotent.

Delivery: ein Image-Pin (nicht mehr zwingend Docker-Hub `caddy:2.11.4`). `.pfupdate`
validiert gegen diese Referenz. xcaddy-Build, SBOM und Offline-`docker save` gehören in
den bestehenden Release-Pfad.

### Forwarded-Header und Cookies

`TRUST_PROXY_HEADERS=true` als globaler Schalter reicht nicht und wird nicht so
verdrahtet. Die App vertraut `X-Forwarded-*` nur von der Proxy-Quelle (Netz/Peer oder
Proxy-Secret-Header). Sandbox erreicht `app:8080` intern und darf Proto/Host nicht
spoofen.

Compose setzt die App-Konfiguration dafür, sobald ein Proxy aktiv ist. Bei erkanntem
HTTPS setzen Session-Cookies `Secure`.

TLS-Apply blockiert, wenn Sandbox ins LAN/Public zeigt oder über den Proxy erreichbar
wäre.

## Backup und Restore

Backup umfasst Konfiguration, ACME-Credential, Custom-Zertifikate und Caddy-/ACME-State
(`/data`, `/config`). Restore darf keine Neuregistrierung auslösen.

Install-Home auf Windows (Produktziel): restriktive ACLs statt Unix-`chmod 0600`. Logs
und Manager-Fehlertexte geben kein ACME-Passwort, keinen Private Key und keine
Credential-Datei aus.

Repair:

```text
gültiges Zertifikat + gültiges Credential + gültiger CNAME
  → Konfiguration wiederverwenden
  → Container bei Bedarf neu starten
  → kein Löschen, keine Neuregistrierung
```

Bewusstes Löschen von Zertifikat, ACME-Account oder Caddy-State ist `reset-tls`, nicht
der normale Manager-Reset.

## Pilot auf dem Entwickler-Laptop

Hostname: `seidel.notaus.de`.

- `notaus.de` bleibt beim vorhandenen DNS-Provider; keine kostenpflichtige DNS-API.
- `auth.acme-dns.io` nur für diesen Pilot.
- Zuerst Credential und CNAME-Ziel, danach erst Record beim Provider.
- Namensauflösung: zuerst `127.0.0.1`, später LAN-IP. DoH/Hosts und Local-Network-Access
  des Browsers sind Pilot-Risiken, keine Produktfeatures.
- CAA von `notaus.de` vor der ersten Ausstellung prüfen.
- Keine Portweiterleitung 80/443 aus dem Internet.
- Caddy-State nach erfolgreicher Ausstellung behalten.
- Uhrzeit am Host stimmt (ACME/Zertifikat).
- Outbound aus Docker zu Let's Encrypt und ACME-DNS.

Erfolg:

- Browser öffnet `https://seidel.notaus.de` ohne Zertifikatswarnung
- tatsächlich `h2`
- mehrere SSE-Streams und MFA-Tabs nicht am HTTP/1.1-Limit
- Neustart, Re-Apply, Repair behalten Zertifikat und Credential
- simulierter Renewal-/DNS-Fehler ist im Manager sichtbar und heilbar
- Origin-Cutover ist nachvollziehbar (alte Sessions tot, neue URLs stimmen)

## Wiederholbare Tests

Keine fortlaufenden produktiven Let's-Encrypt-Zertifikate in der Manager-Entwicklung.

1. **Unit- und UI-Tests ohne Netzwerk** (zuerst): Registrierung, CNAME-Fälle,
   Hostname-Ableitung, Kollision/Override, Provisioning/Active/Degraded, HTTPS-/h2-Probe,
   Repair ohne State-Verlust, Cutover-URLs, Forwarded-Header nicht spoofbar.
2. **Pebble + Test-DNS**, sobald Caddy wirklich startet: Ablauf
   `Manager → Setup → Caddy → DNS-01 → ACME` ohne öffentliche CA. Nicht Schritt 1 der
   Umsetzung.
3. **Let's-Encrypt-Staging** — wenige manuelle Systemtests vor Releases, nicht CI.
4. **Produktive Abnahme** — ein dauerhaftes Zertifikat für `seidel.notaus.de`.

## Internet-Portal (eigene Phase, nach LAN-TLS)

Nicht im LAN-Pilot. Öffentlicher VHost erst, wenn die Allow-Liste steht.

Kein Prefix `/api` und kein pauschales Verbot `/api/v1/ops/*` als Ersatz für eine Liste. Die
App-ACL macht u. a. `/api/v1/auth/login` und Pairing öffentlich — das darf nicht ins
Internet. Captive-Authorize ist LAN-WLAN, kein Internet-Pfad.

Orientierung am heutigen Portal-Ist (vor Implementierung gegen OpenAPI und UI prüfen):

- UI: `/portal`, `/portal/*`
- SPA-Assets der Portal-Oberfläche (typisch `/_app/*`); nicht der Fallback für `/mfa`,
  `/terminal`, `/tv`, `/ops`, `/room-panel`
- APIs mindestens: Sessions (`resolve-ticket`, `me`, `submit`), Patient-Documents
  (intake, list, delete, form-templates, forms, privacy-notice),
  `GET /api/v1/practice/profile`, `GET /api/v1/ops/patient-locales`

Nicht öffentlich: `/mfa`, `/terminal`, `/tv`, `/ops` (UI), `/room-panel`, Auth-Login,
Pairing, Queue, restliches `/api/v1/ops/*`.

Hostname-Modell (gleicher Name mit Split-Horizon vs. eigener öffentlicher Name) ist
offen; LAN-TLS legt `seidel.notaus.de` nicht stillschweigend als Internet-Name fest.

## Sicherheit (kurz)

- Proxy routet nur zur App, nie zur Sandbox
- Forwarded-Header nur von der Proxy-Quelle
- Secure-Cookies bei HTTPS
- ACME-DNS-Credential ändert nur den delegierten TXT-Record
- keine Provider-DNS-Zugangsdaten auf dem Praxisserver
- `auth.acme-dns.io` nur Pilot
- gültiges öffentliches Zertifikat ohne Internet-VHost ist bewusst LAN-only; Port-Forward
  wäre ein Produktunfall

## Umsetzungsreihenfolge

1. **Vertrag und Fakes:** Zustandsmodell, Setup-Wire, Canonical-HTTPS, Cutover-URLs,
   Forwarded-Header-Tests — ohne Pebble.
2. **Setup-API:** eigene TLS-Endpunkte, Prepare/Verify/Apply/Status/Repair.
3. **Manager:** eigene TLS-Strecke; Hostname aus Praxisnamen, Override nur bei Kollision;
   nicht die Port-80-Checkbox und nicht die LAN-Reachability als Namensquelle.
4. **Proxy-Runtime:** ein Plugin-Image, 443, Bind-Adresse, persistenter State, generiertes
   Caddyfile, Secure Cookies.
5. **Pebble-Integration,** sobald Schritt 4 startet.
6. **Pilot:** `seidel.notaus.de`, echtes Zertifikat, h2/SSE, Cutover.
7. **Produkthärtung:** Self-Hosting ACME-DNS, Backup/Restore inkl. Caddy-State,
   Ablaufmonitoring, Delivery/Update, HSTS.
8. **Internet-Portal:** öffentlicher VHost mit expliziter Allow-Liste.

## Offene Entscheidungen

1. Nach dem Pilot: Wer betreibt den produktiven ACME-DNS-Dienst (Self-Hosting), unter
   welcher Zone, mit welchem Backup-/Monitoring-SLA?
2. Wie wird lokale DNS-Auflösung in typischen Praxisnetzen bereitgestellt und vom
   Manager geprüft (Fritzbox, AD, Hosts nur als Fallback)?
3. Slug-Regeln im Detail (Umlaute, „Praxis“-Präfix), sobald der erste Ableiter gebaut wird.
4. Internet-Phase: gleicher Hostname (Split-Horizon) oder eigener öffentlicher Name?

## Referenzen

- [Caddy Automatic HTTPS](https://caddyserver.com/docs/automatic-https)
- [Caddy HTTP-Protokolle](https://caddyserver.com/docs/modules/http)
- [Caddy `reverse_proxy`](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy)
- [Caddy ACME-DNS-Plugin](https://github.com/caddy-dns/acmedns)
- [Let's Encrypt: Challenge Types](https://letsencrypt.org/docs/challenge-types/)
- [Let's Encrypt: Staging Environment](https://letsencrypt.org/docs/staging-environment/)
- [Let's Encrypt Pebble](https://github.com/letsencrypt/pebble)
- [MDN: Server-sent events](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events/Using_server-sent_events)
- [`realtime-streams.md`](realtime-streams.md)

## Umsetzung erst nach dem Kunden-Test

Scope: [`roadmap.md`](roadmap.md). HTTP-Ist:
[`delivery.md`](delivery.md), [`deployment-docker.md`](deployment-docker.md).
