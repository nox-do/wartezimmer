# Plan: Vertrauenswürdiges TLS im Praxis-LAN

Stand: 2026-08-27

Status: **Überarbeitetes Zielbild für den LAN-TLS-Pilot. Nicht Teil des laufenden Kunden-Tests.**

HTTP-Proxy auf Port 80 ist Ist — [`delivery.md`](delivery.md),
[`deployment-docker.md`](deployment-docker.md). Historie:
[`archive/plan-proxy-container.md`](archive/plan-proxy-container.md).
Manager-Oberfläche und Aktivierungs-UX:
[`plan-proxy-tls-manager.md`](plan-proxy-tls-manager.md).

TLS erweitert denselben `proxy`-Service, dieselbe Setup-API und denselben
Delivery-Vertrag. Es ist kein paralleles System.

## Entscheidung

Praxis Flow verwendet pro Installation einen **stabilen öffentlichen Hostnamen**. Dessen
öffentlicher A-Record zeigt auf die **feste private IPv4** des Praxisservers. Caddy
erhält per ACME DNS-01 ein öffentlich vertrauenswürdiges Zertifikat.

Es gibt **kein Zentral-Produkt** (kein Installationsregister, keine API „Zentrale“).
Betreiber der DNS-Zone und der ACME-Challenge-Infrastruktur ist der
Produktbetreiber. Installations-ID und Einmal-Token erzeugt der **Manager während
des Setups**.

```text
Jetzt/Test:     7fk3m2.lan.notaus.de          (Testdomain, kein Produkt)
Später/Produkt: praxis-7fk3.lan.praxis-flow.de
A-Record:       192.168.178.112
Praxisserver:   feste IPv4, keine Portfreigabe
Client:         normaler Browser, keine Installation
```

`notaus.de` ist **Notlösung / Testdomain**, nicht die spätere Produktdomain
(`praxis-flow.de`). Test-Hostnamen ohne Präfix `praxis-` (kurz). Produkt-Beispiel
mit Präfix wie unten.

DNS legt der Betreiber **manuell und zeitversetzt** an: der Manager erzeugt einen
**Mailtext**, den die Praxis an den Betreiber schickt. Es gibt keine automatische
DNS-API. Die Praxis richtet eine feste IPv4 beziehungsweise DHCP-Reservierung ein.
Blockiert der Router öffentliche DNS-Namen mit privaten Zieladressen, richtet die
Praxis eine **gezielte** DNS-Rebind-Ausnahme ein. Praxis Flow betreibt keinen
eigenen DNS-Resolver.

## Ausgangslage

Der optionale Caddy-Proxy nimmt HTTP auf Port 80 entgegen und leitet auf `app:8080`.
`CANONICAL_BASE_URL` ist die Basis für Geräte- und Portal-URLs. Mit aktivem Proxy ist
App-Port 8080 nur noch auf Host-Loopback. Sandbox bleibt intern. TLS und Port 443 fehlen.

Harte Grenzen im heutigen Code (P2a):

- `PROXY_MODE` nur `off | http`; `tls-*` wird abgelehnt
- Overlay publiziert `0.0.0.0:80`, ohne `/data`, ohne 443
- `proxy/Caddyfile` ist `:80 { reverse_proxy app:8080 }` und wird bei Update nicht
  überschrieben
- Delivery pinnt `images.proxy` auf `caddy:2.11.4`
- `TRUST_PROXY_HEADERS` existiert, steht nicht in Compose
- `.pfbackup` enthält Settings und `.env`, keinen Caddy-/ACME-State
- Compose hängt das Overlay nur bei `PROXY_ENABLED=true` und `PROXY_MODE=http`
- `POST /host/network` darf einen aktiven TLS-Modus nicht wieder auf HTTP setzen

```text
Ist:   Browser ── HTTP/1.1 ──> proxy:80  ── HTTP/1.1 ──> app:8080
Ziel:  Browser ── HTTPS/h2 ───> proxy:443 ─ HTTP/1.1 ──> app:8080
       Browser ── HTTP/1.1 ──> proxy:80  ── 301 → HTTPS
```

TLS schafft Vertraulichkeit. HTTP/2 über HTTPS beseitigt das Browserlimit für parallele
lang laufende HTTP/1.1-Verbindungen (Queue- und Ops-SSE). `h2c` ist kein Produktweg;
ein app-seitiges Connection-Budget bleibt separat — [`todo.md`](../todo.md).
Caddy terminiert TLS und handelt `h2` aus; der Hop `proxy → app` bleibt HTTP/1.1.

