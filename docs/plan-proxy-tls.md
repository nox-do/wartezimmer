# Plan: TLS, HTTP/2 und Internet-Portal

Stand: 2026-08-24

Status: **Zielbild mit beschlossenem LAN-TLS-Pilot, nicht Teil des laufenden Kunden-Tests.**
HTTP-Proxy auf Port 80 ist Ist — Betrieb in [`delivery.md`](delivery.md) und
[`deployment-docker.md`](deployment-docker.md). Der gemischte historische Plan liegt
unter [`archive/plan-proxy-container.md`](archive/plan-proxy-container.md).

## Ausgangslage und Motivation

Der optionale Caddy-Proxy nimmt HTTP auf Port 80 entgegen und leitet auf `app:8080`.
`CANONICAL_BASE_URL` ist die Basis für Geräte- und Portal-URLs. Mit aktivem Proxy ist
App-Port 8080 nur noch auf Host-Loopback. Sandbox bleibt intern. TLS, Port 443 und ein
öffentliches Portal fehlen.

```text
Ist:   Browser ── HTTP/1.1 ──> proxy:80  ── HTTP/1.1 ──> app:8080
Ziel:  Browser ── HTTPS/h2 ───> proxy:443 ─ HTTP/1.1 ──> app:8080
```

TLS ist nicht nur Vertraulichkeit, sondern löst ein konkretes Echtzeitproblem: Browser
begrenzen lang laufende HTTP/1.1-Verbindungen pro Browser und Origin typischerweise auf
wenige Verbindungen. SSE belegt jede Verbindung dauerhaft; MFA hält bereits Queue- und
Ops-Stream parallel offen. Mehrere Tabs können deshalb normale Requests oder weitere
SSE-Verbindungen blockieren. Browser nutzen HTTP/2 praktisch über HTTPS; `h2c` ist kein
tragfähiger Browserweg.

Caddy ist dabei nicht das Leistungs-Nadelöhr, sondern der TLS-Terminator, der auf der
Client-Strecke HTTP/2 ermöglicht. Der interne Hop `proxy → app` darf HTTP/1.1 bleiben.
Caddy erkennt `text/event-stream` als Streaming-Antwort und flusht sie ohne zusätzliche
SSE-Sonderkonfiguration.

## Ziel

Zwei Ebenen, ein Proxy-Container:

| Ebene          | Erreichbarkeit                 | TLS               | Regel                                               |
| -------------- | ------------------------------ | ----------------- | --------------------------------------------------- |
| **Praxis-LAN** | Terminal, MFA, TV, Ops, Portal | HTTPS             | voller Reverse-Proxy; `CANONICAL_BASE_URL`          |
| **Internet**   | nur Portal (+ nötige APIs)     | **HTTPS Pflicht** | Whitelist — kein `/mfa`, `/terminal`, `/tv`, `/ops` |

Die App bleibt ohne TLS-Code. Der Proxy übernimmt Zertifikate, Redirects und HTTP/2.
Bei aktivem TLS ist `CANONICAL_BASE_URL` immer `https://…`.

LAN-TLS und Internet-Portal werden getrennt umgesetzt. Der LAN-TLS-Pilot öffnet keine
Praxis-Ports zum Internet und veröffentlicht nicht die gesamte App.

## TLS-Wege im Manager

1. **Ohne TLS** — vorhandener HTTP-Proxy für Entwicklung oder einen begrenzten Test.
2. **Eigenes Zertifikat** — Praxis-IT liefert Hostname, Fullchain und Private Key.
   Stock Caddy reicht dafür aus; Erneuerung liegt bei der Praxis-IT.
3. **Managed TLS** — Anbieter-Subdomain, Let's Encrypt über DNS-01 und automatische
   Erneuerung. Für diesen Weg wird ein gepinntes Caddy-Image mit `acmedns`-Plugin
   ausgeliefert.

Managed TLS ist der empfohlene Produktweg. Ein manuell importiertes Zertifikat bleibt
als IT-Option bestehen, ist aber wegen Ablauf und Austausch nicht der wartungsärmste Weg.

## Nicht-Ziele

- Kein Gateway-/Captive-Ersatz
- Kein Kubernetes oder Service-Mesh
- Keine TLS-Logik im App-Container
- Kein Zwang, lokale Entwicklung generell über Port 443 auszuführen
- Kein öffentliches Exposing der gesamten App
- Kein TLS zwischen `app` und `sandbox` im Ein-Host-Compose; der Hop bleibt Docker-intern

## Beschlossene Managed-TLS-Architektur

### Einmalige DNS-Delegation

