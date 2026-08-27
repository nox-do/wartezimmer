# Plan: Manager — LAN-TLS

Stand: 2026-08-25

Status: **UI- und Manager-Anforderungen zum LAN-TLS-Pilot, nicht Kunden-Test.**
Architektur, Compose, Setup-API und ACME: [`plan-proxy-tls.md`](plan-proxy-tls.md).
HTTP-Ist: [`../manager/README.md`](../manager/README.md), Netzwerk-Tab.

TLS ist keine Erweiterung der Port-80-Checkbox. Eigene Strecke, eigener Zustand.
**Voraussetzung:** Port 80 (HTTP-Proxy) muss an sein. Ohne Proxy entfällt der
HTTPS-Schritt im Assistenten; unter Netzwerk startet HTTPS erst, wenn Port 80 an ist.
DNS und Zertifikat dürfen dauern. Ab dem Mailtext ist der Assistent mit HTTPS fertig
und geht mit HTTP weiter; `verify-dns` und Cutover leben unter **Netzwerk**.

Es gibt kein Zentral-Produkt. Installations-ID und Einmal-Token erzeugt **dieser
Manager während des Setups**. DNS legt der Betreiber **manuell und zeitversetzt** an:
der Manager erzeugt einen **Mailtext** (kopieren / als Mail öffnen), den die Praxis
an den Betreiber schickt. `verify-dns` wartet unter Netzwerk; der restliche Wizard
läuft auf HTTP weiter.

## Ist (Netzwerk-Tab)

- LAN-IP, Erreichbarkeit (LAN-IP / Rechnername / Custom-Host), Checkbox „Port 80“
- „Einstellungen übernehmen“ sendet immer `proxy: { enabled, httpPort: 80 }` und eine
  vom Draft gebaute `http://`-Canonical-URL → Setup schreibt `PROXY_MODE=http`
- Preview-/Geräte-URLs aus `CANONICAL_BASE_URL`
- Praxisname: Wizard-Schritt sagt heute „erst in Ops“; `.env`-Seed
  `PRACTICE_DISPLAY_NAME` ist optional. Der **TLS-Hostname hängt nicht am Praxisnamen**

## Ziel der Oberfläche

1. Managed TLS: ID + Token erzeugen; im Namensschritt **Vorschlag**, **eigenes Label**
   oder **eigene Domain**.
2. Bestätigung: feste IPv4 / DHCP-Reservierung; IPv4 und MAC anzeigen.
3. Texte je Variante: Zone des Betreibers → eine Mail an den Betreiber (A + CNAME).
   Eigene Domain → DNS-Records für die Praxis **und** Mail nur zur ACME-Freischaltung.
4. Assistent endet bei der Mail. Vorschau/Apply mit HTTP. Warten (Tage) und
   `verify-dns` unter **Netzwerk**; Cutover erst nach grünem Test.
5. Nach Cutover Geräte-URLs nur `https://<hostname>`; Port 80 als Redirect, nicht als
   App-URL.
6. Netzwerk-Save darf TLS nicht zerstören.
7. Fehlerklassen sichtbar: A-Record, Rebind, externer DNS-Filter, Isolation, Firewall,
   Port 443, Uhrzeit, ACME, Zertifikatsname. Portweiterleitung 443 warnen.

## Nicht-Ziele (Manager)

- Keine freie Hostname-Wahl in der LAN-Reachability (Namenswahl nur in der TLS-Strecke)
- Keine TLS-State-Machine in `POST /host/network`
- Kein ACME-Passwort, Private Key oder Credential in der UI
- Kein Self-Hosting von ACME-DNS in dieser Oberfläche
- Kein Internet-Portal-VHost, kein vorsorglicher `portal.`-Name
- Keine Hosts-Datei als Anleitung im Happy Path
- Kein globales Abschalten des Router-Rebind-Schutzes

## Installations-ID und Hostname

Während der TLS-Strecke im Setup:

```text
Installations-ID: 7fk3m2q9
Vorschlag:        7fk3m2.lan.notaus.de
Eigenes Label:    seidel.lan.notaus.de
Eigene Domain:    flow.praxis-meyer.de
Einmal-Token:     (stark, nicht erneut anzeigen nach Verbrauch)
```

Die ID ist stabil und kein Geheimnis. **Im selben Schritt** wählt die Praxis den Namen:

1. **Vorschlag** — 6 Zeichen unter `lan.notaus.de` (Default, neutral in CT-Logs)
2. **Eigenes Label** — ersetzt den 6-Steller in derselben Zone
3. **Eigene Domain** — voller Hostname, DNS bei der Praxis

Nach `apply` ist der Hostname fest. ACME-Delegation bleibt an der ID
(`7fk3m2q9.acme.notaus.de`), unabhängig vom sichtbaren Namen.

**Happy Path (Betreiber-Zone):** Name → feste IP → Mail an Betreiber → warten → Test →
Zertifikat → Cutover.

**Eigene Domain:** Name → feste IP → Praxis legt A + `_acme-challenge`-CNAME selbst an
**und** Mail an den Betreiber nur zur Freischaltung des TXT-Ziels → warten → Test →
Cutover.

**Kollision (Zone des Betreibers):** A-Record zeigt auf fremde IP → anderes Label, Mail
neu. Bei eigener Domain prüft `verify-dns` den A-Record der angegebenen Domain.

## Flächen

| Fläche              | Rolle nach TLS-Pilot                                                    |
| ------------------- | ----------------------------------------------------------------------- |
| Assistent / Setup   | bis Mailtext; dann Vorschau/Apply mit HTTP. Kein DNS-Warten im Wizard |
| Netzwerk            | LAN-IP, Port 80 bis Cutover; **HTTPS-Fortsetzung**: Diagnose, Cert, Cutover |
| Status              | Geräte-URLs (HTTP bis Cutover); Karte verweist auf Netzwerk, nicht Assistent |
| Manager-Start       | Ablaufprüfung; offenes HTTPS sichtbar, Resume = Netzwerk-Tab |

## Aktivierung (Managed TLS)

Im **Assistenten** nur vorbereiten, dann mit HTTP weiter. Tests und Cutover unter
**Netzwerk**. Nur wenn Port 80 an ist; sonst HTTPS-Schritt überspringen. Der Wizard-Schritt
heißt **HTTPS** (nicht „geschützter Name“).

1. HTTPS vorbereiten. Setup erzeugt Installations-ID und Einmal-Token. **Adresse wählen:**
   Vorschlag, eigenes Label oder eigene Domain.
2. IPv4 und MAC anzeigen; Checkbox:
   „Ich bestätige, dass der Praxis-Flow-Server entweder eine statische IP oder einen
   statischen DHCP-Eintrag hat.“ Portfreigabe 80/443 bleibt ein eigener Warnhinweis,
   nicht Teil dieser Checkbox.
   Hinweis, wer den A-Record setzt (Betreiber vs. Praxis-DNS).
3. **Texte** je Variante — siehe unten. Kein Portal-Record. Token nach Verbrauch nicht
   erneut anzeigen. **Damit ist der Assistent mit HTTPS fertig.** Hinweis: DNS-Test,
   Zertifikat und Cutover folgen unter Netzwerk. Weiter zur Vorschau — noch ohne HTTPS.
4. Vorschau: HTTP-Geräte-URLs. Hinweis: nach abgeschlossener HTTPS-Config ändern sich
   die URLs; die weitere Einrichtung kann jetzt erfolgen.
5. Apply / Status wie bisher (HTTP).

Unter **Netzwerk**, sobald DNS da ist (kein Timeout, Tage sind normal):

6. **Diagnose** (`verify-dns` und Folgechecks) — Checkliste in
   [`plan-proxy-tls.md`](plan-proxy-tls.md). Zweites LAN-Gerät.
   - rot: warten (Normalzustand), Mail neu (IP/Label geändert), Fehlerklasse anzeigen
   - grün: `obtain-certificate` / `apply` frei
7. Cutover: Canonical und Preview-URLs auf `https://<hostname>`, Hinweis neu anmelden /
   Geräte neu koppeln.
8. Status: Hostname, ID (kein Token), Aussteller, Ablauf — keine Secrets.
   **Rebind** nicht vorsorglich. Nur wenn der Test scheitert: exakte Ausnahme des
   Hosts, sonst kleinste sinnvolle Zone (`lan.notaus.de` bzw. die Apex der Praxis-Domain).
   Keine Portfreigabe 80/443.

## Wiedereinstieg (Netzwerk-Tab, nicht Assistent)

Ab dem Mailtext ist der Assistent mit HTTPS fertig. Warten auf DNS ist der Normalfall.
Erkennung darf **nicht** am Wizard-Schritt hängen.