## Zielarchitektur

| Rolle               | Aufgabe                                                                                              |
| ------------------- | ---------------------------------------------------------------------------------------------------- |
| **Betreiber**       | öffentliche DNS-Zone, A-Record je Installation, isolierte DNS-01-Berechtigung; kein Produkt-Register |
| **Praxisserver**    | feste private IPv4, Praxis Flow und Caddy, lokaler Schlüssel und Zertifikats-State                   |
| **Manager / Setup** | Installations-ID und Einmal-Token erzeugen, IPv4 bestätigen, Cutover, Diagnose                       |
| **Client**          | normaler Browser, vorhandene DNS-Infrastruktur, HTTPS direkt zum Praxisserver im LAN                 |

```text
7fk3m2.lan.notaus.de.  A  192.168.178.112
```

Der A-Record ist öffentlich sichtbar. Die private Zieladresse ist aus dem Internet
nicht routbar. Ohne Portweiterleitung wird die Anwendung dadurch nicht öffentlich.

Betrieb und HTTP-Proxy laufen **unabhängig** von TLS (Proxy ohne Zertifikat bleibt
gültig). TLS setzt den Proxy voraus: ohne Port 80 keine HTTPS-Strecke. DNS und
Zertifikat können dauern; ab dem Mailtext geht der Assistent mit HTTP weiter.
`verify-dns` und Cutover folgen unter Netzwerk.

Die App terminiert kein TLS. Bei aktivem TLS ist `CANONICAL_BASE_URL` immer
`https://<hostname>` ohne Port 443. Port 8080 bleibt Loopback für Setup-Probes.

## Installationsidentität und Hostname

Während des Manager-Setups (TLS-Strecke) entstehen:

```text
Installations-ID: 7fk3m2q9
Vorschlag:        7fk3m2.lan.notaus.de
Optional:         seidel.lan.notaus.de
Anzeigename:      Praxis Dr. Meyer
```

- Die Installations-ID ist **zufällig, stabil**, aber kein Geheimnis.
- Default-Label: **6 Zeichen** aus der ID, DNS-tauglich, lesbares Alphabet ohne
  `0/O` und `1/l/I`, kein Präfix `praxis-`.
- Wunsch-Label: **ein DNS-Label** (RFC 1123): `a–z`, `0–9`, Bindestrich; 1–63 Zeichen;
  nicht mit Bindestrich beginnen oder enden; **keine Umlaute** (kein Punycode in der
  Eingabe). Reserviert: `lan`, `acme`, `www`, `portal`, `mail`.
- Die Praxis kann im **selben Namensschritt** den Vorschlag nutzen, ein eigenes Label
  setzen oder eine **eigene Domain** angeben. Nach `apply` ist der Hostname fest.
- ACME-Delegation hängt nicht am sichtbaren Namen. **Jetzt/PoC:** CNAME-Ziel kommt
  von `POST https://auth.acme-dns.io/register` (UUID-Subdomain). **Später/Produkt:**
  `{id}.auth.acme.praxis-flow.de`.
- Die Aktivierung verwendet ein **separates starkes Einmal-Token** im Mailtext.
- Der neutrale Default bleibt bei Praxisumbenennung stabil. Ein Wunsch-Label kann in
  CT-Logs erkennbar sein — deshalb ist der 6-Steller der Default.
- Der Anzeigename kommt aus der Anwendung, nicht aus DNS.
- Ein Kunde kann mehrere Installationen besitzen.

## Betriebsvarianten

### Standard: Zone des Betreibers (Pilot-Happy-Path)

```text
7fk3m2.lan.notaus.de
```

Testdomain. Produkt später: `praxis-7fk3.lan.praxis-flow.de`.

Der Manager erzeugt einen **kopierbaren Mailtext** (Betreff, Records, ID, Token,
bestätigte LAN-IP). Die Praxis schickt ihn an den Betreiber. Der Betreiber legt
A-Record und ACME-Challenge **manuell** an — das darf Tage dauern. Die Praxis muss
keinen DNS-Anbieter kontaktieren. `verify-dns` / TLS-`apply` warten unter Netzwerk;
der Rest der Installation (Vorschau, Host-Apply) läuft auf HTTP weiter.

### Optional: Domain der Praxis (eigenes Zertifikat)

Die Namenswahl ist die Fork — kein zweites Radioset „Let's Encrypt oder eigenes“.
Vorschlag und eigenes Label unter der Betreiber-Zone bleiben Let's Encrypt.
**Eigene Domain** ist `tls-custom`: die Praxis bringt Hostname und PEM.