Die kostenpflichtige DNS-API des Domainproviders ist nicht erforderlich. Pro Praxis wird
ein fester CNAME angelegt:

```text
_acme-challenge.<praxis>.<anbieter-domain>
  CNAME <installations-id>.<acme-dns-zone>
```

Der CNAME bleibt über alle Ausstellungen und Renewals gleich. Caddy darf mit einem eng
begrenzten ACME-DNS-Credential ausschließlich den TXT-Wert unter dem delegierten Ziel
ändern. Die übrige Anbieter-DNS-Zone ist für die Praxisinstallation nicht schreibbar.

Let's Encrypt bleibt die öffentliche Zertifizierungsstelle. ACME-DNS stellt keine
Zertifikate aus, sondern beantwortet nur die DNS-01-Challenge. Der Betreiber des
ACME-DNS-Dienstes ist dennoch eine Vertrauensstelle: Er könnte für delegierte Namen eine
Challenge beantworten. Deshalb ist ein öffentlicher kostenloser Dienst nur für den
Pilot vorgesehen; produktiv braucht Praxis Flow eine selbst kontrollierte oder
professionell betriebene Instanz.

### Trennung von Zertifikat und LAN-IP

```text
Zertifikatsrecht:
  _acme-challenge.seidel.notaus.de → fester ACME-DNS-CNAME

Lokale Erreichbarkeit:
  seidel.notaus.de → aktuelle LAN-IP der Praxis
```

Das Zertifikat gilt für den Hostnamen und ist unabhängig von der LAN-IP. Ändert sich die
LAN-IP, bleiben CNAME, ACME-DNS-Credential und Zertifikat unverändert. Nur die lokale
Namensauflösung muss auf die neue Adresse zeigen; daraus entsteht kein Aufwand beim
Anbieter-DNS. Empfohlen ist eine DHCP-Reservierung für den Praxis-Server.

Ein öffentlicher A-Record auf eine private LAN-IP ist nicht das Produktmodell. Für den
Pilot reicht ein lokaler Hosts-Eintrag; produktiv wird ein lokaler DNS-Eintrag benötigt.
Der Manager erkennt die konfigurierte LAN-IP und zeigt die passende Anweisung an, ändert
aber nicht stillschweigend fremde DNS-Infrastruktur.

## Manager ist die Konfigurationsquelle

TLS-Daten werden nicht manuell in Caddyfile oder `.env` erfunden. Die Manager-App fragt
die fachlichen Werte ab und übergibt sie an die Setup-API. Hostdateien sind gerenderte
Ausgabe dieses Modells. DNS-Lookups dienen nur zur Verifikation, nicht zur Ermittlung der
gewünschten Konfiguration.

Der Manager fragt für Managed TLS mindestens:

- gewünschten beziehungsweise vom Anbieter zugewiesenen Hostnamen
- ACME-Kontakt-E-Mail
- Bestätigung des Managed-TLS-Modus

LAN-IP, Installationspfad, Compose-Status und Ports kennt der Manager bereits. ACME-DNS-
Server und Produktmodus kommen aus der ausgelieferten Produktkonfiguration, nicht aus
einer frei editierbaren Kunden-URL.

### Aktivierungsablauf

1. Praxis wählt **Managed TLS** und gibt den gewünschten Praxisnamen ein.
2. Setup registriert genau einen ACME-DNS-Account für diese Installation.
3. Manager zeigt eine kopierbare **TLS-Aktivierungsanfrage**:

   ```text
   Hostname:       seidel.notaus.de
   Record-Typ:     CNAME
   Record-Name:    _acme-challenge.seidel.notaus.de
   Record-Ziel:    <generierte-id>.auth.acme-dns.example
   Installations-ID: <id>
   ```

4. Praxis übermittelt die Information an den Anbieter.
5. Anbieter prüft/vergibt den Namen und trägt den CNAME einmalig ein.
6. Praxis klickt **DNS prüfen**; Setup prüft den exakten CNAME und dessen Auflösung.
7. Manager zeigt zusätzlich die lokale DNS-/Hosts-Anweisung für die erkannte LAN-IP.
8. Erst nach erfolgreicher Verifikation rendert Setup die Caddy-Konfiguration, startet
   den TLS-Proxy und prüft Zertifikat sowie HTTP/2.
9. Caddy erneuert das Zertifikat danach automatisch; der Anbieter wird nicht erneut
   benötigt.

Vorgesehene Zustände:

```text
off → preparing → awaiting-provider-dns → dns-verified
    → provisioning → active
                    ↘ degraded / error → retry
```

Die UI zeigt Geheimnisse nicht dauerhaft an. Nach erfolgreicher Registrierung werden
nur Hostname, CNAME-Anweisung, Status, Aussteller und Ablaufdatum angezeigt.

