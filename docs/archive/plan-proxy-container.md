# Plan: Reverse Proxy Container, TLS-Modi und Manager-Status

> **Archiviert (2026-08-24).** HTTP-Ist und TLS-Soll waren hier vermischt.
> TLS-Zielbild: [`../plan-proxy-tls.md`](../plan-proxy-tls.md).
> HTTP-Betrieb: [`../delivery.md`](../delivery.md), [`../deployment-docker.md`](../deployment-docker.md).

Stand: 2026-07-21

Status: **archiviert.** TLS-Zielbild und HTTP-Betrieb siehe Kasten oben.

## Implementierungsstand (2026-07-21)

Bereits umgesetzt:

- `CANONICAL_BASE_URL` ist die gemeinsame Basis fuer Nutzer- und Geraete-URLs.
- Ein optionaler Stock-Caddy-Container (`caddy:2.11.4`) nimmt HTTP auf Port 80 entgegen und leitet auf `app:8080` weiter.
- Dev- und Delivery-Overlays existieren als `docker-compose.proxy.yml` und `docker-compose.proxy.delivery.yml`.
- Setup und Manager koennen den HTTP-Proxy aktivieren, deaktivieren, starten und nach einem Fehler wiederherstellen.
- Bei aktivem Proxy wird `APP_BIND_ADDRESS=127.0.0.1` gesetzt. Dadurch bleibt App-Port 8080 fuer lokale Setup-Probes erreichbar, ist aber nicht mehr im Praxis-LAN veroeffentlicht.
- Proxy-Port-Preflight, Compose-Status, kanonische URL-Umschaltung und Manager-Anzeige sind implementiert.
- Das Proxy-Image sowie Compose- und Caddy-Templates koennen in Offline-Delivery- und `.pfupdate`-Paketen mitgeliefert werden.
- Ein eigenstaendiger Smoke-Test prueft das echte Repo-Caddyfile gegen einen temporaeren Upstream (`npm run smoke:proxy`).
- `sandbox:8081` bleibt ueber `expose` im Compose-Netz; der Proxy routet ausschliesslich zur App.

Noch nicht umgesetzt:

- HTTPS/Port 443, Custom TLS und Managed TLS/ACME
- Zertifikatsimport, persistenter Zertifikats-/ACME-State und TLS-Probes
- getrennter oeffentlicher Portal-VHost mit Route-Whitelist
- TLS-/Zertifikatsstatus und Ablaufwarnungen im Manager
- dedizierte Proxy-Healthcheck-Definition im Compose-Overlay
- Begrenzung des Vertrauens in `X-Forwarded-*` auf bekannte Proxy-Quellen fuer den spaeteren TLS-Betrieb

Die folgenden Abschnitte beschreiben teils den vorhandenen HTTP-Stand und teils das Zielbild. Kennzeichnungen wie **Ist** und **Ziel** machen diese Grenze explizit.

## Ziel

Praxis Flow bekommt einen optionalen, spaeter empfohlenen **Reverse-Proxy-Container** als Eingang auf **Port 80/443** im Praxis-LAN. Von **außen (Internet)** ist nur das **Patientenportal** (plus dafuer noetige APIs) freigegeben — nicht MFA, Terminal, TV oder Ops.

Der Proxy trennt Infrastruktur von Produktlogik:

```text
Praxis-LAN (alle Rollen)          Internet (nur Portal)
    -> 80/443                         -> 443 (Whitelist)
    -> proxy container                -> proxy container
    -> app:8080                       -> app:8080
    -> sandbox:8081 nur intern        -> sandbox:8081 nur intern
```

Die App bleibt fuer Fachlogik, UI, API, Rollen, Patientenfluss und Geraete-Pairing zustaendig. Der Proxy uebernimmt Hostname, TLS, Zertifikate, Redirects und kontrolliertes Exposing.

Zusaetzlich wird der Proxy zum **kanonischen Zugriffspunkt** fuer alle Nutzer-URLs im Praxis-LAN, sobald er aktiviert ist. Manager, Setup und App duerfen dann nicht mehr unabhaengig Links aus IP und `:8080` zusammenbauen. TLS ist **optional** (auch rein intern), wird aber fuer Produktivbetrieb mit Patientendaten empfohlen.

## Zwei Ebenen: Praxis-LAN und Internet

| Ebene          | Erreichbarkeit                      | TLS                            | Proxy-Regel                                                                |
| -------------- | ----------------------------------- | ------------------------------ | -------------------------------------------------------------------------- |
| **Praxis-LAN** | Terminal, MFA, TV, Ops, Portal      | optional (`http` oder `https`) | Voller Reverse-Proxy auf `app:8080`; `CANONICAL_BASE_URL` fuer alle Rollen |
| **Internet**   | nur Portal (+ Captive-/Upload-APIs) | **HTTPS Pflicht**              | **Whitelist** — kein `/mfa`, `/terminal`, `/tv`, `/ops`                    |

Im LAN ersetzt der Proxy den direkten App-Port `8080` als sichtbaren Einstieg (`80`/`443`). In Dev ohne Proxy bleibt `http://<host>:8080` erlaubt.

Von aussen gilt weiterhin: **kein oeffentliches Exposing der gesamten App**. Details und Routenliste: Abschnitt **P6 — Externer Zugriff**.

**Hinweis:** Der fruehere Plan `plan-portal-dns-tls.md` ist hierin aufgegangen (Portal-Whitelist, DynDNS/Domain-IT-Checklisten). Es gibt nur noch dieses Dokument fuer Proxy/TLS.

## Nicht-Ziele

- Kein Gateway-Ersatz. Das Gateway mit Bridging, DHCP, Captive Portal und Interface-Kontrolle bleibt ein separates Host-/Linux-Thema.
- Kein Kubernetes, keine Service-Mesh-Architektur.
- Keine TLS-/ACME-Logik im App-Container.
- Kein Zwang, in Dev sofort ueber 443 zu gehen.
- Kein oeffentliches Exposing der gesamten App als Default.