```text
flow.praxis-meyer.de.                         A      192.168.178.112
```

Kein ACME, kein `_acme-challenge`-CNAME, keine Betreiber-Mail. `verify-dns` prüft
nur den A-Record.

PEM-Fullchain und privater Schlüssel (zwei Blöcke). PFX ist nicht v1.

Kein Dateipfad der Praxis wird nach Docker durchgereicht. Der **Manager liest** die
Dateien lokal (Electron-Dialog), prüft das Format und schickt den **Inhalt** an Setup
(`POST /api/setup/host/tls/custom-certificate`). Setup prüft erneut und schreibt nach
`${PROXY_CERTS_HOST_PATH}` als inaktives Staging (Windows-ACLs). Caddy mountet nur
diesen Install-Home-Pfad; Canonical und Gerätezugriff bleiben bis `apply` HTTP.

Prüfung vor dem Schreiben: gültiges PEM, Schlüssel passt zur Kette, SAN enthält den
gewählten Hostnamen, Ablauf. Praxis Flow installiert keine Root-CA im Browser — interne
CAs bleiben Sache der Praxis-IT.

Lokale Checks und `apply` wie bei managed. Erneuerung: dieselben Felder erneut einlesen,
kein Let's-Encrypt-`renew`.

## DNS und ACME DNS-01

A-Record (Browser-Ziel):

```text
7fk3m2.lan.notaus.de.  A  192.168.178.112
```

Temporärer TXT beweist der öffentlichen CA die Domainkontrolle:

```text
_acme-challenge.7fk3m2.lan.notaus.de.  TXT  "<Challenge-Wert>"
```

Der TXT-Wert wechselt bei Ausstellung und Erneuerung und wird danach entfernt.
HTTP-01 und TLS-ALPN-01 sind ungeeignet: die CA erreicht den privaten Server nicht.

Kein allgemeiner DNS-Provider-Schlüssel liegt auf dem Praxisserver. Jede Installation
darf ausschließlich ihre eigene Challenge bedienen. Der private TLS-Schlüssel wird auf
dem Praxisserver erzeugt und verlässt ihn nicht.

Let's Encrypt bleibt die CA für `tls-managed` (kein ZeroSSL-Fallback). Outbound zu
Let's Encrypt und zur ACME-DNS-API ist nötig.

**ACME-DNS**

| Phase                | API                                | CNAME-Ziel in der Mail                            |
| -------------------- | ---------------------------------- | ------------------------------------------------- |
| **Jetzt / PoC**      | `https://auth.acme-dns.io`         | Register-Antwort, z. B. `{uuid}.auth.acme-dns.io` |
| **Später / Produkt** | `https://auth.acme.praxis-flow.de` | `{id}.auth.acme.praxis-flow.de`                   |

Eigenen acme-dns-Dienst erst aufbauen, wenn aus dem Versuch eine belastbare
Produktlösung wird. `notaus.de` bleibt Testdomain.

Produkt-Beispiel (nicht PoC-Mail):

```text
_acme-challenge.praxis-7fk3.lan.praxis-flow.de.  CNAME  7fk3m2q9.auth.acme.praxis-flow.de.
```

PoC-Mail (Testdomain + öffentliche Instanz):

```text
7fk3m2.lan.notaus.de.                    A      192.168.178.112
_acme-challenge.7fk3m2.lan.notaus.de.    CNAME  a097455b-52cc-4569-90c8-7a4b97c6eba8.auth.acme-dns.io.
```

`prepare` registriert das installationsbezogene Konto (`/register`); Creds liegen als
Host-Secret unter dem Install-Home, nicht in der App-DB. Die Praxis-UI zeigt weder
`server_url` noch das Konto. Kein zonenweiter DNS-API-Schlüssel auf dem Praxisserver.

Lab ohne öffentliche LE: Pebble/Staging. Erster PoC-Cutover gegen Let's Encrypt darf
`auth.acme-dns.io` nutzen.

## Aufgabenverteilung

**Betreiber**

- Mail aus dem Manager entgegennehmen (kein Automatismus, kein Register)
- zeitversetzt A-Record auf die bestätigte IPv4 setzen und ACME-CNAME aus der Mail
  (PoC: Ziel `auth.acme-dns.io`; Produkt: `{id}.auth.acme.praxis-flow.de`)
- Registrierung, Sperrung und Zertifikatsstatus (DNS/ACME) verwalten
- keine Praxis- oder Patientendaten transportieren