## Pilot auf dem Entwickler-Laptop

Dedizierter Abnahme-Hostname:

```text
seidel.notaus.de
```

Pilotbedingungen:

- `notaus.de` bleibt beim vorhandenen DNS-Provider; dessen kostenpflichtige API wird
  nicht verwendet.
- Der öffentliche Dienst `auth.acme-dns.io` darf für den Pilot verwendet werden.
- Der Manager erzeugt zuerst ACME-DNS-Credential und CNAME-Ziel; vorher wird beim
  Domainprovider kein Platzhalterrecord angelegt.
- Die lokale Namensauflösung zeigt auf dem Laptop zunächst auf `127.0.0.1`; für einen
  LAN-Test später auf die vom Manager erkannte LAN-IP.
- Port 80/443 werden nicht aus dem Internet zur Praxis weitergeleitet.
- Nach erfolgreicher Ausstellung wird der Caddy-State dauerhaft behalten und nicht bei
  jedem Test neu erzeugt.

Der Pilot ist erfolgreich, wenn:

- der Browser `https://seidel.notaus.de` ohne Zertifikatswarnung öffnet,
- tatsächlich HTTP/2 (`h2`) ausgehandelt wird,
- mehrere parallele SSE-Streams und mehrere MFA-Tabs nicht am HTTP/1.1-Limit hängen,
- Neustart, Re-Apply und Proxy-Reparatur Zertifikat und Credential wiederverwenden,
- ein simulierter Renewal-/DNS-Fehler im Manager sichtbar und wiederholbar heilbar ist.

## Wiederholbare Teststrategie

Manager-Entwicklung darf nicht fortlaufend neue produktive Let's-Encrypt-Zertifikate
beantragen. Tests sind in vier Ebenen getrennt.

### 1. Unit- und UI-Tests ohne Netzwerk

Setup-/Manager-Antworten werden simuliert. Abgedeckt werden mindestens:

- Registrierung erfolgreich/fehlgeschlagen
- CNAME fehlt, ist falsch, propagiert oder korrekt
- Provisioning, Active, Ablaufwarnung und Renewal-Fehler
- ungültiger oder bereits vergebener Hostname
- Caddy-Start, HTTPS-Probe und HTTP/2-Probe fehlerhaft
- Retry, Re-Apply und Repair ohne Verlust von State

### 2. Lokale ACME-Integration mit Pebble

CI und wiederholbare Integrationsläufe verwenden Pebble, den ACME-Testserver des
Let's-Encrypt-Projekts, zusammen mit kontrolliertem Test-DNS. Damit wird der echte Ablauf
`Manager → Setup → Caddy → DNS-01 → ACME → Zertifikat` ohne öffentliche CA und ohne
Rate-Limits geprüft. Test-Roots werden ausschließlich im isolierten Testkontext vertraut.

### 3. Let's-Encrypt-Staging

Staging wird für wenige manuelle Systemtests vor Releases verwendet, nicht als CI-
Abhängigkeit. Staging-Zertifikate sind absichtlich nicht öffentlich vertrauenswürdig.

```text
https://acme-staging-v02.api.letsencrypt.org/directory
```

### 4. Produktive Abnahme

`seidel.notaus.de` erhält ein echtes, dauerhaft gespeichertes Zertifikat. Wiederholte
Manager- und Proxy-Tests verwenden dieses Zertifikat und denselben Caddy-State. Sie
erzwingen keine Neuausstellung.

Alle Reparaturaktionen sind idempotent:

```text
gültiges Zertifikat + gültiges Credential + gültiger CNAME
  → Konfiguration wiederverwenden
  → Container bei Bedarf neu starten
  → kein Löschen und keine Neuregistrierung
```

Das bewusste Löschen von Zertifikaten, ACME-Account oder Caddy-State ist eine getrennte,
deutlich warnende Wartungsaktion und kein normaler Manager-Reset.

## Compose (Ziel)

HTTP-Overlays bleiben. TLS hängt Port 443, persistenten State und eine Credential-Datei
an denselben `proxy`-Service:

```yaml
ports:
  - '${PROXY_HTTP_PORT:-80}:80'
  - '${PROXY_HTTPS_PORT:-443}:443'
volumes:
  - ${PROXY_CADDY_DATA_HOST_PATH}:/data
  - ${PROXY_CADDY_CONFIG_HOST_PATH}:/config
  - ${PROXY_CADDYFILE_HOST_PATH}:/etc/caddy/Caddyfile:ro
  - ${PROXY_ACME_DNS_CREDENTIALS_HOST_PATH}:/run/secrets/acme-dns.json:ro
  - ${PROXY_CERTS_HOST_PATH}:/certs:ro
```