## Ausgangslage und heutiger Stand im Repo

- `docker-compose.delivery.yml`
  - `app` wird ueber `${APP_BIND_ADDRESS:-0.0.0.0}:8080:8080` veroeffentlicht
  - `sandbox` nur intern via `expose: 8081`
- `docker-compose.proxy.yml` und `docker-compose.proxy.delivery.yml`
  - optionaler Stock-Caddy auf `${PROXY_HTTP_PORT:-80}:80`
  - `proxy/Caddyfile` leitet vollstaendig auf `app:8080` weiter
  - noch kein Port 443, Zertifikats-Mount oder Proxy-Healthcheck
- `docker-compose.gateway*.yml`
  - optional, nicht stabil fuer alle Umgebungen, wegen Netzwerk-Bridging ohnehin Sonderfall
- `setup/` und `manager/`
  - Host-Setup, `.env`, Compose, Probes und Setup-API auf `127.0.0.1:9190`
  - Proxy ist Teil des Host-/Netzwerkmodells (`off | http`)
  - Manager-Checkbox „Einfacher Geraetezugriff ueber Port 80“
  - Aktivierung setzt `APP_BIND_ADDRESS=127.0.0.1`; Deaktivierung stellt `0.0.0.0` und Nutzer-URLs mit `:8080` wieder her
- Delivery/Update
  - Proxy-Image ist auf `caddy:2.11.4` gepinnt
  - Proxy-Overlay und Caddyfile sind optionale, rueckwaertskompatible Bestandteile des `.pfupdate`-Formats

Ohne Proxy ist der App-Port der sichtbare Einstieg. Mit dem bereits implementierten HTTP-Proxy gilt:

```text
Dev ohne Proxy:
  http://<host>:8080 -> app

Dev/Delivery mit HTTP-Proxy:
  http://<host>:80   -> proxy -> app
  http://127.0.0.1:8080 -> app (nur lokale Setup-/Wartungs-Probes)

Ziel fuer TLS:
  https://<host>:443 -> proxy -> app
```

## TLS-Modi im Produkt

Setup-Wizard und Manager sollen drei Wege anbieten.

### 1. Ohne TLS

Fuer Entwicklung, Demo, Pilot oder streng interne Testumgebungen.

```text
http://<lan-ip>:8080
```

Optionen:

- v1: App direkt auf `8080` veroeffentlichen.
- spaeter: Proxy auch fuer HTTP auf `80`, damit die Architektur gleich bleibt.

Produkt-Hinweis: Nicht als empfohlener Produktivmodus mit Patientendaten darstellen.

Empfehlung nach Proxy-Einfuehrung: Auch ohne TLS sollte der Proxy der Default-Einstieg sein:

```text
http://<lan-ip>        -> proxy -> app:8080
http://<hostname>      -> proxy -> app:8080
```

Der direkte App-Port `8080` bleibt fuer lokale Dev-Profile erreichbar, aber nicht im Proxy-Betrieb.

### 2. Eigene Domain / eigenes Zertifikat

Fuer Praxen oder IT-Dienstleister, die Domain und Zertifikate selbst verwalten.

```text
https://praxis.example.de
```

Moegliche Zertifikatsquellen:

- Zertifikat + Private Key als Datei/Import
- vorhandener lokaler Proxy der Praxis-IT
- spaeter ACME/DNS-01 mit eigenen DNS-Zugangsdaten

Praxis Flow verwaltet in diesem Modus nicht zwingend die Domain. Der Manager zeigt Status und erwartete Pfade.

### 3. Ueber Praxis Flow Domain

Managed-Weg fuer Praxen ohne IT-Know-how.

```text
https://mueller.praxis-flow.de
```

Start pragmatisch:

- Subdomain wird manuell/administrativ angelegt.
- `_acme-challenge.<praxis>.praxis-flow.de` wird als CNAME auf einen acme-dns-Zielnamen gesetzt.
- Praxis-Server bekommt nur ACME-DNS-Credentials fuer genau diesen Challenge-Record.
- Proxy holt und erneuert Zertifikat automatisch.

Spaeter kann die Provisionierung ueber Setup-Code laufen:

```text
Setup-Code -> hostname + acme-dns account + erlaubte Release-Version
```

## Warum Proxy-Container

Der Proxy ist containergeeignet, weil er nur Ports entgegennimmt und HTTP weiterleitet. Er braucht kein Bridging, kein DHCP und keine Kontrolle ueber physische Interfaces.

Vorteile:

- App bleibt auf `8080`, ohne Root-Port oder TLS-Code.
- `sandbox` bleibt Docker-intern.
- Zertifikate, Renewal, Redirects und Security Header liegen an einer Stelle.
- Eigene Domain, managed Domain und spaeter externer Zugriff nutzen denselben Baustein.
- Updates der App und Proxy-Konfiguration bleiben getrennt.

Der Gateway bleibt dagegen separat, weil er Netzwerk-Infrastruktur ist.

## Compose: Ist und Ziel

Vorhandene Overlays:

```text
docker-compose.proxy.yml
docker-compose.proxy.delivery.yml
```

### Ist: HTTP-Proxy (P2a/P2c)

```yaml
services:
  proxy:
    image: ${PRAXIS_FLOW_PROXY_IMAGE:-caddy:2.11.4}
    container_name: praxis-flow-proxy
    restart: unless-stopped
    ports:
      - '${PROXY_HTTP_PORT:-80}:80'
    volumes:
      - ./proxy/Caddyfile:/etc/caddy/Caddyfile:ro
    depends_on:
      app:
        condition: service_healthy
```

Beide Proxy-Overlays sind absichtlich klein und verwenden dasselbe Caddyfile. Sie besitzen noch keinen eigenen Healthcheck; der Manager bewertet aktuell den Compose-Containerstatus und prueft die App ueber die kanonische URL.

### Ziel: TLS-Erweiterung

