# Plan: Vertrauenswürdiges TLS im Praxis-LAN

Stand: 2026-08-25

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
Hostname:     7fk3m2.lan.notaus.de
A-Record:     192.168.178.112
Praxisserver: feste IPv4, keine Portfreigabe
Client:       normaler Browser, keine Installation
```

Kein Präfix `praxis-` — die URL bleibt kurz. DNS legt der Betreiber **manuell und
zeitversetzt** an: der Manager erzeugt einen **Mailtext**, den die Praxis an den
Betreiber schickt. Es gibt keine automatische DNS-API. Die Praxis richtet eine feste IPv4
beziehungsweise DHCP-Reservierung ein. Blockiert der Router öffentliche DNS-Namen mit
privaten Zieladressen, richtet die Praxis eine **gezielte** DNS-Rebind-Ausnahme ein.
Praxis Flow betreibt keinen eigenen DNS-Resolver.

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

| Rolle | Aufgabe |
| --- | --- |
| **Betreiber** | öffentliche DNS-Zone, A-Record je Installation, isolierte DNS-01-Berechtigung; kein Produkt-Register |
| **Praxisserver** | feste private IPv4, Praxis Flow und Caddy, lokaler Schlüssel und Zertifikats-State |
| **Manager / Setup** | Installations-ID und Einmal-Token erzeugen, IPv4 bestätigen, Cutover, Diagnose |
| **Client** | normaler Browser, vorhandene DNS-Infrastruktur, HTTPS direkt zum Praxisserver im LAN |

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
- Default-Label: **6 Zeichen** aus der ID, lesbares Alphabet, kein Präfix `praxis-`.
- Die Praxis kann im **selben Namensschritt** den Vorschlag nutzen, ein eigenes Label
  setzen oder eine **eigene Domain** angeben. Nach `apply` ist der Hostname fest.
- ACME-Delegation bleibt an der Installations-ID (`7fk3m2q9.acme.notaus.de`), nicht am
  sichtbaren Namen.
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

Der Manager erzeugt einen **kopierbaren Mailtext** (Betreff, Records, ID, Token,
bestätigte LAN-IP). Die Praxis schickt ihn an den Betreiber. Der Betreiber legt
A-Record und ACME-Challenge **manuell** an — das darf Tage dauern. Die Praxis muss
keinen DNS-Anbieter kontaktieren. `verify-dns` / TLS-`apply` warten unter Netzwerk;
der Rest der Installation (Vorschau, Host-Apply) läuft auf HTTP weiter.

### Optional: Domain der Praxis

Dieselbe TLS-Strecke, Entscheidung im Namensschritt. Die Praxis kontrolliert den
A-Record und richtet einmalig die ACME-CNAME-Delegation ein. Der Betreiber verwaltet
nur die wechselnden TXT-Werte am delegierten Ziel und bekommt eine kürzere Mail
(Freischaltung, kein A-Record in `lan.notaus.de`):

```text
flow.praxis-meyer.de.                         A      192.168.178.112
_acme-challenge.flow.praxis-meyer.de.         CNAME  7fk3m2q9.acme.notaus.de.
```

### Eigenes Zertifikat

`tls-custom` akzeptiert PEM-Fullchain und privaten Schlüssel. PFX ist nicht v1.
Notausgang für professionell verwaltete Netze, nicht der Standardweg.

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

Let's Encrypt bleibt die CA (kein ZeroSSL-Fallback). Outbound zu Let's Encrypt und zur
ACME-DNS-Instanz ist nötig. Pilot-ACME-DNS: später betriebene Instanz unter
`*.acme.notaus.de`; bis dahin eine vom Betreiber gewählte Instanz (kein Produktzwang
auf `auth.acme-dns.io` in der UI).

## Aufgabenverteilung

**Betreiber**

- Mail aus dem Manager entgegennehmen (kein Automatismus, kein Register)
- zeitversetzt A-Record auf die bestätigte IPv4 setzen
- DNS-01-Challenge isoliert je Installation ermöglichen
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
LAN-Gerät**.

Wenn erforderlich, wird ausschließlich der konkrete Host freigegeben:

```text
7fk3m2.lan.notaus.de
```

Nur wenn der Router keine exakte Ausnahme zulässt: kleinste Subdomain `lan.notaus.de`.
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

```text
prepare → verify-dns → obtain-certificate → apply → status
repair  → State behalten
reset-tls → warnend, State löschen
```

`verify-dns` ist Gate für TLS, nicht für den Rest der Installation.

Cutover:

1. Hostname festlegen (6-Steller oder Wunsch-Label); **Mailtext** erzeugen; warten,
   bis der Betreiber den A-Record auf die **bestätigte** LAN-IP gesetzt hat.
2. Öffentlichen A-Record prüfen (`verify-dns`, vom Praxisserver aus).
   Auflösung auf einem zweiten LAN-Gerät kann Setup nicht messen.
3. Zertifikat per DNS-01 holen, **während HTTP weiter verfügbar bleibt**.
4. Lokal HTTPS prüfen: Zertifikat, h2, App und ein SSE-Tick.
5. Erst danach `CANONICAL_BASE_URL` und Geräte-URLs auf HTTPS umstellen.
6. Port 80 auf ausschließlich 301 → HTTPS umstellen.

Bei Fehler vor Schritt 5 bleiben Canonical und HTTP-Proxy unverändert. TLS-State bleibt
für `repair`. `POST /host/network` darf einen aktiven TLS-Modus nicht auf HTTP
zurücksetzen und Canonical nicht auf `http://` umschreiben.

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
- ACME-CNAME zeigt auf das vereinbarte TXT-Ziel
- optional: Auflösung über den Windows-Resolver dieses PCs (kann von Fritzbox-Clients
  abweichen — kein Ersatz für das zweite Gerät)