**Praxisserver und Setup**

- aktuelle IPv4 und MAC-Adresse erkennen und anzeigen
- Bestätigung einer festen IP / DHCP-Reservierung verlangen
- Installations-ID und Einmal-Token erzeugen; **Mailtext** erzeugen (Copy / Senden an
  den Betreiber)
- lokales Schlüsselpaar erzeugen
- Zertifikat anfordern und automatisch erneuern
- Caddy konfigurieren
- DNS, Zertifikat, HTTPS, HTTP/2 und SSE testen
- bei späterer IP-Abweichung deutlich warnen

**Praxis**

- Feste IPv4 oder DHCP-Reservierung für den Praxisserver einrichten
- Keine Portfreigabe für 80 oder 443
- Nur falls der Verbindungstest scheitert: exakte Rebind-Ausnahme
- Clients nach Netzänderungen gegebenenfalls neu verbinden

**Client**

- keine Installation, keine Root-CA, keine Browser-Extension, kein lokaler DNS-Eintrag
- Aufruf der ausgegebenen HTTPS-Adresse

## DNS-Rebinding, DoH und Gast-WLAN

Einige Router oder Resolver blockieren öffentliche DNS-Namen mit privaten Zieladressen.
Das Setup prüft die Auflösung; der Assistent verlangt einen Check von einem **zweiten
LAN-Gerät**. Rebind-Copy erscheint **nicht vorsorglich** — nur wenn die Praxis den
Fehler nennt (Name nicht auflösbar, nicht Zertifikatswarnung).

Wenn erforderlich, wird ausschließlich der konkrete Host freigegeben:

```text
7fk3m2.lan.notaus.de
```

UI-Handlungsanweisung (herstellerneutral, nicht „nur Fritzbox“):

1. Ausnahme nur für den Hostnamen im Router oder DNS-Filter (Suchbegriffe: Rebind,
   DNS-Rebinding, lokale Namen, private IP)
2. Keine exakte Ausnahme: kleinste Zone (`lan.notaus.de` bzw. Apex der Praxis-Domain)
3. Schutz nicht global abschalten
4. Betroffenes Gerät kurz vom WLAN trennen und `https://<hostname>` erneut öffnen

Keine Portfreigabe 80/443 in diesem Hinweis. Gast-WLAN und privates DNS gehören
**nicht** in den Rebind-Kasten — sie gelten schon ohne TLS und stehen unter
Netzwerk → Expander „Adresse für Terminal, TV und MFA“ (`ReachabilityPanel.svelte`,
Copy noch offen, JSDoc dort). Mock-Entwurf: `renderClientReachHint()`.

Der Rebinding-Schutz wird **niemals global** abgeschaltet.

Explizit konfigurierte DoH-/Private-DNS-Dienste können den Router umgehen. Da der
A-Record öffentlich ist, kann die Auflösung trotzdem funktionieren. Einige externe
Resolver filtern private Antworten ebenfalls. Das Setup unterscheidet DNS-Fehler,
Rebind-Block, fehlende Route und TLS-Fehler.

Gäste-WLANs isolieren Endgeräte häufig vom Praxisserver. Für Patientenendgeräte ist
gegebenenfalls eine gezielte Firewallfreigabe auf TCP 443 zum Praxisserver nötig.

LAN-IP-Wechsel: neuer Mailtext mit neuer A-Record-IP an den Betreiber.
Challenge-Delegation und Zertifikat bleiben. DHCP-Reservierung anpassen.

## Portal-Abgrenzung

Das öffentliche Internet-Portal ist **nicht** Teil des LAN-TLS-Piloten. Im Pilot werden
**nicht** vorsorglich angelegt:

- `portal.<installation>…`
- zweiter A-Record oder zweites SAN
- öffentliche Portweiterleitung
- Portal-Allow-List-VHost

LAN-Portal bleibt `https://<hostname>/portal` auf dem einen Host. Das Internet-Portal
erhält später ein eigenes Bedrohungsmodell, einen eigenen Hostnamen, ein eigenes
Zertifikat und einen explizit eingeschränkten Veröffentlichungsweg. LAN-TLS-Erneuerung
und Internet-Portal sind nicht gekoppelt.

## Setup-API und Cutover

TLS-State-Machine hängt **nicht** an `POST /host/network`. Eigene Host-Routen
(Namen vorschlagsweise; Implementierung nach dem Kunden-Test):