```yaml
services:
  proxy:
    image: caddy:<pinned-version>
    container_name: praxis-flow-proxy
    restart: unless-stopped
    ports:
      - '${PROXY_HTTP_PORT:-80}:80'
      - '${PROXY_HTTPS_PORT:-443}:443'
    volumes:
      - ${PROXY_MANAGED_CERTS_HOST_PATH:-~/praxis-flow/certs/managed}:/data
      - ${PROXY_CONFIG_DIR_HOST_PATH:-~/praxis-flow/proxy}:/config
      - ${PROXY_CADDYFILE_HOST_PATH:-~/praxis-flow/proxy/Caddyfile}:/etc/caddy/Caddyfile:ro
      - ${PROXY_CERTS_HOST_PATH:-~/praxis-flow-certs}:/certs:ro
    depends_on:
      app:
        condition: service_healthy
```

Die urspruenglich geplante Variable `APP_PUBLISH_PORT` wurde nicht eingefuehrt. Stattdessen steuert Setup die Bind-Adresse des weiterhin vorhandenen Port-Mappings:

```text
Proxy aus: APP_BIND_ADDRESS=0.0.0.0   -> Port 8080 im Praxis-LAN erreichbar
Proxy an:  APP_BIND_ADDRESS=127.0.0.1 -> Port 8080 nur auf dem Host erreichbar
```

Das erhaelt die lokale Setup-/Wartungsprobe auf `127.0.0.1:8080`, ohne den direkten App-Port im LAN anzubieten. Ein vollstaendiges Entfernen des Port-Mappings ist derzeit nicht geplant, solange diese lokale Probe gebraucht wird.

## Proxy-Konfiguration

### Ohne TLS

```caddyfile
:80 {
  reverse_proxy app:8080
}
```

### Eigenes Zertifikat

```caddyfile
{$PUBLIC_HOSTNAME} {
  tls /certs/fullchain.pem /certs/privkey.pem
  reverse_proxy app:8080
}
```

### Praxis Flow managed via acme-dns

Je nach Caddy-Build braucht es ein Image mit passendem DNS-Plugin oder einen separaten ACME-Client. Caddy ohne Plugin kann nicht beliebige DNS-Provider sprechen.

Ziel:

```caddyfile
{$PUBLIC_HOSTNAME} {
  reverse_proxy app:8080

  tls {$ACME_EMAIL} {
    dns acmedns {$ACME_DNS_CONFIG}
  }
}
```

Festgelegte Richtung: Managed TLS soll automatisch per ACME/DNS-01 laufen. Weil United Domains ohne bezahlte API genutzt wird, darf die Praxisinstallation keinen United-Domains-API-Zugriff brauchen.

Pragmatischer Zielweg:

- einmalige DNS-Vorbereitung pro Praxis, z. B. CNAME von `_acme-challenge.<praxis>.praxis-flow.de` auf ein acme-dns-Ziel
- danach automatische Ausstellung und Renewal durch den Proxy/ACME-Baustein
- keine manuelle TXT-Erneuerung alle 60-90 Tage

Wichtig: Manuelles TXT-Eintragen ist als Fallback fuer Pilot/Support moeglich, aber kein guter Dauerbetrieb, weil Let's-Encrypt-Challenges ablaufen und Renewals regelmaessig wiederholt werden muessen.

Offen bleibt nur die technische Verpackung:

- eigenes Caddy-Image mit acme-dns Plugin
- Caddy fuer Proxy, separater Certbot/lego/acme.sh-Container fuer Zertifikate
- spaeter ggf. Traefik, falls es im Stack klarer wird

Die fruehere Vorentscheidung fuer ein eigenes Praxis-Flow-Caddy-Image mit acme-dns-Plugin ist wieder offen. Vor P4/P5 wird der Proxy-Baustein neu bewertet: Stock Caddy erweitern, eigenes Caddy-Image bauen, Caddy mit separatem ACME-Client kombinieren oder einen anderen Proxy einsetzen. Der vorhandene HTTP-Stand legt die TLS-Loesung nicht fest.

## Konfigurationsmodell

### Ist: Host-Konfiguration fuer HTTP

```dotenv
PROXY_ENABLED=false
PROXY_MODE=off
PROXY_HTTP_PORT=80
PRAXIS_FLOW_PROXY_IMAGE=caddy:2.11.4
APP_BIND_ADDRESS=0.0.0.0
CANONICAL_BASE_URL=http://192.168.1.50:8080
```

Bei Aktivierung schreibt Setup `PROXY_MODE=http`, setzt `APP_BIND_ADDRESS=127.0.0.1` und normalisiert `CANONICAL_BASE_URL` auf den Proxy-Port (bei Port 80 ohne Portangabe). Erlaubte Modi sind derzeit strikt nur `off | http`; unbekannte oder widerspruechliche Werte werden abgelehnt.

### Ziel: erweiterte Host-Konfiguration fuer TLS

```dotenv
PROXY_ENABLED=false
PROXY_MODE=off
PUBLIC_HOSTNAME=
PUBLIC_BASE_URL=
CANONICAL_BASE_URL=

TLS_MODE=disabled
TLS_CERT_SOURCE=none

PROXY_HTTP_PORT=80
PROXY_HTTPS_PORT=443
PROXY_CONFIG_DIR_HOST_PATH=
PROXY_CADDYFILE_HOST_PATH=
PROXY_CERTS_HOST_PATH=
PROXY_MANAGED_CERTS_HOST_PATH=

ACME_EMAIL=
ACME_PROVIDER=
ACME_DIRECTORY_URL=
ACME_DNS_ACCOUNT_ID=
ACME_DNS_CNAME_TARGET=
```

Zielwerte nach der TLS-Erweiterung:

```text
PROXY_MODE=off|http|tls-custom|tls-managed
TLS_MODE=disabled|custom|managed
TLS_CERT_SOURCE=none|file|acme-dns|external
```

Secrets gehoeren nicht in Renderer oder UI-Bundle. Wenn acme-dns Credentials lokal gespeichert werden, dann als Host-Secret im Install-Home mit restriktiven Dateirechten, nicht in der App-Datenbank.