**Persistenz:** `prepare` (spätestens mit der Mail) schreibt TLS-Zustand auf die Platte.
`GET /host/status` liefert ein `tls`-Objekt, analog zu `proxy` / `network`:

```text
tls.state:           off | preparing | awaiting-operator-dns | dns-verified
                     | obtaining-certificate | active | degraded | error
tls.hostname:        7fk3m2.lan.notaus.de
tls.installationId:  7fk3m2q9
```

Kein Token, kein Key. `PROXY_MODE` bleibt `http` bis zum Cutover — daran ist offenes
HTTPS **nicht** erkennbar. `setupEntryTone` bleibt `maintenance`, sobald die
Host-Einrichtung steht: offenes TLS ist kein fehlendes Docker/LAN.

Unvollständig: `tls.state` nicht `off` und nicht `active`.

**Fläche:** Status-Karte im Muster von SetupEntry. CTA öffnet den **Netzwerk**-Tab
(HTTPS-Block: Mail erneut, `verify-dns`, Cutover) — nicht den Install-Assistenten.
`POST /host/network` bleibt HTTP-LAN/Proxy; die TLS-State-Machine hängt nicht daran.

Health-Header bleibt **Betrieb**, wenn HTTP läuft. Kein „Einrichtung unvollständig“
wegen offenem DNS. Optional Kachel „HTTPS · wartet auf DNS“.

Erstinstall: Wizard vor Apply geschlossen → SetupEntry wie bisher. Nach Apply:
Status-Karte → Netzwerk.

„Später“ im Angebot ohne `prepare`: `tls.state = off`, keine Karte.

Zustände nur anzeigen, nicht als zweites Modell pflegen:

```text
off → preparing → awaiting-operator-dns → dns-verified
    → obtaining-certificate → active
                    ↘ degraded / error → retry
```

`awaiting-operator-dns` ist der Normalzustand und darf **Tage** dauern. Kein Timeout,
der TLS oder das Setup abbricht. HTTP-Proxy und Geräte bleiben nutzbar. Die UI sagt
klar: bei Betreiber-Zone „Mail ist raus, DNS kommt vom Betreiber“; bei eigener Domain
„Records in Ihrem DNS plus Mail zur ACME-Freischaltung“.

### Mail- und DNS-Texte

**Zone des Betreibers** — eine Mail:

```text
Betreff: Praxis Flow TLS-DNS — 7fk3m2.lan.notaus.de

Installations-ID:  7fk3m2q9
Einmal-Token:      …
Hostname:          7fk3m2.lan.notaus.de
LAN-IP:            192.168.178.112

Bitte anlegen:

7fk3m2.lan.notaus.de.                   A      192.168.178.112
_acme-challenge.7fk3m2.lan.notaus.de.   CNAME  7fk3m2q9.acme.notaus.de.
```

**Eigene Domain** — zwei Blöcke:

1. Praxis-DNS (Copy, kein Mailzwang):

```text
flow.praxis-meyer.de.                   A      192.168.178.112
_acme-challenge.flow.praxis-meyer.de.   CNAME  7fk3m2q9.acme.notaus.de.
```

2. Mail an den Betreiber nur zur Freischaltung von `7fk3m2q9.acme.notaus.de` (kein
   A-Record in `lan.notaus.de`).

Custom-TLS (`tls-custom`): PEM zur gewählten Host-Identität. Ablauf (Upload vs. Pfad)
in dieser Datei nachziehen, sobald die Fläche steht.

## Diagnose in der UI

Zwei Blöcke, nicht vermischen.

**Setup vom Praxisserver** (`verify-dns` und Folgechecks nach dem Zertifikat):

- Server besitzt eine IPv4-Adresse
- feste IP / DHCP-Reservierung wurde bestätigt (Häkchen der Praxis, kein Scan)
- öffentlicher A-Record zeigt auf diese IP
- ACME-CNAME gesetzt
- nach Zertifikat: TCP 443 lokal, Kette/Name, HTTP/2, SSE

**Praxis bestätigt** (kein automatischer Haken, zweites Gerät ist unsichtbar):

- Nach Cutover: auf einem zweiten LAN-Gerät `https://<hostname>` ohne Warnung.

Beim Warten auf DNS diese Zeile nicht als prüfbares Item zeigen. Rebind-Hinweis
nur, wenn die Praxis den Fehler beschreibt oder nach dem Cutover die Checkbox offen
bleibt.

## Netzwerk-Tab unter TLS

