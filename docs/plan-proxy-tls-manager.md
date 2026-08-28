# Plan: Manager — LAN-TLS

Stand: 2026-08-27

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
3. Texte je Variante: Zone des Betreibers → eine Mail an den Betreiber (A + CNAME,
   Let's Encrypt). Eigene Domain → PEM einlesen und A-Record, kein ACME.
4. Assistent endet bei Mail beziehungsweise PEM-Staging. Vorschau/Apply mit HTTP.
   Warten (Tage) und `verify-dns` unter **Netzwerk**; danach Zertifikat holen
   (managed) beziehungsweise gestagtes PEM lokal prüfen (custom), HTTP bleibt;
   Cutover erst nach grünen lokalen Checks.
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

1. **Vorschlag** — 6 Zeichen unter `lan.notaus.de` (Testdomain; Default, neutral in
   CT-Logs; Alphabet ohne `0/O` `1/l/I`). Produkt später `lan.praxis-flow.de`.
2. **Eigenes Label** — DNS-Label, 1–63 Zeichen, `a–z` `0–9` Bindestrich, keine Umlaute;
   ersetzt den 6-Steller in derselben Zone
3. **Eigene Domain** — voller Hostname, DNS bei der Praxis

Nach `apply` ist der Hostname fest. ACME-CNAME hängt nicht am sichtbaren Namen.
PoC: Ziel aus `/register` (`{uuid}.auth.acme-dns.io`). Produkt:
`{id}.auth.acme.praxis-flow.de` (Beispiel:
`_acme-challenge.praxis-7fk3.lan.praxis-flow.de. CNAME 7fk3m2q9.auth.acme.praxis-flow.de.`).

**Happy Path (Betreiber-Zone, Let's Encrypt):** Name → feste IP → Mail an
`cert@notaus.de` (`mailto:`) → warten → Test → Zertifikat → Cutover.

**Eigene Domain:** dieselbe Namenswahl, nicht ein zweites Radioset. PEM einlesen
plus A-Record beim Domain-Anbieter (kein ACME-CNAME, keine Betreiber-Mail) →
`verify-dns` nur A → lokale Checks → Cutover (`tls-custom`).

**Kollision (Zone des Betreibers):** A-Record zeigt auf fremde IP → anderes Label, Mail
neu. Bei eigener Domain prüft `verify-dns` den A-Record der angegebenen Domain.

## Flächen

| Fläche            | Rolle nach TLS-Pilot                                                         |
| ----------------- | ---------------------------------------------------------------------------- |
| Assistent / Setup | bis Mailtext; dann Vorschau/Apply mit HTTP. Kein DNS-Warten im Wizard        |
| Netzwerk          | LAN-IP, Port 80 bis Cutover; **HTTPS-Fortsetzung**: Diagnose, Cert, Cutover  |
| Status            | Geräte-URLs (HTTP bis Cutover); Karte verweist auf Netzwerk, nicht Assistent |
| Manager-Start     | Ablaufprüfung; offenes HTTPS sichtbar, Resume = Netzwerk-Tab                 |

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
3. **Texte** je Variante — siehe unten. `mailto:` an `cert@notaus.de` nur in der
   Betreiber-Zone. Eigene Domain: PEM einlesen statt ACME-Mail. **Damit ist der
   Assistent mit HTTPS fertig.** Hinweis: DNS-Test, Zertifikat und Cutover folgen unter
   Netzwerk. Weiter zur Vorschau — noch ohne HTTPS.
4. Vorschau: HTTP-Geräte-URLs. Hinweis: nach abgeschlossener HTTPS-Config ändern sich
   die URLs; die weitere Einrichtung kann jetzt erfolgen.
5. Apply / Status wie bisher (HTTP).

Unter **Netzwerk**, sobald DNS da ist (kein Timeout, Tage sind normal):

6. **Diagnose** (`verify-dns`) — A-Record vom Praxisserver; ACME-CNAME nur Betreiber-Zone
   (eigene Domain: nur A). Zweites LAN-Gerät nicht in dieser Checkliste.
   - rot: warten (Normalzustand), Mail neu (IP/Label geändert), Fehlerklasse anzeigen
   - grün: **Zertifikat holen** (managed) beziehungsweise **Lokal prüfen** (custom)
     frei — nicht sofort Cutover
7. **Zertifikat** — Betreiber-Zone: `obtain-certificate`; eigene Domain:
   `check-certificate` mit dem im Wizard gestagten PEM. Busy, HTTP-Geräte-URLs
   unverändert.
   Danach lokale Checks: TCP 443, Kette/Name, HTTP/2, SSE.
   - rot: `tls.state = error`, HTTP unverändert, `repair` (State behalten) oder
     `reset-tls` (Strecke abbrechen)
   - grün: Warnung Portweiterleitung 443; Token in der Mail-Wiederholung **nicht**
     mehr; **Auf HTTPS umstellen** frei
8. **Cutover** (`apply`) — unwiderruflich. Canonical und Preview-URLs auf
   `https://<hostname>`; Hinweis neu anmelden / Geräte neu koppeln.
9. Status: Hostname, ID (kein Token), Aussteller, Ablauf — keine Secrets.
   **Rebind** nicht vorsorglich. Nur wenn der Test scheitert: Erklärung plus Schritte
   (Ausnahme nur für den Host, sonst kleinste Zone, Schutz nicht global aus, Gerät
   neu verbinden). Keine Portfreigabe 80/443. Nicht auf einen Routerhersteller
   beschränken. Gast-WLAN / privates DNS: Expander **Adresse für Terminal, TV
   und MFA** (`ReachabilityPanel.svelte`) — Copy noch offen (JSDoc), gilt schon
   ohne TLS.

## Wiedereinstieg (Netzwerk-Tab, nicht Assistent)

Ab dem Mailtext ist der Assistent mit HTTPS fertig. Warten auf DNS ist der Normalfall.
Erkennung darf **nicht** am Wizard-Schritt hängen.

**Persistenz:** `prepare` läuft nach festem Hostname, spätestens mit Mail-/PEM-Schritt
(Assistent verlässt HTTPS). Schreibt TLS-Zustand auf die Platte.
`GET /host/status` liefert ein `tls`-Objekt, analog zu `proxy` / `network`:

```text
tls.state:           off | preparing | awaiting-operator-dns | dns-verified
                     | obtaining-certificate | active | degraded | error
tls.mode:            managed | custom | null
tls.hostname:        7fk3m2.lan.notaus.de
tls.installationId:  7fk3m2q9
tls.tokenConsumed:   false
tls.applyReady:      false
tls.cutoverApplied:  false
tls.certificate:     { issuer, notBefore, notAfter, names } | null
tls.lastError:       { class, message } | null
```

Kein Token, kein Key. `PROXY_MODE` bleibt `http` bis zum Cutover — daran ist offenes
HTTPS **nicht** erkennbar. `setupEntryTone` bleibt `maintenance`, sobald die
Host-Einrichtung steht: offenes TLS ist kein fehlendes Docker/LAN.

`applyReady` ist das autoritative Gate der lokalen Checks. Nach erfolgreichem
`obtain-certificate` beziehungsweise `check-certificate` bleibt `state = dns-verified`,
aber `applyReady = true`. `cutoverApplied` unterscheidet insbesondere `error` vor und
nach dem Cutover. Der Renderer leitet keinen dieser Werte aus Zertifikat,
`PROXY_MODE` oder Wizard-Drafts ab.

Unvollständig: `tls.state` nicht `off` und nicht `active` (auch `degraded` /
`error` nach Cutover zählen als TLS-Thema, CTA bleibt Netzwerk).

**Fläche:** Status-Karte im Muster von SetupEntry. CTA öffnet den **Netzwerk**-Tab
(HTTPS-Block: Mail erneut, `verify-dns`, Cutover) — nicht den Install-Assistenten.
`POST /host/network` bleibt HTTP-LAN/Proxy; die TLS-State-Machine hängt nicht daran.

Health-Header bleibt **Betrieb**, wenn HTTP läuft. Kein „Einrichtung unvollständig“
wegen offenem DNS. Optional Kachel „HTTPS · wartet auf DNS“.

Erstinstall: Wizard vor Apply geschlossen → SetupEntry wie bisher. Nach Apply:
Status-Karte → Netzwerk.

„Später“ im Angebot ohne `prepare`: `tls.state = off`, keine Karte.

Zustände nur anzeigen, nicht als zweites Modell pflegen. Kanonisch:
Tabelle in [`plan-proxy-tls.md`](plan-proxy-tls.md) (nach `obtain`/`check` wieder
`dns-verified` mit `applyReady`; Cutover erst `apply` → `active`):

```text
off → preparing → awaiting-operator-dns → dns-verified
    → obtaining-certificate → dns-verified (applyReady) → apply → active
                    ↘ degraded / error → retry
```

`awaiting-operator-dns` ist der Normalzustand und darf **Tage** dauern. Kein Timeout,
der TLS oder das Setup abbricht. HTTP-Proxy und Geräte bleiben nutzbar. Die UI sagt
klar: bei Betreiber-Zone „Mail ist raus, DNS kommt vom Betreiber“; bei eigener Domain
„A-Record in Ihrem DNS, Zertifikat als PEM“.

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
_acme-challenge.7fk3m2.lan.notaus.de.   CNAME  a097455b-52cc-4569-90c8-7a4b97c6eba8.auth.acme-dns.io.
```

**Eigene Domain** — A-Record zum Kopieren, PEM-Felder, kein Mailzwang:

```text
flow.praxis-meyer.de.                   A      192.168.178.112
```

Produkt später: Hostname `praxis-7fk3.lan.praxis-flow.de` nur in der Betreiber-Zone
(Let's Encrypt). Testdomain bleibt `lan.notaus.de`. Eigene Domain bleibt `tls-custom`.

`tls-custom` folgt aus **Eigene Domain**, nicht aus einem zweiten Schalter
Let's Encrypt / eigenes Zertifikat. Kein Dateipfad nach Docker.

Manager (Main): zwei Dateidialoge (Fullchain-PEM, Schlüssel-PEM) oder nacheinander,
Inhalt lesen, **im Prozess prüfen** (PEM, Schlüssel zur Kette, SAN = Hostname, Ablauf).
Dann `POST /host/tls/custom-certificate` mit den PEM-Strings. Setup schreibt nach
Install-Home als **inaktives Staging**; der Renderer und der Manager-State behalten
weder PEM noch Schlüssel. Caddy liest später nur diesen Pfad. Vor `apply` ist das
Zertifikat noch keine Geräte-Identität und Canonical bleibt HTTP.

Viertes HTTPS-Feld bei eigener Domain: Dateien einlesen plus A-Record-Copy.
Betreiber-Zone: Mail, kein PEM.

Nach Cutover: „Neues Zertifikat einlesen“ statt „Jetzt erneuern“ (Let's Encrypt).

## Diagnose in der UI

Zwei Blöcke, nicht vermischen.

**Setup vom Praxisserver** — zwei Listen, nicht eine:

`verify-dns` (Gate für „Zertifikat holen“ beziehungsweise „Lokal prüfen“):

- Server besitzt eine IPv4-Adresse
- feste IP / DHCP-Reservierung wurde bestätigt (Häkchen der Praxis, kein Scan)
- öffentlicher A-Record zeigt auf diese IP
- ACME-CNAME gesetzt (`tls-managed` / Betreiber-Zone; bei eigener Domain weglassen)

Nach `obtain-certificate` (Betreiber-Zone) beziehungsweise `check-certificate`
(gestagtes Custom-PEM) als Gate für Cutover:

- TCP 443 lokal, Kette/Name, HTTP/2, SSE

**Praxis bestätigt** (kein automatischer Haken, zweites Gerät ist unsichtbar):

- Nach Cutover: auf einem zweiten LAN-Gerät `https://<hostname>` ohne Warnung.

Beim Warten auf DNS diese Zeile nicht als prüfbares Item zeigen. Rebind-Hinweis
nur, wenn die Praxis den Fehler beschreibt oder nach dem Cutover die Checkbox offen
bleibt — dann Handlungsanweisung (Host, kleinste Zone, nicht global aus, WLAN neu),
nicht nur der Fehlername.

## Netzwerk-Tab unter TLS

HTTPS-Fortsetzung (Diagnose, Zertifikat, Cutover) lebt **hier**, sobald der Assistent
den Mailtext gezeigt hat — oder wenn der Assistent „Später“ gewählt hat: **Name,
Bestätigung und Mail ebenfalls hier**, nicht zurück in den Assistenten.

`POST /host/network` bleibt davon getrennt: keine TLS-State-Machine in diesem Save.
Zwei Aktionen, nicht vermischen:

- **Einstellungen übernehmen** — nur LAN-IP und Port 80, Canonical bleibt `http://`
- **HTTPS übernehmen** — Cutover (`apply`) nach grünem `obtain-certificate`
  beziehungsweise `check-certificate` und lokalen Checks, nicht nach allein grünem
  `verify-dns`

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
- neue IP übernehmen; **neuen Mailtext ohne Token** mit neuer A-Record-IP an den
  Betreiber. Delegation und Zertifikat bleiben. DHCP-Reservierung anpassen.

Warnung, unabhängig von Expander-Reihenfolge: gültiges Zertifikat plus Portweiterleitung
443 legt die ganze App ins Internet.

`repairProxy` am Network-Save bleibt HTTP-Reparatur. TLS-Repair läuft über
`POST /host/tls/repair`. Vor `apply`: sekundär „HTTPS-Vorbereitung verwerfen“
(`reset-tls`) mit Warnung. Nach `apply`: kein Button „zurück zu HTTP“; hartes
Zurücksetzen nur als „HTTPS-State neu ausstellen“ (gleiche ID, gleicher Host,
Canonical bleibt `https://`).

## Cutover in der UI

Nach erfolgreichem `apply`:

- Geräte- und Preview-URLs auf `https://<hostname>` (inkl. Raum-Panel, sobald in
  `DeviceUrls`)
- Portal-LAN unter diesem Host (`/portal`); kein zweiter Name im Pilot
- Hinweis: Sessions und Pairing sind ungültig (Cookies host-only, `SameSite=Strict`)
- Port 8080 nicht als LAN-URL (Loopback / Setup)
- Port 80 nicht als Geräte-URL (nur Redirect)
- Karte: Hostname, Installations-ID, Aussteller, Ablauf — kein Token
- Warnung Portweiterleitung 443 bleibt sichtbar, solange das Zertifikat existiert

## Zertifikat nach Cutover

Caddy renewt im Normalfall selbst. Die UI macht Fehler sichtbar.

| Lage                        | `tls.state` | Fläche                                                                   |
| --------------------------- | ----------- | ------------------------------------------------------------------------ |
| gültig, Ablauf > 21 Tage    | `active`    | Karte, kein Alarm                                                        |
| bald abgelaufen (≤ 21 Tage) | `degraded`  | Warnung + „Jetzt erneuern“ (`renew`)                                     |
| abgelaufen oder Renew tot   | `error`     | „Zertifikat ist abgelaufen und muss jetzt erneuert werden.“              |
| A-Record/IP stimmt, Cert ok | `active`    | —                                                                        |
| LAN-IP veraltet, Cert ok    | `degraded`  | alte IP behalten **oder** neue + Mail **ohne** Token (Delegation bleibt) |

„Jetzt erneuern“ ist kein zweites Cutover. Canonical bleibt `https://`.

## Backup in der Wartung

Bestehende Fläche „Praxis-Backup (.pfbackup)“ bleibt. Kein Formatbruch in v1.

Sobald `tls.state ≠ off`: zweiter Block **HTTPS-State** (Pilot-Sidecar) — sichern /
prüfen. Dateiname `praxis-flow-tls-<timestamp>.tgz` im selben Backup-Ordner wie
`.pfbackup`. Electron-Main findet das Sidecar gleichen Zeitstempels, liest die Bytes
und übergibt den Inhalt an Setup; kein frei wählbarer Host-Pfad im Setup-Request.
Fehlt es bei bereits aktivem HTTPS, folgt der bestehende zweite Dateidialog und ohne
passende Datei `restoreSupported = false`. Bei einer nur vorbereiteten, noch auf HTTP
laufenden Strecke bleibt Restore erlaubt: klare Warnung, Vorbereitung wird auf `off`
gesetzt. Inspect-Zeile analog zu Routing/Portal.

Inspect verwirft widersprüchliche TLS-Metadaten: `active` / `degraded` verlangen
HTTPS-Canonical oder `PROXY_MODE=tls-*`; Snapshot und Sidecar brauchen jeweils eine
nichtleere Installations-ID und einen nichtleeren Hostnamen. Zwei fehlende Werte sind
kein Match. Dieses Gate kommt zusätzlich zu Archiv-, Settings- und
Maintenance-API-Prüfung.

## Ablaufprüfung

Beim **Manager-Start** und auf der TLS-Fläche:

- DNS ausstehend → Diagnose, kein Zertifikat, kein Cutover
- `dns-verified`, `applyReady = false`: managed → „Zertifikat holen“; custom mit
  gestagtem PEM → „Lokal prüfen“
- `dns-verified`, `applyReady = true`: lokale Checks anzeigen, „Auf HTTPS umstellen“
- `obtaining-certificate` → Busy, HTTP bleibt
- Bald abgelaufen (≤ 21 Tage) → Warnung plus Button „Jetzt erneuern“
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
- `obtain-certificate` (managed) beziehungsweise `check-certificate` (custom) vor
  `apply`; HTTP unverändert bei ACME-/Check-Fehler
- Token nach `obtain-certificate` nicht in der Mail-Wiederholung
- Ablauf warnend / abgelaufen / Renew-Aktion
- LAN-IP-Stale: beide Wahlwege; neue IP erzeugt neuen Mailtext ohne Token
- Restore: `.pfbackup` mit `https://` / `tls-*` ohne Sidecar blockiert
- Custom: PEM-Inhalt, SAN=Hostname, kein Dateipfad nach Docker; A-Record ohne ACME-CNAME

## Offene Punkte (nur Manager)

1. Wie der „zweites LAN-Gerät“-Check in der UI bestätigt wird (QR / manuell).

## Reihenfolge

Nach Setup-API-Vertrag in [`plan-proxy-tls.md`](plan-proxy-tls.md). Nicht vor dem
Kunden-Test bauen.

Statischer Wizard-Mock (nicht verdrahtet):
[`mocks/lan-tls-wizard/README.md`](mocks/lan-tls-wizard/README.md)
(`tls-model.js` ist die portable Vorlage für `wizard-flow.ts`).