`CANONICAL_BASE_URL` ist die einzige Quelle fuer Links, die an Menschen/Geraete ausgegeben werden. Beispiele:

```text
http://192.168.1.50
https://mueller.praxis-flow.de
https://praxis.example.de
```

Aus dieser Basis werden Rollen-URLs abgeleitet:

```text
{CANONICAL_BASE_URL}/terminal
{CANONICAL_BASE_URL}/mfa
{CANONICAL_BASE_URL}/tv
{CANONICAL_BASE_URL}/ops
{CANONICAL_BASE_URL}/ops/setup
{CANONICAL_BASE_URL}/portal
```

Der direkte App-Port bleibt in lokalen Dev-Profilen technisch moeglich:

```text
http://<lan-ip>:8080
```

Im Proxy-Betrieb bleibt er nur auf Host-Loopback fuer Setup-/Wartungsprobes gebunden und erscheint nicht in QR-Codes, Buttons, Manager-Status oder Raum-/Geraetelinks.

## Kanonische URLs und Link-Erzeugung

Das groesste Risiko bei mehreren TLS-/Domain-Varianten ist nicht der Proxy selbst, sondern verstreute URL-Erzeugung. Deshalb gilt:

- Setup-Wizard erzeugt und speichert genau eine `CANONICAL_BASE_URL`.
- Manager zeigt und oeffnet alle Nutzerlinks aus dieser Basis.
- App-/Ops-Settings verwenden dieselbe Basis fuer angezeigte Geraete-/Portal-Links.
- Raum-, TV-, Terminal- und MFA-Links werden nicht mehr separat aus LAN-IP + Port gebaut, sobald `PROXY_ENABLED=true`.
- Bei TLS-Modi ist `CANONICAL_BASE_URL` immer `https://...`.
- Bei Proxy ohne TLS ist `CANONICAL_BASE_URL` `http://<host>` ohne `:8080`.
- Direkte App-URLs mit `:8080` werden im Proxy-Betrieb nicht erzeugt.

Damit gibt es nur einen Single Point of Configuration:

```text
CANONICAL_BASE_URL -> alle Rollen-/Geraete-/Portal-URLs
```

Die App selbst sollte relative API-Pfade nutzen. UI-Bundles sollen keine absolute API-Base brauchen, solange Browser und API ueber denselben Origin laufen.

## Setup-Wizard

Der Setup-Wizard bekommt einen Abschnitt **Zugriff & HTTPS**.

### Wizard-Fragen

1. Wie soll Praxis Flow im Praxisnetz erreichbar sein?
   - Ohne TLS / SSL fortfahren (kann spaeter nachgeholt werden)
   - Eigene, vorhandene Domain nutzen (selbstverwaltet; Anleitung folgt in den nachfolgenden Schritten)
   - Praxisname als Subdomain von `praxis-flow.de` nutzen, z. B. `mueller.praxis-flow.de`
2. Hostname
   - leer bei ohne TLS
   - eigener FQDN bei custom
   - `<praxis>.praxis-flow.de` bei managed (Domainname kann sich vor Launch noch aendern)
3. Zertifikatsquelle
   - keine
   - Zertifikatdateien auswaehlen
   - managed/acme-dns Zugangsdaten laden
4. Ports
   - Standard `80/443`
   - Konflikt erkennen, alternative Ports fuer Test erlauben
5. App-Port veroeffentlichen?
   - nur Dev-Profil ja
   - Delivery mit Proxy nein

### Wizard-Ausgabe

- schreibt `.env`
- schreibt/generiert Proxy-Konfiguration
- setzt `CANONICAL_BASE_URL`
- zeigt bei managed TLS den DNS-Eintrag, den Support bei United Domains setzt
- startet Compose mit Proxy-Overlay
- prueft:
  - Proxy-Container laeuft
  - `GET /api/v1/ops/health` ueber Proxy erreichbar
  - TLS-Zertifikat gueltig, falls aktiv
  - Hostname passt zum Zertifikat
  - alle ausgegebenen Rollen-URLs dieselbe Basis nutzen

## Manager-Integration

Manager zeigt Proxy als eigenen Betriebsbereich, nicht versteckt im App-Status.

### Status-Screen

Neue Zeilen:

```text
Zugriff       https://mueller.praxis-flow.de
Proxy         laeuft
TLS           gueltig bis 2026-09-28
Modus         Praxis Flow managed
App-Port      intern
```

Buttons und Links im Manager verwenden die kanonische Basis:

```text
MFA oeffnen          {CANONICAL_BASE_URL}/mfa
Ops oeffnen          {CANONICAL_BASE_URL}/ops
Setup fortsetzen     {CANONICAL_BASE_URL}/ops/setup
Terminal             {CANONICAL_BASE_URL}/terminal
Wartezimmer-TV        {CANONICAL_BASE_URL}/tv
Patientenportal       {CANONICAL_BASE_URL}/portal
```

Warnungen:

- Proxy aktiviert, Container gestoppt
- TLS aktiv, Zertifikat fehlt
- Zertifikat laeuft bald ab
- Hostname nicht erreichbar
- App-Port direkt veroeffentlicht, obwohl Proxy aktiv ist
- PUBLIC_BASE_URL passt nicht zum erreichbaren Host
- generierte Links verwenden unterschiedliche Origins oder noch `:8080`, obwohl Proxy aktiv ist

### Wartung / Konfiguration

Manager-Aktionen:

- Proxy starten/stoppen/neustarten
- Proxy-Konfiguration neu schreiben
- TLS-Pruefung erneut ausfuehren
- Zertifikatstatus aktualisieren
- bei managed: acme-dns CNAME/Ziel anzeigen
- bei custom: Zertifikat/Key importieren oder Pfade setzen

Keine DNS-Zonenverwaltung im Manager v1. CNAME/Subdomain wird fuer betreute Installationen manuell vorbereitet.

Managed-TLS-Anzeige fuer Support:

```text
Bei United Domains eintragen:

Typ:   CNAME
Name:  _acme-challenge.mueller
Ziel:  abc123.auth.praxis-flow.de

Danach: TLS pruefen / fortsetzen
```

Der Wizard darf diesen Schritt wiederholbar machen: wenn ein Challenge-/acme-dns-Ziel neu erzeugt wird, zeigt er den aktuellen Eintrag erneut an.

## Zertifikatsspeicher und Backup

Zertifikate und Private Keys gehoeren nicht ins Image und nicht in die App-Datenbank. Best Practice fuer diesen Stack:

```text
<PRAXIS_FLOW_HOME>/
  .env
  proxy/
    Caddyfile
  certs/
    custom/
      fullchain.pem
      privkey.pem
    managed/
      account/
      certificates/
```

Im Container werden Zertifikate nur gemountet:

```text
Host:      <PRAXIS_FLOW_HOME>/certs/custom
Container: /certs/custom:ro

Host:      <PRAXIS_FLOW_HOME>/certs/managed
Container: /data
```

Regeln:

- importierte Zertifikate liegen unter `<PRAXIS_FLOW_HOME>/certs/custom`
- automatische ACME-/Caddy-Daten liegen unter `<PRAXIS_FLOW_HOME>/certs/managed`
- Private Keys bekommen restriktive Rechte, z. B. nur Besitzer lesbar
- Manager/Renderer zeigen nie Private-Key-Inhalte
- Backup umfasst kuenftig nicht nur `.env`, sondern auch Proxy-Konfig und Zertifikats-/ACME-Daten

Backup-Umfang fuer Recovery:

```text
.env
proxy/Caddyfile
certs/custom/*
certs/managed/*
```

Auch wenn managed Zertifikate erneuerbar sind, gehoeren ACME-Accountdaten und Proxy-State ins Backup, damit Recovery ohne neue Registrierung/Rate-Limit-Stress moeglich bleibt.

Entscheidung fuer Produktivbetrieb: Caddy-/ACME-State liegt auf einem Host-Pfad unter `<PRAXIS_FLOW_HOME>/certs/managed`, nicht in einem anonymen Docker-Volume. Dadurch kann der Manager Backup/Recovery ohne Docker-Volume-Sonderlogik abdecken.

## Config-Uebergabe und Recovery

Die `.env` ist der Brueckenkopf zwischen Manager/Setup und Containern. `CANONICAL_BASE_URL` und Proxy-/TLS-Modus werden dort gespeichert und von den Containern nur gelesen.

Quelle der Wahrheit:

```text
Manager/Setup -> .env -> Container
```

Die App darf `CANONICAL_BASE_URL` fuer Anzeige und Link-Erzeugung lesen. Sie soll diese Basisadresse aber nicht unabhaengig in der Datenbank editierbar machen, damit es nicht zwei widerspruechliche Wahrheiten gibt.

## Dokumentenpfad und interne Schutzgrenzen

Wenn der Patientenzugriff per TLS abgesichert wird, darf danach kein unkontrollierter Klartext-Hop ins Praxis-LAN entstehen. Der interne Dokumentenpfad bleibt deshalb bewusst **Docker-intern**:

```text
Patient Browser
    -> HTTPS :443
    -> proxy
    -> app:8080
    -> http://sandbox:8081 im privaten Compose-Netz
    -> sandbox_intake_data
```

Der Hop `app -> sandbox` muss nicht per TLS verschluesselt werden, solange er ausschliesslich im privaten Docker-Netz laeuft und nicht ins LAN oder ueber den Proxy geroutet wird. Die Sicherheitsgrenze ist hier nicht „TLS ueberall“, sondern:

- keine Host-Port-Veroeffentlichung fuer `sandbox`
- kein Proxy-Route zu `sandbox:8081`
- `SANDBOX_BASE_URL` in Delivery nur auf interne Ziele (`http://sandbox:8081`, in Dev ggf. `http://127.0.0.1:8081`)
- interne Sandbox-Routen weiter mit `SANDBOX_INTERNAL_TOKEN`
- Sandbox-Custody bleibt im dedizierten Volume `sandbox_intake_data`
- Preview und Export laufen weiterhin ueber `app` als autorisierenden Proxy

Damit bleibt der Dokumentenfluss Ende-zu-Ende kontrolliert:

1. Patient uploadet via HTTPS zur App.
2. App uebergibt das Dokument im privaten Compose-Netz an die Sandbox.
3. Sandbox speichert und scannt das Dokument vor DB-Metadaten/Preview/Export.
4. MFA sieht Dokumente nur ueber App-Preview-Proxy mit gebundenem Token.
5. Export streamt gescannte Inhalte von Sandbox zur App und dann in den Exportordner.

### Fehlkonfigurationen, die Manager/Setup erkennen sollen

Setup und Manager sollen spaeter warnen oder blockieren, wenn eine TLS-Installation intern unsauber konfiguriert ist:

- `sandbox` hat einen veroeffentlichten Host-Port (`ports:` statt nur `expose:`)
- `SANDBOX_BASE_URL` zeigt auf eine LAN-IP, `PUBLIC_HOSTNAME`, Proxy-URL oder externe Adresse
- Proxy-Konfiguration enthaelt `reverse_proxy sandbox:8081`
- `SANDBOX_AUTH_ENABLED=false` in einem Delivery-/Produktionsprofil
- `SANDBOX_INTERNAL_TOKEN` fehlt oder ist ein bekannter Default
- App-Port oder Sandbox-Port sind direkt veroeffentlicht, obwohl `PROXY_ENABLED=true` aktiv ist

### Optional spaeter: interner TLS-Hop

Ein interner TLS- oder mTLS-Hop zwischen `app` und `sandbox` ist moeglich, aber nicht v1-Default. Er lohnt sich erst, wenn App und Sandbox auf verschiedenen Hosts laufen, ueber ein fremdes Netz sprechen oder die Praxis-IT eine Policy „TLS fuer jede Service-Kommunikation“ verlangt.