```text
POST /api/setup/host/tls/prepare
POST /api/setup/host/tls/verify-dns
POST /api/setup/host/tls/obtain-certificate
POST /api/setup/host/tls/custom-certificate  ← PEM-Inhalt im Wizard inaktiv stagen
POST /api/setup/host/tls/check-certificate   ← gestagtes Custom-PEM lokal prüfen
POST /api/setup/host/tls/apply              ← einziger Canonical-Wechsel
POST /api/setup/host/tls/repair
POST /api/setup/host/tls/reset
POST /api/setup/host/tls/renew              ← explizit, Caddy renewt sonst selbst
GET  /api/setup/host/status                 → tls (kein Token, kein Key)
```

`verify-dns` ist Gate für TLS, nicht für den Rest der Installation. Wizard-`apply`
(HTTP-Host) bleibt davon unabhängig.

### Eine Strecke

```text
off → preparing → awaiting-operator-dns → dns-verified
    → obtaining-certificate → dns-verified (applyReady) → apply → active
                    ↘ error  → repair (State behalten) oder reset (vor apply)
active → degraded (Ablauf/Renew-Fehler, HTTPS kann noch gehen)
active → error    (HTTPS tot, Canonical bleibt https://)
```

Kanonisch ist die Tabelle darunter (inkl. `applyReady`); das ASCII ist nur die Enum-Folge.

| `tls.state`                          | `PROXY_MODE`      | Canonical             | Port 80 | UI-Aktion                                                                   |
| ------------------------------------ | ----------------- | --------------------- | ------- | --------------------------------------------------------------------------- |
| `off`                                | `http` oder `off` | `http://`             | App     | HTTPS vorbereiten                                                           |
| `preparing`                          | `http`            | `http://`             | App     | Name / feste IP / Mail                                                      |
| `awaiting-operator-dns`              | `http`            | `http://`             | App     | `verify-dns` (Tage ok)                                                      |
| `dns-verified`, `applyReady = false` | `http`            | `http://`             | App     | managed: **Zertifikat holen**; custom: **Lokal prüfen** — noch kein Cutover |
| `obtaining-certificate`              | `http`            | `http://`             | App     | warten; HTTP bleibt                                                         |
| `dns-verified`, `applyReady = true`  | `http`            | `http://`             | App     | **Auf HTTPS umstellen**                                                     |
| `active`                             | `tls-managed`     | `https://<host>`      | nur 301 | Status, Ablauf, zweites Gerät                                               |
| `degraded`                           | `tls-*`           | `https://<host>`      | 301     | Warnung, `renew` / `repair`                                                 |
| `error` vor `apply`                  | `http`            | `http://`             | App     | `repair` oder `reset-tls`                                                   |
| `error` nach `apply`                 | `tls-*`           | **bleibt `https://`** | 301     | nur `repair` / `renew` — kein HTTP-Rollback                                 |

Unwiderruflich ist **nur** `apply` (Cutover): Canonical, Geräte-URLs, Cookies, Port-80-Redirect.
Ein geholtes Zertifikat ohne `apply` ist noch kein Cutover. Fehler dort lassen HTTP unverändert.
`GET /host/status` liefert deshalb zusätzlich zu `state` den vorbereiteten Modus
(`managed` / `custom`), `applyReady` und `cutoverApplied`; der Manager leitet diese
Gates nicht aus `PROXY_MODE` oder Zertifikatsmetadaten ab.

### Sequenz

1. `prepare` nach festem Hostname (Namensmodus bekannt), spätestens wenn der
   Mail-/PEM-Schritt den Assistenten verlässt. `tls-managed`: ID + Einmal-Token +
   Mailtext. `tls-custom`: ID, aber kein Token und kein ACME-Konto.
2. Warten, bis der Betreiber den A-Record auf die **bestätigte** LAN-IP gesetzt hat.
   Kein Timeout.
3. `verify-dns` — öffentlicher A-Record; ACME-CNAME nur bei `tls-managed` (custom: nur A).
   Zweites Gerät kann Setup nicht messen.
4. `obtain-certificate` — DNS-01, **HTTP weiter die App**. Danach lokale Checks:
   Kette, Name, TCP 443, h2, ein SSE-Tick. Erst wenn die Checks grün sind, ist `apply`
   frei. 443 darf intern schon antworten — Geräte-URLs bleiben `http://` bis `apply`.
5. `apply` — `CANONICAL_BASE_URL=https://<hostname>` (ohne :443), `PROXY_MODE=tls-managed`,
   Port 80 nur 301, Secure-Cookies.
6. Praxis bestätigt ein zweites LAN-Gerät (kein Server-Haken).