Stock Caddy bleibt für HTTP und Custom-TLS möglich. Managed TLS verwendet ein gepinntes,
im Release enthaltenes Caddy-Image mit `dns.providers.acmedns`. Caddy-Daten liegen in
einem expliziten Hostverzeichnis und überleben Container-Neubau, Update und Repair.

## Host-Konfiguration (Ziel)

Die genaue interne Repräsentation wird mit dem Setup-API-Schema festgelegt. Erwartete
gerenderte Werte:

```text
PROXY_MODE=off | http | tls-custom | tls-managed
TLS_MODE=disabled | custom | managed
TLS_CERT_SOURCE=none | file | acme-dns | external
TLS_HOSTNAME=seidel.notaus.de
TLS_ACME_DIRECTORY=production | staging | pebble
PROXY_HTTPS_PORT=443
```

ACME-Secrets liegen nur im Install-Home mit restriktiven Rechten, nicht in der App-DB,
nicht im Renderer und nicht im normalen `.env`. Backup umfasst Konfiguration,
Credential, Zertifikate und Caddy-/ACME-State. Restore darf keine Neuregistrierung
auslösen.

## Internet-Whitelist (spätere eigene Phase)

Öffentlich nur:

- `/portal`, `/portal/*`
- Portal-APIs, mindestens Session-Resolve, Captive-Authorize und
  Patient-Documents-Intake; exakte Liste bei Implementierung gegen OpenAPI prüfen

Nicht öffentlich: `/mfa`, `/terminal`, `/tv`, `/ops`, `/api/v1/ops/*`.

Der LAN-TLS-Pilot setzt diese Phase nicht voraus, weil keine eingehenden Internetports
geöffnet werden.

## Sicherheit

- Proxy routet nur zur App, nie zur Sandbox.
- `X-Forwarded-*` wird nur von bekannten Proxy-Quellen vertraut; der heutige globale
  Schalter `TRUST_PROXY_HEADERS=true` reicht dafür nicht.
- Cookies erhalten bei erkanntem HTTPS das Attribut `Secure`.
- TLS-Setup blockiert, wenn Sandbox ins LAN/Public zeigt oder über den Proxy erreichbar
  wäre.
- Ein ACME-DNS-Credential kann nur einen generierten TXT-Zielrecord ändern; der Anbieter
  delegiert genau einen Praxis-Challenge-Namen auf dieses Ziel.
- Der öffentliche Dienst `auth.acme-dns.io` ist ausdrücklich nur Pilot-/Testabhängigkeit.
- Provider-DNS-Zugangsdaten werden niemals auf Praxisserver übertragen.
- Logs und Manager-Fehlertexte dürfen ACME-Passwort, Private Key und Credential-Datei
  nicht ausgeben.

## Umsetzungsreihenfolge

1. **Testfundament:** TLS-Zustandsmodell, Fakes sowie Pebble-/Test-DNS-Integration.
2. **Setup-API:** Prepare, DNS-Prüfung, Apply, Status und idempotentes Repair.
3. **Manager:** Eingabemaske, Aktivierungsanfrage, Status/Fehler und lokale DNS-Anweisung.
4. **Proxy-Runtime:** Caddy-Image mit Plugin, Port 443, persistenter State, sichere
   Forwarded-Header und Secure Cookies.
5. **Pilot:** `seidel.notaus.de` über `auth.acme-dns.io`, echtes Zertifikat und
   HTTP/2-/SSE-Abnahme.
6. **Produkthärtung:** eigener/verwalteter ACME-DNS-Dienst, Backup/Restore,
   Ablaufmonitoring, Delivery- und Updatepfad.
7. **Internet-Portal:** separater öffentlicher VHost mit expliziter Route-Whitelist.

## Noch offene Entscheidungen

1. Wer betreibt den produktiven ACME-DNS-Dienst, unter welcher Zone und mit welchem
   Backup-/Monitoring-SLA?
2. Eigene TLS-Endpunkte in der Setup-API oder Erweiterung von `POST /host/network`?
3. Wie wird lokale DNS-Auflösung in typischen Praxisnetzen konkret bereitgestellt und
   vom Manager geprüft?
4. Welche Anbieterfreigabe beziehungsweise Namensreservierung verhindert doppelte oder
   unerwünschte Praxis-Subdomains?

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

Scope: [`roadmap.md`](roadmap.md). HTTP-Ist und historische Detailentscheidungen:
[`archive/plan-proxy-container.md`](archive/plan-proxy-container.md).