Fuer den aktuellen Ein-Host-Compose-Betrieb ist die bessere erste Leitplanke: Sandbox strikt privat halten und Fehlkonfiguration sichtbar machen.

## Setup-API

### Ist: Proxy im bestehenden Host-Modell

```text
GET  /api/setup/host/status
GET  /api/setup/host/runtime-health
POST /api/setup/host/network
GET  /api/setup/host/compose
POST /api/setup/host/compose
GET  /api/setup/host/compose/logs?tail=200
POST /api/setup/host/probes
```

Der HTTP-Proxy wurde bewusst in die vorhandenen Host-, Netzwerk-, Compose- und Probe-Endpunkte integriert. `POST /host/network` nimmt optional `{ proxy: { enabled, httpPort } }` entgegen. Host- und Runtime-Status enthalten Proxy-Konfiguration beziehungsweise Containerstatus. Das vermeidet fuer P2a eine zweite Aktions-API neben dem bestehenden Compose-Lebenszyklus.

Aktueller gemeinsamer Typ:

```ts
type ProxyStatus = {
  enabled: boolean;
  mode: 'off' | 'http';
  canonicalBaseUrl: string | null;
  httpPort: number;
  appBindAddress: string;
  container: ComposeServiceStatus | null;
};
```

### Ziel fuer TLS

TLS erweitert `ProxyStatus` um HTTPS-Port, Zertifikatsquelle, Gueltigkeit, Subject Names und Ablauf. Ob Zertifikatsimport und Regeneration als eigene `/proxy`-Endpunkte oder als Erweiterung des bestehenden Host-Modells umgesetzt werden, wird mit der Proxy-/ACME-Entscheidung festgelegt. Ein separates `action`-Modell ist daher noch kein beschlossener API-Vertrag.

## Sicherheitsregeln

- Renderer sieht keine ACME-Secrets und keine Private Keys.
- Setup-API bleibt nur auf `127.0.0.1`.
- Proxy-Logs im Manager nur tail/gekürzt anzeigen.
- Private Keys liegen auf Host/Volume mit restriktiven Rechten.
- Proxy routet nur zur App, nie direkt zur Sandbox.
- Sandbox bleibt nur im privaten Compose-Netz erreichbar (`expose`, keine `ports`).
- `SANDBOX_BASE_URL` ist in Delivery ein internes Compose-Ziel, kein LAN-/Public-Hostname.
- **Ziel vor TLS:** App vertraut `X-Forwarded-*` nur von bekannten Proxy-Quellen. Der vorhandene Schalter `TRUST_PROXY_HEADERS=true` allein bildet diese Quellpruefung noch nicht ab und ist im Compose-Stand nicht aktiviert.
- Cookies werden bei erkanntem HTTPS mit `Secure` gesetzt; die TLS-Integration muss die vertrauenswuerdige Proto-Weitergabe aktivieren und testen.
- Origin-/Host-Pruefung beruecksichtigt den weitergeleiteten Host nur bei aktiviertem Proxy-Header-Vertrauen; auch das ist Teil der TLS-Sicherheitsarbeit.

## Migration / Kompatibilitaet

Phase 1 darf bestehende Installationen nicht brechen.

Empfohlener Uebergang:

1. Proxy optional einfuehren, `PROXY_ENABLED=false` Default.
2. Manager kann Proxy konfigurieren und testen.
3. Installationen ohne Proxy koennen weiterhin `http://<lan-ip>:8080` nutzen.
4. Sobald Proxy aktiviert ist, wird der App-Port nur noch an Host-Loopback (`127.0.0.1`) gebunden und ist nicht mehr im Praxis-LAN erreichbar.
5. Neue Produktivinstallationen sollen ueber den Proxy laufen, auch im Modus ohne TLS.

## Implementierungsphasen

### P0 — URL-Modell / URL-Autoritaet — umgesetzt

Ziel: `CANONICAL_BASE_URL` als Produktmodell etablieren, **bevor** Proxy-Compose kommt.

URL-Klassen (nicht vermischen):

- **User-/Geraete-URLs** (Terminal, TV, MFA, Ops, Portal): aus `CANONICAL_BASE_URL`
- **Setup-local Probes**: `http://127.0.0.1:8080` (Docker-Publish) bleiben erlaubt
- **Interne Service-URLs**: `SANDBOX_BASE_URL=http://sandbox:8081` bleibt intern
- **Gateway/Captive**: Sonderfall (`portalAppIp` / spaeter ggf. `PORTAL_PUBLIC_BASE_URL`)
- **Same-origin UI**: `window.location.origin` oft korrekt

LAN-Erreichbarkeit:

- Hostname = Komfortpfad; IP = zuverlaessiger Fallback
- Setup fragt/testet spaeter (Manager/Wizard Schritt 2); bei Fail klar warnen und IP setzen
- keine magische mDNS/NetBIOS-Reparatur

Umgesetzter Code-Schnitt:

- `buildDeviceUrlsFromBaseUrl(baseUrl)` + `resolveCanonicalBaseUrl(env, lanIp)`
- Fallback ohne Env: `http://<lan-ip>:8080` (Verhalten unveraendert)
- `getHostStatus` / `buildSetupPlan` / Apply / `saveHostNetwork` / LAN-Probes nutzen den Resolver
- `.env` schreibt `CANONICAL_BASE_URL`; Custom-Hostname bleibt bei LAN-IP-Wechsel erhalten

Umgesetzte Manager-/Wizard-UI:

- Netzwerk-Tab: neues Akkordeon **Erreichbarkeit im Praxisnetz** (getrennt vom Topology-Akkordeon „Betriebsarten“ Portal/Gastnetz)
- Modi v0: LAN-IP (Default) | Hostname versuchen | eigener Name/Domain
- DNS + HTTP-Health testen; Fail → IP-Fallback + klare Warnung
- Wizard teilt dasselbe Panel; Probe-/Copy-Reste (`setup-probes`, Wizard-Texte, Health-Header) mitziehen
- Gateway/Captive bleibt eigener Block (`portalAppIp`)

### P1 — Arbeitsdokument und Modell — teilweise umgesetzt