Token-Verbrauch: nach erfolgreichem `obtain-certificate` (ACME-Konto / Creds liegen vor).
Bis dahin darf die Mail-Wiederholung das Token noch zeigen. Kein zweites Token ohne
`reset-tls`.

`tls-custom`: Manager-Main liest und prüft die PEM-Dateien bereits im Wizard und sendet
den Inhalt an `custom-certificate`. Setup prüft erneut und legt Zertifikat und Schlüssel
mit Host-ACLs als **inaktives Staging** im Install-Home ab; kein PEM im Renderer oder
Manager-State. Nach `verify-dns` (nur A-Record) startet `check-certificate` die lokale
443-/Ketten-/Namens-/h2-/SSE-Prüfung mit dem gestagten Material. Canonical und
Geräte-URLs bleiben dabei HTTP. Erst `apply` setzt `PROXY_MODE=tls-custom` und macht
HTTPS zur Geräte-Identität. `renew` bei custom = PEM erneut einlesen, kein Let's Encrypt.

### `repair` gegen `reset-tls`

|                          | `repair`                                                                           | `reset-tls`                                                                                                                                                 |
| ------------------------ | ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Identität (ID, Hostname) | behalten                                                                           | vor `apply`: löschen → `off`. Nach `apply`: **kein** HTTP-Rollback                                                                                          |
| ACME-Konto / Caddy-State | behalten, Caddyfile neu, Checks erneut                                             | vor `apply`: löschen. Nach `apply`: Caddy-Material löschen und **sofort** `obtain-certificate` für dieselbe ID/denselben Host — Canonical bleibt `https://` |
| Wann                     | idempotent, auch wenn das Zertifikat noch gilt (Pilot: Repair ohne Neuausstellung) | Warnung. Vor `apply` = TLS-Strecke abbrechen. Nach `apply` = hartes Neuausstellen, Geräte bleiben auf HTTPS                                                 |
| `POST /host/network`     | unberührt                                                                          | unberührt                                                                                                                                                   |

`POST /host/network` darf einen aktiven TLS-Modus nicht auf HTTP zurücksetzen und
Canonical nicht auf `http://` umschreiben.

```text
PROXY_ENABLED=true
PROXY_MODE=off | http | tls-custom | tls-managed
PROXY_HTTP_PORT=80
PROXY_HTTPS_PORT=443
TLS_ACME_DIRECTORY=production | staging | pebble
```

Kein `PROXY_BIND_ADDRESS` auf LAN-IP oder Loopback als Isolationsmittel. Compose
veröffentlicht 80 und 443 auf dem Praxis-Host (`0.0.0.0`). Schutz: private Zieladresse,
keine Router-Portfreigabe, Host-Firewall. ACME-Secrets nicht in App-DB, Caddyfile oder
normalem `.env`.

## Proxy-Runtime

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

App-Port 8080 bleibt Loopback beziehungsweise Docker-intern. Pilot-Erfolg: ein **zweites
Gerät im LAN** öffnet `https://7fk3m2.lan.notaus.de`, nicht nur der Host.

Caddy-Pflicht:

- nur `h1 h2`; HTTP/3 zunächst aus
- Issuer nur Let's Encrypt; ECH aus (ACME-DNS kann keine `HTTPS`-Records)
- DNS-01, kein HTTP-01 oder TLS-ALPN-01
- `reverse_proxy` ohne Idle-Kill für SSE
- Port 80 liefert nur Redirect, keinen App-Inhalt
- generierte Caddyfile mit Marker; Apply, Repair und Update dürfen sie ersetzen
- ACME-Credentials nicht in App-DB, Caddyfile oder normalem `.env`
- `X-Forwarded-*` nur von der Proxy-Quelle
- Secure-Cookies nach dem HTTPS-Cutover

Delivery: ein Image-Pin, xcaddy/SBOM/`docker save` im bestehenden Release-Pfad.
Apply blockiert, wenn Sandbox ins LAN/Public oder über den Proxy zeigen würde.

## Diagnose

`verify-dns` läuft auf dem Praxisserver. Er kann öffentlichen DNS und den Host
selbst sehen, nicht TV, Tablet oder Handy.

Vom Server prüfbar (Button, ohne zweites Gerät):

- Server besitzt eine IPv4-Adresse
- öffentliche A-Record-Abfrage (Resolver außerhalb des LAN, z. B. 1.1.1.1) zeigt
  auf die bestätigte LAN-IP