HTTPS-Fortsetzung (Diagnose, Zertifikat, Cutover) lebt **hier**, sobald der Assistent
den Mailtext gezeigt hat — oder wenn der Assistent „Später“ gewählt hat: **Name,
Bestätigung und Mail ebenfalls hier**, nicht zurück in den Assistenten.

`POST /host/network` bleibt davon getrennt: keine TLS-State-Machine in diesem Save.
Zwei Aktionen, nicht vermischen:

- **Einstellungen übernehmen** — nur LAN-IP und Port 80, Canonical bleibt `http://`
- **HTTPS übernehmen** — Cutover nach grünem `verify-dns`

Geräte-URL: sobald ein TLS-Hostname vorgemerkt oder aktiv ist, keine parallele
HTTP-Identität (.local / eigene Domain) auf diesem Tab.

Sobald `PROXY_MODE` `tls-*` ist:

- Checkbox „Port 80“ ausblenden (App nicht mehr über HTTP; Redirect bleibt).
- `saveHostNetwork` sendet **kein** `proxy: { enabled, httpPort: 80 }` und **keine**
  neu gebaute `http://`-Canonical-URL.
- LAN-IP bleibt speicherbar.

LAN-IP weicht von der aktuellen Rechner-Adresse ab — die Praxis entscheidet, kein
stilles Umschreiben:

- alte IP wieder einstellen und selbst prüfen, oder
- neue IP übernehmen; **neuen Mailtext** mit neuer A-Record-IP an den Betreiber.
  Delegation und Zertifikat bleiben. DHCP-Reservierung anpassen.

Warnung, unabhängig von Expander-Reihenfolge: gültiges Zertifikat plus Portweiterleitung
443 legt die ganze App ins Internet.

`repairProxy` am Network-Save bleibt HTTP-Reparatur. TLS-Repair läuft über die
TLS-Strecke.

## Cutover in der UI

Nach erfolgreichem `apply`:

- Geräte- und Preview-URLs auf `https://<hostname>` (inkl. Raum-Panel, sobald in
  `DeviceUrls`)
- Portal-LAN unter diesem Host (`/portal`); kein zweiter Name im Pilot
- Hinweis: Sessions und Pairing sind ungültig (Cookies host-only, `SameSite=Strict`)
- Port 8080 nicht als LAN-URL (Loopback / Setup)
- Port 80 nicht als Geräte-URL (nur Redirect)

## Ablaufprüfung

Beim **Manager-Start** und auf der TLS-Fläche:

- DNS ausstehend → Diagnose, kein Cutover
- Bald abgelaufen → Warnung plus Button „Jetzt erneuern“
- Abgelaufen → „Zertifikat ist abgelaufen und muss jetzt erneuert werden.“

Caddy renewt im Normalfall selbst. Die UI macht Fehler sichtbar und anstoßbar.

## Tests (Manager)

Ohne öffentliche Let's-Encrypt-Anträge:

- ID/Token; Namensschritt: Vorschlag, Label, eigene Domain
- Mailtext Betreiber-Zone vs. zwei Blöcke bei eigener Domain
- Assistent Apply nicht von DNS abhängig; Test-Button unter Netzwerk hält TLS-Cutover zu
- IP-Bestätigung blockt Cutover ohne Haken
- Network-Save unter TLS ändert Modus und Canonical nicht
- Cutover-URLs, Pairing-Hinweis, kein Port-80-App-URL
- Ablauf warnend / abgelaufen / Renew-Aktion
- LAN-IP-Stale: beide Wahlwege; neue IP erzeugt neuen Mailtext

## Offene Punkte (nur Manager)

1. Alphabet des 6-Stellers (lesbar, ohne `0/O` `1/l/I`) und max. Länge Wunsch-Label.
2. Custom-TLS: Dateiauswahl PEM, Fehlermeldungen (Kette, Host, Ablauf).
3. Empfänger-Adresse für `mailto:` (Betreiber-Mail in der Produktkonfiguration).
4. Wie der „zweites LAN-Gerät“-Check in der UI bestätigt wird (QR / manuell).

## Reihenfolge

Nach Setup-API-Vertrag in [`plan-proxy-tls.md`](plan-proxy-tls.md). Nicht vor dem
Kunden-Test bauen.

Statischer Wizard-Mock (nicht verdrahtet):
[`mocks/lan-tls-wizard/README.md`](mocks/lan-tls-wizard/README.md)
(`tls-model.js` ist die portable Vorlage für `wizard-flow.ts`).