- [x] Dieses Dokument und HTTP-Konfigurationsmodell.
- [x] Konfigurationsnamen fuer `off | http` finalisiert.
- [ ] TLS-Konfigurationsnamen mit der Proxy-/ACME-Entscheidung finalisieren.
- [ ] Proxy und ACME-Verpackung neu bewerten.

### P2 — Compose-Overlay ohne ACME — HTTP umgesetzt

- [x] `docker-compose.proxy.yml` und Delivery-Overlay
- [x] einfacher HTTP-Proxy auf `80`
- [x] Setup-API liest Proxy-Konfiguration und Containerstatus
- [x] Manager zeigt und steuert den HTTP-Proxy
- [x] `CANONICAL_BASE_URL`-Ableitung fuer Proxy-HTTP
- [x] Port-Preflight, Aktivieren/Deaktivieren und Recovery-Aktion
- [x] Offline-Image und Templates in Delivery/`.pfupdate` (rueckwaertskompatibel optional)
- [x] eigenstaendiger Smoke-Test des Caddyfiles
- [ ] dedizierter Proxy-Healthcheck
- [ ] Setup/Manager-Audit fuer alle unsicheren Sandbox-/Proxy-Fehlkonfigurationen
- [ ] optionales TLS mit vorhandenen Zertifikatdateien (jetzt P4)

### P3 — Setup-Wizard Integration — HTTP weitgehend umgesetzt

- [x] HTTP-Proxy im gemeinsamen Wizard-/Netzwerkbereich aktivieren
- [x] `.env` fuer HTTP-Modus schreiben; statisches Repo-Caddyfile verwenden
- [x] HTTP-Port pruefen
- [x] App ueber die gespeicherte kanonische Proxy-URL pruefen
- [x] Wizard-/Manager-Links aus `CANONICAL_BASE_URL` erzeugen
- [x] direkte `:8080`-Nutzerlinks im Proxy-Modus nicht mehr erzeugen
- [x] `APP_BIND_ADDRESS=127.0.0.1` setzen; lokale `:8080`-Probe bleibt erhalten
- [ ] eigener Wizard-Schritt „Zugriff & HTTPS“ mit TLS-Moduswahl
- [ ] dynamische TLS-Proxy-Konfiguration generieren
- [ ] `SANDBOX_BASE_URL` und weitere interne Schutzgrenzen als Setup-Blocker validieren

### P4 — Custom TLS

- Zertifikat/Key importieren oder Pfade konfigurieren
- Zertifikatdaten auslesen
- Manager-Warnungen fuer Ablauf/Hostname
- `CANONICAL_BASE_URL=https://<eigene-domain>` erzwingen
- Zertifikate unter `<PRAXIS_FLOW_HOME>/certs/custom` ablegen und in Backup aufnehmen

### P5 — Managed TLS ueber Praxis Flow Domain

- acme-dns Credentials im Setup hinterlegen
- CNAME-Ziel im Manager anzeigen
- automatische Ausstellung und Renewal
- Probes fuer Zertifikat und Hostname
- `CANONICAL_BASE_URL=https://<praxis>.praxis-flow.de` erzwingen
- ACME-/Proxy-State in Backup aufnehmen
- Wizard zeigt den manuellen United-Domains-CNAME fuer betreute Installation

### P6 — Externer Zugriff (nur Portal)

Ziel: Patienten erreichen das Portal von aussen per HTTPS. MFA, Terminal, TV und Ops bleiben **nur im Praxis-LAN** (ueber `CANONICAL_BASE_URL` im LAN, nicht per Portweiterleitung ins Internet).

```text
Internet
    │
    ▼  :443 (DynDNS, eigene Domain oder mueller.praxis-flow.de)
[Reverse Proxy — TLS, gleicher Container wie LAN]
    │  nur Whitelist:
    │    /portal, /portal/*
    │    Portal-/Captive-APIs (siehe Liste unten)
    ▼
[app:8080]  +  [sandbox intern]
```

**Oeffentlich erlauben** (exakte Liste bei Implementierung aus Routes pruefen):

- `GET/HEAD` statisch: `/portal`, `/portal/*`
- API mindestens:
  - `/api/v1/sessions/resolve-ticket`
  - `/api/v1/sessions/captive-authorize`
  - `/api/v1/patient-documents/*` (intake, list, delete)
  - ggf. Anamnese-/Form-Endpoints des Portal-Flows

**Nicht oeffentlich:** `/mfa`, `/terminal`, `/tv`, `/ops`, `/api/v1/ops/*` (Health nur intern).

Lieferumfang P6:

- Router-/Portweiterleitungs-Checkliste (443, ggf. 80 fuer ACME)
- Proxy-Whitelist in Caddyfile (separate Site-Block oder `route` innerhalb des Hosts)
- DynDNS / eigene Domain — IT-Verzweigungen (Assistent-Copy):
  - **DynDNS:** Hostname beim Anbieter, Updater, A-Record oder CNAME, LE/ACME auf Praxis-Proxy
  - **Eigene Domain, Pfad auf Website (B1):** Hoster leitet `/portal` auf Praxis-Server; oft kein separates LE noetig
  - **Subdomain (B2/B3):** `wlan.praxis.de` A oder CNAME → Praxis-IP/DynDNS; LE auf Subdomain
- `APP_PORTAL_URL` / `PORTAL_FQDN` muessen mit oeffentlichem HTTPS-Host uebereinstimmen (Gateway/Captive: `fas_secure_enabled` nach Lab-Test)
- Ops-/Manager-Anzeige: gewaehlte Portal-URL, TLS-Status, Renewal-Warnung
- Abgrenzung zu `docs/gateway-captive-portal.md` aktualisieren

Auth von aussen: Session-Token, Wartenummer vom Terminal — ohne Besuch im Portal nutzlos.

## Definition of Done

### HTTP-Meilenstein (P2a/P2c)