- ACME-CNAME zeigt auf das vereinbarte TXT-Ziel (`tls-managed`; bei custom weglassen)
- optional: Auflösung über den Windows-Resolver dieses PCs (kann von Fritzbox-Clients
  abweichen — kein Ersatz für das zweite Gerät)
- nach `obtain-certificate` (managed) beziehungsweise `check-certificate` (custom):
  Zertifikatskette und Name, lokal TCP 443, h2, ein SSE-Tick

Diese Folgechecks sind **Teil von `obtain-certificate`** (managed) beziehungsweise
`check-certificate` (custom), nicht von `verify-dns` und nicht von `apply`. `apply`
bleibt gesperrt, bis sie grün sind.

Nicht vom Server prüfbar — Bestätigung der Praxis, erst sinnvoll nach Zertifikat
und Cutover:

- Hostname löst auf einem zweiten LAN-Gerät auf
- `https://<hostname>` lädt dort ohne Zertifikatswarnung

Rebind-Filter der Fritzbox zeigt sich typisch nur auf anderen DHCP-Clients, nicht
zuverlässig auf dem Host. Deshalb: Hinweis und manuelle Checkbox, kein grüner Haken
von `verify-dns`.

`tls.lastError.class` (eine Klasse, UI-Text deutsch):

| Klasse       | Typisch                                     | Nächster Schritt                                |
| ------------ | ------------------------------------------- | ----------------------------------------------- |
| `a-record`   | kein A / NXDOMAIN / Timeout                 | warten, Mail erneut                             |
| `collision`  | A zeigt auf **fremde** IP                   | anderes Label, neue Mail                        |
| `dns-filter` | öffentlicher Resolver filtert RFC1918       | anderer Resolver-Hinweis; kein eigener Resolver |
| `isolation`  | von der Praxis gemeldet (Gast-WLAN)         | Firewall 443 im LAN, nicht Setup                |
| `firewall`   | 443 lokal nicht erreichbar, Prozess lauscht | Host-Firewall                                   |
| `port-443`   | Port belegt                                 | anderen Dienst beenden                          |
| `clock`      | ACME lehnt wegen Uhrzeit ab                 | Windows-Zeit                                    |
| `acme`       | Challenge, Rate-Limit, Account              | `repair`; Token nicht neu anzeigen              |
| `cert-name`  | SAN ≠ gewählter Hostname                    | `repair` / `reset-tls` vor `apply`              |

Rebind ist **keine** `verify-dns`-Klasse — nur Praxis-Meldung nach Cutover.

## Backup und Restore

Zwei Artefakte im Pilot, **kein** Formatbruch von `.pfbackup` v1
([`settings-backup-classification.md`](settings-backup-classification.md)):

| Artefakt            | Inhalt                                                                                                                                                                                  | Wann                                                                        |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `.pfbackup` v1      | Settings, `.env` (inklusive nicht geheimer `TLS_STATE` / `TLS_INSTALLATION_ID` / `TLS_HOSTNAME`; kann `PROXY_MODE=tls-*` und `CANONICAL_BASE_URL=https://…` enthalten), `manager-state` | unverändertes v1-Archiv, Wartung „Backup erstellen“                         |
| TLS-Sidecar (Pilot) | Datei `praxis-flow-tls-<timestamp>.tgz` neben den `.pfbackup`-Dateien: Caddy-Hostpfade `/data` und `/config`, ACME-DNS-Creds-Datei, Custom-PEMs unter `/certs`                          | sobald `tls.state` nicht `off` — also ab `prepare`, nicht erst nach Cutover |

Restore nur auf **dieselbe Installations-ID und denselben Hostnamen**. ID/Hostname im
Sidecar-Manifest müssen zu `.env` / `tls` im Snapshot passen.

Inspect (`POST /backup/inspect`) zusätzlich:

- `tlsInBackup`: Canonical `https://` oder `PROXY_MODE` `tls-*`
- `tlsPreparedInBackup`: `TLS_STATE != off`, aber noch kein aktives HTTPS
- `tlsSidecarPresent` / `tlsSidecarMatches` (ID, Hostname)
- `tlsMetadataConsistent`: aktive/degradierte States verlangen HTTPS-Marker; ID und
  Hostname müssen in Snapshot und Sidecar jeweils vorhanden sein
- `restoreSupported = false`, wenn **aktives** TLS im Snapshot kein passendes Sidecar hat
- widersprüchliche TLS-Metadaten blockieren Restore ebenfalls
- nur vorbereitet ohne passendes Sidecar: Restore bleibt möglich, Warnung; TLS-State
  wird beim Restore explizit auf `off` gesetzt