- nach `obtain-certificate`: Zertifikatskette und Name, lokal TCP 443, h2, ein SSE-Tick

Nicht vom Server prüfbar — Bestätigung der Praxis, erst sinnvoll nach Zertifikat
und Cutover:

- Hostname löst auf einem zweiten LAN-Gerät auf
- `https://<hostname>` lädt dort ohne Zertifikatswarnung

Rebind-Filter der Fritzbox zeigt sich typisch nur auf anderen DHCP-Clients, nicht
zuverlässig auf dem Host. Deshalb: Hinweis und manuelle Checkbox, kein grüner Haken
von `verify-dns`.

Fehlermeldungen unterscheiden A-Record-Fehler, Rebind (von der Praxis gemeldet),
externen DNS-Filter, Client-Isolation, Firewall, belegten Port 443, falsche Uhrzeit,
ACME-Fehler und Zertifikatsnamensfehler.

## Backup und Restore

Zu sichern: TLS-/Hostnamen-Konfiguration, installationsbezogene ACME-Berechtigung,
Caddy `/data` und `/config`, Custom-Zertifikate. Restore für **dieselbe
Installations-ID und denselben Hostnamen**. Repair ist idempotent; `reset-tls` ist die
warnende Löschaktion.

`.pfbackup` v1 kennt nur Settings und `.env` — keinen Dateibaum. Im Pilot Caddy-State
**separat** sichern. Env mit `tls-managed` / `https://` ohne State nicht restaurieren
(sonst HTTPS tot). Vollständiges Paket in `.pfbackup`: Produkthärtung nach dem Pilot.
Windows: ACLs statt `chmod 0600`.

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

Hostname-Beispiel `7fk3m2.lan.notaus.de`. Keine Portweiterleitung. Caddy-State behalten.
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
4. Eine produktive Abnahme für einen Host `*.lan.notaus.de`

## Umsetzungsreihenfolge

1. Vertrag und Fakes (ID/Token, Hostname, Canonical-HTTPS, `verify-dns`)
2. Setup-API (`prepare` … `obtain-certificate` … `apply`)
3. Proxy-Runtime (Image, 443, Redirect auf 80, State, Cookies) + Pebble
4. Manager — Mailtext an den Betreiber, Diagnose, zweites Gerät
   [`plan-proxy-tls-manager.md`](plan-proxy-tls-manager.md)
5. Pilot
6. Produkthärtung (ACME-DNS-Betrieb, Backup inkl. Caddy-State, HSTS)
7. Internet-Portal (eigener Host, eigenes Cert, Allow-VHost)

## Offene Entscheidungen

1. Welche ACME-DNS-Instanz der Betreiber im Pilot für die TXT-Delegation nutzt
   (`server_url` / Zone, z. B. `acme.notaus.de` vs. öffentliche Instanz). Nicht in der
   Praxis-UI.

Custom-TLS-Datei-UX: [`plan-proxy-tls-manager.md`](plan-proxy-tls-manager.md).

## Referenzen

- [Caddy Automatic HTTPS](https://caddyserver.com/docs/automatic-https)
- [Caddy `reverse_proxy`](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy)
- [Caddy ACME-DNS-Plugin](https://github.com/caddy-dns/acmedns)
- [Let's Encrypt: Challenge Types](https://letsencrypt.org/docs/challenge-types/)
- [Let's Encrypt Pebble](https://github.com/letsencrypt/pebble)
- [`realtime-streams.md`](realtime-streams.md)

## Umsetzung erst nach dem Kunden-Test

Scope: [`roadmap.md`](roadmap.md).