- [x] Proxy laeuft als eigener Container im Compose-Overlay.
- [x] App bleibt auf `8080`; Sandbox bleibt intern.
- [x] Setup kann den Proxy an-/abschalten und die HTTP-Konfiguration schreiben.
- [x] Manager zeigt Proxy-Konfiguration, Containerstatus und Ziel-URL.
- [x] Manager/Wizard erzeugen Nutzerlinks aus `CANONICAL_BASE_URL`.
- [x] Im Proxy-Modus werden keine Nutzerlinks mit direktem `:8080` ausgegeben.
- [x] Im Proxy-Modus ist App-Port 8080 nur an Host-Loopback gebunden.
- [x] HTTP-Modus funktioniert ohne Zertifikat und besitzt einen eigenstaendigen Smoke-Test.
- [x] Bestehende Delivery-Installationen und alte `.pfupdate`-Pakete ohne Proxy bleiben kompatibel.
- [ ] Dedizierten Proxy-Healthcheck ergaenzen.
- [ ] Deployment-Dokumentation mit dem implementierten HTTP-Einstieg und Loopback-Portmodell angleichen.

### TLS-/Public-Meilenstein (P4-P6)

- [ ] Manager/Setup warnen oder blockieren, wenn Sandbox oder interne Dokumentwege ins LAN/Public-Netz zeigen.
- [ ] Manager zeigt TLS- und Zertifikatsstatus.
- [ ] Custom-Zertifikat-Modus funktioniert mit importierten Dateien.
- [ ] Managed TLS stellt Zertifikate automatisch aus und erneuert sie.
- [ ] Proxy-Konfiguration, Zertifikate und ACME-State sind Teil von Backup/Recovery.
- [ ] Vertrauen in Forwarded-Header ist auf bekannte Proxy-Quellen begrenzt.
- [ ] Oeffentlicher Zugriff erlaubt ausschliesslich Portal und exakt benoetigte APIs.

## Festgelegte Entscheidungen

1. Proxy laeuft als eigener Container, nicht im App-Container.
2. Gateway bleibt separat; Proxy ersetzt kein Bridging/Captive/DHCP.
3. Sobald `PROXY_ENABLED=true`, ist der Proxy der kanonische Einstieg fuer Nutzer.
4. Auch ohne TLS kann der Proxy auf Port `80` laufen und auf `app:8080` weiterleiten.
5. Im Proxy-Modus erzeugen Manager, Wizard und App Nutzerlinks aus `CANONICAL_BASE_URL`.
6. Direkte `:8080`-Nutzerlinks werden im Proxy-Modus nicht erzeugt; der App-Port wird dann nur an Host-Loopback gebunden.
7. TLS-Modi erzwingen `CANONICAL_BASE_URL=https://...`.
8. Der Dokumentenpfad `app -> sandbox` bleibt Docker-intern; Sandbox wird nicht ueber Proxy oder LAN erreichbar gemacht.
9. Unsichere Sandbox-Konfiguration ist bei TLS-Modi ein Setup-Blocker, nicht nur eine Warnung.
10. Bestehende Installationen ohne Proxy bleiben kompatibel; der Proxy wird zuerst optional eingefuehrt.
11. Die `.env` ist Quelle der Wahrheit fuer `CANONICAL_BASE_URL` und Proxy-/TLS-Modus.
12. Zertifikate und Proxy-/ACME-State liegen unter `<PRAXIS_FLOW_HOME>/certs/...` und gehoeren in Backup/Recovery; die genauen Unterpfade folgen aus der Proxy-Entscheidung.
13. UI-Bezeichnungen der drei Wege sind festgelegt:
    - „Ohne TLS / SSL fortfahren (kann spaeter nachgeholt werden)“
    - „Eigene, vorhandene Domain nutzen (selbstverwaltet; Anleitung folgt in den nachfolgenden Schritten)“
    - „Praxisname als Subdomain von `praxis-flow.de` nutzen“, z. B. `mueller.praxis-flow.de`
14. Erste Managed-TLS-Version ist betreut: Wizard/Manager zeigen den CNAME, Support traegt ihn bei United Domains ein.
15. Renewal soll danach automatisch laufen; kein wiederkehrender manueller TXT-Prozess.
16. Fuer Produktivbetrieb liegt persistenter Proxy-/ACME-State auf einem Host-Pfad unter `<PRAXIS_FLOW_HOME>`, nicht in einem anonymen Docker-Volume.
17. **Praxis-LAN:** Proxy auf `80`/`443` ist kanonischer Einstieg fuer alle Rollen; TLS optional waehlbar.
18. **Internet:** Nur Portal (+ Whitelist-APIs) oeffentlich; kein Exposing von MFA/Terminal/TV/Ops.
19. `plan-portal-dns-tls.md` ist obsolet — Inhalt in diesem Plan (v. a. P6).

## Noch offene Entscheidungen

1. **Proxy-Produktentscheidung:** Ist Stock Caddy auch fuer Custom TLS, Managed DNS-01 und die externe Portal-Whitelist der passende dauerhafte Baustein, oder ist Traefik, nginx oder eine andere Loesung fuer Betrieb und Updates klarer?
2. **TLS-Verpackung bei Caddy:** Stock Image mit extern bereitgestellten Zertifikaten, eigenes `xcaddy`-Image mit DNS-Plugin oder separater ACME-Client (`lego`, `certbot`, `acme.sh`)?
3. **acme-dns Betrieb:** acme-dns selbst betreiben oder `auth.praxis-flow.de` / `kunden.praxis-flow.de` zu einem API-freundlichen DNS/Hosted-Service delegieren?
4. **Forwarded-Header-Vertrauen:** Wie wird die App-Quellpruefung robust an das konkrete Compose-Netz beziehungsweise den gewaehlten Proxy gebunden?

## Referenzen

- `docs/delivery.md`
- `docs/deployment-docker.md`
- `manager/README.md`
- `docs/gateway-captive-portal.md`
- `docker-compose.delivery.yml`
- `setup/src/server.ts`
- `setup/src/docker.ts`
- `manager/src/main/setup-api.ts`