Kein stilles Downgrade auf HTTP. Kein Restore, das `https://` Canonical schreibt,
ohne Caddy-State. Fehlermeldung deutsch, Wizard bleibt in der bestehenden
Restore-Strecke (kein zweiter Assistent). Electron-Main sucht neben der gewählten
`.pfbackup` die Sidecar-Datei gleichen Zeitstempels und liest ihre Bytes. Inspect und
Restore erhalten den Sidecar-**Inhalt**, keinen Host-Pfad; Setup prüft Manifest, ID und
Hostname erneut. Nur bei aktivem HTTPS folgt ohne passenden Inhalt der zweite
Dateidialog beziehungsweise `restoreSupported = false`.

Windows: ACLs auf Sidecar und Caddy-Hostpfaden statt `chmod 0600`. Sidecar nicht in
die App-DB und nicht ins Klartext-`.env` der Settings.

Nach dem Pilot: dieselben Dateien in `.pfbackup` (Format-Bump) — Produkthärtung,
nicht Teil dieser Strecke.

## Nicht-Ziele

- kein eigenes Zentral-/Register-Produkt
- kein eigener rekursiver DNS-Resolver im Praxisnetz
- keine Hosts-Datei als Happy Path
- keine Root-CA, Browser-Extension oder native Clientsoftware
- kein Gateway-, DHCP- oder Captive-Portal-Ersatz
- kein TLS zwischen `app` und `sandbox`
- keine TLS-Logik in der Anwendung
- kein öffentliches Exposing der gesamten App
- kein Internet-Portal im LAN-TLS-Pilot (kein vorsorglicher Portal-Host/SAN)
- kein Zwang, Entwicklung über Port 443 zu betreiben
- keine TLS-State-Machine in `POST /host/network`

## Pilot

Hostname-Beispiel Test `7fk3m2.lan.notaus.de`. Keine Portweiterleitung. Caddy-State behalten.
CAA, Uhrzeit, Outbound sind Pilot-Risiken.

Erfolg: A-Record zeigt auf die LAN-IP, gültiges Zertifikat (ein Name, kein Portal-SAN),
`h2`, SSE nicht am HTTP/1.1-Limit, Repair ohne Neuausstellung, Cutover mit
HTTP→HTTPS-Redirect, zweites LAN-Gerät erreicht den Host.
Manager-Abnahme: [`plan-proxy-tls-manager.md`](plan-proxy-tls-manager.md).

## Tests

Keine fortlaufenden produktiven Let's-Encrypt-Zertifikate.

1. Unit/Fakes (Setup-Vertrag, Canonical, Forwarded-Header, `verify-dns`)
2. Pebble, sobald Caddy startet (erster Cutover darf headless sein)
3. Staging manuell vor Releases
4. Eine produktive Abnahme für einen Host `*.lan.notaus.de` (Testdomain). Produktzone
   später `*.lan.praxis-flow.de`.

## Umsetzungsreihenfolge

1. Vertrag und Fakes (ID/Token, Hostname, Canonical-HTTPS, `verify-dns`)
2. Setup-API (managed: `prepare` … `obtain-certificate` … `apply`; custom:
   `prepare` … `custom-certificate` … `check-certificate` … `apply`)
3. Proxy-Runtime (Image, 443, Redirect auf 80, State, Cookies) + Pebble
4. Manager — Mailtext an den Betreiber, Diagnose, zweites Gerät
   [`plan-proxy-tls-manager.md`](plan-proxy-tls-manager.md)
5. Pilot
6. Produkthärtung (Backup inkl. Caddy-State in `.pfbackup`, HSTS)
7. Internet-Portal (eigener Host, eigenes Cert, Allow-VHost)

## Offene Entscheidungen

Keine offenen Architektur-Punkte. Manager-Rest (zweites Gerät QR vs. Haken):
[`plan-proxy-tls-manager.md`](plan-proxy-tls-manager.md).

## Referenzen

- [Caddy Automatic HTTPS](https://caddyserver.com/docs/automatic-https)
- [Caddy `reverse_proxy`](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy)
- [Caddy ACME-DNS-Plugin](https://github.com/caddy-dns/acmedns)
- [Let's Encrypt: Challenge Types](https://letsencrypt.org/docs/challenge-types/)
- [Let's Encrypt Pebble](https://github.com/letsencrypt/pebble)
- [`realtime-streams.md`](realtime-streams.md)

## Umsetzung erst nach dem Kunden-Test

Scope: [`roadmap.md`](roadmap.md).
