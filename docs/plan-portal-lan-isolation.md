# Eingeschränkter Netzwerkzugang für das Patientenportal

Stand: 2026-09-13 · **Produktentscheidung; TLS-/Wildcard-Pfad umgesetzt und per
Pebble geprüft, Restricted-Binding weiter offen**

Verwandt: LAN-TLS [`operations/tls.md`](operations/tls.md) · Captive-Grenze
[`operations/integrations.md`](operations/integrations.md) · Manager-Topologie
`manager/src/renderer/network-topology-diagram.ts` (aktueller Ist-Stand noch
Captive-zentriert; im Rahmen dieses Plans zu ersetzen) · detaillierter
[Manager-Umbau](plan-manager-restricted-network-access.md) · aufbereitete
[Hinweise für die Praxis-IT](operations/praxis-it-network-isolation.md).

---

## 1. Entscheidung

Der Manager schafft eine generische technische Grenze für **eingeschränkt
erreichbare Funktionen**. Im ersten Produktfall ist das ausschließlich das
lokale Patientenportal. Der empfohlene, vor Produktfreigabe vollständig zu
prüfende Standardweg verwendet dafür einen **eigenen physischen
Netzwerkanschluss** am Praxis-Flow-Host:

- **NIC 1 — interne Zone / Praxis-LAN:** Mitarbeiter-, Geräte- und
  Administrationsoberflächen.
- **NIC 2 — eingeschränkte Zone / Patientennetz:** in v1 ausschließlich das
  Patientenportal auf HTTPS.

Die zusätzliche Host-IP heißt in diesem Dokument **Restricted-IP**. Für
Portal-v1 ist sie zugleich die Ziel-IP des Portal-A-Records. Der Manager
verwaltet also nicht die fachliche Portal-Funktion, sondern das Binding dieser
eingeschränkten Zone. Weitere Funktionen dürfen später dieselbe technische
Grundlage verwenden, brauchen aber jeweils eine explizite, versionierte
Hostname-/Routenfreigabe im Produktcode.

Die Praxis stellt die zweite NIC sowie das daran angeschlossene, vom Praxis-LAN
getrennte Patientennetz. Das kann ein vorhandener Gastnetz-Port, ein isolierter
AP-/Router-Port oder ein untagged VLAN-Port sein. Praxis Flow liefert keinen
Router, Access Point, DHCP-Server, Internetzugang oder Captive-Datenpfad.

Der Manager vergleicht nur die vom Betriebssystem gemeldeten Interfaces. Liegen
Staff- und Restricted-IP auf demselben Interface, warnt er deutlich vor der
fehlenden Netztrennung. Dieser **Same-NIC-Warnpfad** bleibt nach ausdrücklicher
Bestätigung erlaubt — vor allem für Demos und Installationen ohne zweite NIC.
Er ist kein technischer Blocker und keine Isolationszusage. Das gilt auch für
eine zweite IP im selben Staff-Subnetz. Der Status bleibt dauerhaft
`eingerichtet mit Warnung — keine getrennte NIC`; die Zusage aus §11 gilt dort nicht.

Bei verschiedenen Interfaces bestätigt die Praxis, dass das gewählte
Restricted-Interface für das Patientennetz vorgesehen ist. Ob AP, Router oder
Gastnetz darüber hinaus zur Staff-IP oder ins Praxis-LAN routen, sieht der
Manager nicht; das bleibt Praxis-IT und ist keine Voraussetzung für das
Restricted-Binding.

`https://staff.<installationsraum>/portal` bleibt **dauerhaft** die interne
Vorschau im Praxis-LAN (Demo, Test, Mitarbeiter). Das ist kein Patienten-WLAN-
Weg. Der Einstieg über das Restricted-Binding ist
`https://portal.<installationsraum>`. Der Portal-Hostname auf der Staff-IP
bleibt abgewiesen; der Staff-Hostname auf der Restricted-IP ebenfalls.

`portalEnabled` bleibt ausschließlich die fachliche Ops-Einstellung der App.
Der Manager führt keinen zweiten Portal-Schalter ein. Ist das Restricted-
Binding eingerichtet, die Portal-Funktion in Ops aber ausgeschaltet, bleibt der
Netzweg technisch vorhanden und die App weist Portalaktionen wie heute ab.

Das ist die Sicherheitsgrenze:

> Praxis Flow veröffentlicht auf der ausgewählten Restricted-IP nur explizit
> freigegebene Funktionen — in v1 den Portal-Origin —, leitet keinen
> Netzwerkverkehr zwischen den Anschlüssen weiter und macht Abweichungen von
> der empfohlenen Zwei-NIC-Isolation sichtbar.

---

## 2. Warum diese Variante

Die bisher diskutierte Fritzbox-Ausnahme „Gastnetz darf genau einen LAN-Host auf
TCP 443 erreichen“ ist kein belastbarer Regelfall. Ein vollständig isoliertes
Gastnetz erreicht den Praxisserver nicht; im gemeinsamen Praxisnetz fehlt
dagegen jedes Signal „Patient vs. Mitarbeiter“.

Ein zweiter Hostname allein löst das nicht. `Host`, TLS-SNI und Browser-Origin
sagen, **welche** Oberfläche angefordert wird, aber nicht, **wer** sie anfordert.
Der Zwei-NIC-Standardweg ergänzt zwei produktseitig bind- und prüfbare
Merkmale:

1. die Ziel-IP, an der der Proxy lauscht;
2. das eingehende Netzwerk-Interface, auf das die Host-Firewall filtern kann.

Damit bleibt die Wahl der WLAN-/Router-Technik bei der Praxis, während wir die
Exposition unseres Hosts selbst begrenzen und prüfen können. Die Same-NIC-
Ausnahme nutzt dagegen nur eine zweite Ziel-IP sowie getrennte Origin-/Listener-
Regeln. Sie besitzt keine eigene Interfacegrenze und liefert deshalb
ausdrücklich keine Netzisolationszusage.

---

## 3. Zieltopologie

```text
Praxis-LAN                                      Patientennetz
Terminal / MFA / TV                            Patienten-Handy
        │                                             │
        ▼                                             ▼
NIC 1: 10.0.0.20                               NIC 2: 192.168.50.2
staff.<installationsraum>                      portal.<installationsraum>
        │                                             │
        ▼                                             ▼
Staff-Listener                                  Portal-Listener
alle freigegebenen Staff-Pfade                  nur Portal-Allowlist
        └──────────────────► App ◄────────────────────┘
                          intern/Loopback

Zwischen NIC 1 und NIC 2: keine Bridge, kein IP-Forwarding, kein ICS/NAT.
```

Die App bleibt ein Kern mit einer SQLite-Datenbank. Es entstehen keine zweite
Installation und keine zweite fachliche Datenhaltung. Die Portal-Freigabe ist
ein eng begrenzter Reverse-Proxy-Pfad zur bestehenden App, keine allgemeine
Netzweiterleitung.

---

## 4. Verantwortungsgrenze

| Rolle                        | Verantwortet                                                                                                                                                                                  | Verantwortet nicht                                                                                                          |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| **Praxis / Praxis-IT**       | empfohlen: zweite NIC; physisch oder logisch getrenntes Patientennetz; DHCP/WLAN; optional Internet und Captive; statische Restricted-IP bzw. Reservierung; Client-Test aus dem Patientennetz | Caddy-Routen, Container-Ports, Host-Listener oder Praxis-Flow-Firewallregeln                                                |
| **Praxis Flow**              | generisches Binding der eingeschränkten Zone; Host-Firewall; kein Forwarding; explizite Funktions-Allowlist; DNS-/TLS-Zuordnung; Installations- und Laufzeitprüfung; verständliche Diagnose   | Router/AP konfigurieren; VLANs erzeugen; DHCP/NAT für Patienten betreiben; Isolation des übrigen Praxisnetzes zertifizieren |
| **Patientennetz-Komponente** | Clients zur Restricted-IP routen bzw. im selben Segment anbinden; Adressen vergeben; optional Internetzugang                                                                                  | Pfade innerhalb der Praxis-Flow-App unterscheiden                                                                           |

Im empfohlenen Zwei-NIC-Standardweg erfüllt ein einfacher Access Point, der nur
das normale Praxis-LAN überbrückt, die Isolationsanforderung **nicht**. Nutzt die
Praxis bewusst den Same-NIC-Warnpfad, ist ein solcher Aufbau eine unterstützte
Abweichung ohne Isolationszusage und kein Fehler unseres
Origin-/Listener-Vertrags.

### 4.1 Empfohlene Netzplatzierung

Praxis Flow sollte aus Sicht der Praxis-IT wie eine **DMZ-/Applikationslösung**
behandelt und nach Möglichkeit auf einem dedizierten Host beziehungsweise in
einem eigenen internen Applikationssegment platziert werden. Von dort werden nur
die ausdrücklich benötigten Staff- und Portalzugänge sowie notwendige
ausgehende Ziele freigegeben. Eine allgemeine Vertrauensstellung gegenüber PVS,
NAS, Druckern oder dem übrigen Praxis-LAN ist nicht erforderlich.

Der heutige Kernbetrieb benötigt keine pauschale Verbindung zu anderen Systemen
im Praxisnetz. Eine solche Verbindung dient allenfalls Komfortfunktionen wie der
Übernahme beziehungsweise Freigabe von Kontakten; diese kann auch manuell
erfolgen. Wird eine Integration genutzt, sollte die Praxis-IT nur das konkrete
Ziel und Protokoll freigeben, nicht das gesamte Praxis-LAN.

Diese Platzierung ist eine Empfehlung und keine Voraussetzung für das Binding. Installation auf
einem vorhandenen Windows- oder macOS-Rechner bleibt unterstützt, besitzt aber
einen größeren gemeinsamen Angriffsbereich als ein dedizierter Host oder ein
separates Applikationssegment.

Eine weitergehende Trennung in Portal- und Core-VM wäre eine eigene
Produktarchitektur und keine von der Praxis-IT ausführbare Härtungsoption des
heutigen Stacks. Ein möglicher Hyper-V-Ausblick samt Voraussetzungen und
Betriebsfolgen ist deshalb nur als Discovery in den
[Praxis-IT-Hinweisen](operations/praxis-it-network-isolation.md#stufe-c--getrennte-portal--und-core-vms-discovery)
dokumentiert.

---

## 5. Adressen, Hostnamen und Wildcard-Zertifikat

### 5.1 Zwei IPs, zwei Origins

Jede Installation erhält einen eigenen DNS-Unterraum. Für die Betreiberzone ist
das Zielbild:

```text
Installationsraum: <installations-id>.<operator-zone>

Staff-Origin:  https://staff.<installationsraum>   → Staff-IP / interne Zone
Portal-Origin: https://portal.<installationsraum>  → Restricted-IP / eingeschränkte Zone
```

Beispiel:

```text
staff.7fk3m2.lan.notaus.de   A 10.0.0.20
portal.7fk3m2.lan.notaus.de  A 192.168.50.2
```

Beide öffentlichen A-Records zeigen auf die jeweilige **private IPv4**. Der
Staff-Origin wird damit gegenüber dem bisherigen Zielbild
`<installations-id>.<operator-zone>` um eine `staff.`-Ebene ergänzt. Da bisher
nur Testinstallationen existieren, ist dafür keine automatische Migration oder
Abwärtskompatibilität vorgesehen; alte Testeinträge können manuell entfernt
werden.

Ein Hostname mit zwei A-Records ist kein Ersatz: Clients könnten zufällig die
falsche NIC wählen. Split-DNS ist ebenfalls nicht Teil des Standardwegs.

### 5.2 Ein Wildcard-Zertifikat pro Installation

Managed TLS verwendet ein Zertifikat für den installationsbezogenen Wildcard:

```text
*.<installations-id>.<operator-zone>
```

Das Zertifikat gilt damit für `staff.<installationsraum>` und
`portal.<installationsraum>`. Let’s Encrypt stellt Wildcard-Zertifikate per
DNS-01 aus; das passt zum bestehenden Caddy-/`acme-dns`-Weg. Pro Installation
bleiben **ein Zertifikat, ein ACME-DNS-Account und ein Challenge-CNAME**:

```text
_acme-challenge.<installationsraum>
  CNAME <account>.auth.acme-dns.io
```

Es kommen zwei A-Records hinzu, aber kein zweiter ACME-DNS-Account und kein
zweiter Challenge-CNAME. Es gibt **keinen** portal-spezifischen ACME-CNAME
(`_acme-challenge.portal.<installationsraum>` wäre falsch und unnötig). Der
eine CNAME unter `_acme-challenge.<installationsraum>` deckt die Wildcard-Order
ab und damit beide Namen. Caddy muss den Wildcard-Namen ausdrücklich verwalten
und das Zertifikat auf dem getrennten Staff- und Portal-Listener verwenden.

**Restricted-Binding und Portal-DNS später, Zertifikat nicht extra erneuern:** Bei der Grundeinrichtung
werden Staff-A-Record, Wildcard-CNAME und Wildcard-Zertifikat angelegt. Der
Portal-A-Record kommt erst bei der Einrichtung des eingeschränkten Zugangs
(zweite, kurzlebige Operator-Mail, nur dieser A-Record). Ob diese spätere
Strecke einen verifizierten Autorisierungsnachweis benötigt und wie dieser
geprüft wird, ist noch festzulegen; der heutige lokale Mail-Korrelationswert
leistet das nicht. Weil `portal.<raum>` schon
unter `*.<raum>` liegt, ist dafür **kein** ACME-Renew und kein zweiter CNAME
nötig. Ein Renew nur „weil Portal dazukommt“ wäre Verschwendung und
Rate-Limit-Risiko. Custom-PEM muss beide Namen oder den Wildcard bereits vor
der Einrichtung des Restricted-Bindings enthalten (§5.2 Gate); sonst neues PEM, kein Let’s-
Encrypt-Renew.

Die Zertifikatsautomatisierung darf dabei ausschließlich den Namen
`*.<installationsraum>` bestellen und erneuern. `staff.<installationsraum>` und
`portal.<installationsraum>` sind nur Host-/SNI-Matcher, keine eigenständigen
ACME-Bestellnamen. Insbesondere darf der Generator nicht still ein Exact-Name-
Zertifikat für `staff.<installationsraum>` anfordern: Dessen DNS-01-Challenge
läge unter `_acme-challenge.staff.<installationsraum>` und wäre durch den oben
beschriebenen CNAME nicht gedeckt. Der Pebble-Smoke prüft genau einen
`newOrder`-Request und als einzigen Zertifikatsnamen `*.<installationsraum>`;
er schlägt fehl, sobald daneben ein Exact-Name-Zertifikat beantragt wird.

Für eine eigene Praxis-Domain (Custom) gilt das Zwei-Namen-PEM-Gate **erst bei
Einrichtung des Restricted-Bindings**. Bis dahin reicht das eine heutige Zertifikat für den
einen Staff-FQDN. Fehlt dabei der Portal-Name im PEM, blockiert
der Manager; ein späterer TLS-Fehler ist dafür kein zulässiger Warnzustand.

Die Labels `staff` und `portal` sind im Manager, Setup und Operatorpfad für
diese System-Origins reserviert und dürfen nicht als Installationslabel
vergeben werden.

Der Wildcard schafft Raum für spätere Origins, zum Beispiel einen gesonderten
Geräte- oder Integrationsendpunkt. Er ist **keine Wildcard-Freigabe am Proxy**:
Jeder neue Hostname braucht weiterhin einen expliziten Listener-/Host-Matcher;
unbekannte SNI-/`Host`-Werte werden verworfen.

`CANONICAL_BASE_URL` wird im **Managed**-Pfad die Staff-/Gerätebasis
`https://staff.<installationsraum>`. Für das Portal ist ein separates
`PORTAL_BASE_URL=https://portal.<installationsraum>` beziehungsweise
gleichwertiger persistierter Zustand erforderlich.

**Custom (eigene Domain)** bleibt beim TLS-Umbau ein einzelner Hostname wie
heute. Es gibt dort keine erzwungenen `staff.`/`portal.`-Prefixes und kein
Wildcard-PEM, solange kein Restricted-Binding eingerichtet ist. `CANONICAL_BASE_URL` bleibt
`https://<der-eine-name>`.

Bei der Einrichtung des eingeschränkten Zugangs bleibt dieser Staff-FQDN
unverändert (kein Geräte-Recutover). Die Praxis wählt für dessen ersten
Konsumenten einen zusätzlichen Host-Prefix
(Vorschlag im Eingabefeld: `portal`); der Portal-Hostname ist
`<prefix>.<bisheriger-fqdn>`. DNS trägt die Praxis selbst ein: **A-Record auf
die Restricted-IP**. Ein CNAME auf den Staff-Namen würde Portal-Traffic auf die
Staff-IP legen und ist unzulässig. Ob das Zertifikat ein Wildcard oder zwei
konkrete SAN-Namen ist, bleibt Sache der Praxis. Der Manager prüft nur, dass
das PEM beide Namen deckt. Namenskollisionen in ihrer Zone behandeln sie selbst.

Das Single-Hostname-Modell der Betreiberzone ist dafür seit 2026-09-13 auf
folgenden persistenten TLS-Vertrag umgestellt (`TLS_HOSTNAME` und
`TlsStatus.hostname` bleiben als Staff-Kompatibilitätsalias erhalten):

```text
installationDomain   (managed: <id>.<zone>; custom: leer / nicht genutzt)
staffHostname        (managed: staff.<raum>; custom: der eine FQDN)
portalHostname       (managed: portal.<raum>, auch bevor A-Record existiert;
                      custom: leer bis zur Einrichtung des Restricted-Bindings)
wildcardCertificateName  (managed: *.<raum>; custom: leer)
staffIp              (im TLS-Schritt weiterhin die bestätigte LAN-IP)
restrictedBindIp     (noch nicht umgesetzt; folgt mit Restricted-Binding)
```

Neue **Managed**-Installationen erhalten Staff-Hostname und Wildcard-Zertifikat
bereits bei der Grundeinrichtung, auch wenn noch kein Restricted-Binding
eingerichtet ist. Dessen spätere Einrichtung ergänzt dann Portal-A-Record,
Restricted-IP und Portal-Listener, ändert aber weder Staff-Hostname noch
Staff-Origin. Legacy-Zustände ohne die neuen Felder werden weiterhin als
Exact-Hostname gelesen und lösen nicht still eine neue Wildcard-Order aus.
Testinstallationen können für das neue Zielbild manuell neu angelegt werden.

Backup und Restore führen Installationsraum, beide Hostnamen und
Wildcard-Identität bereits im Sidecar-Manifest v2 und prüfen sie beim Restore
konsistent. Ausgewählte IP-Bindings und Restricted-Network-Zustand folgen mit
dem Restricted-Binding. Ein Restore-Test mit aktivem Portal bleibt Teil der
Produktfreigabe.

Die Operator-Strecke wird dafür inkrementell: Die Grundeinrichtung fordert
Staff-A-Record und Wildcard-Challenge-CNAME an. Die spätere Einrichtung des
eingeschränkten Zugangs erzeugt für dieselbe Installations-ID einen neuen,
kurzlebigen Vorgang nur für den Portal-A-Record. Falls dafür ein echter
Autorisierungsnachweis eingeführt wird, braucht er eine unabhängige Prüfung;
der heutige unverifizierte Mail-Korrelationswert wird dafür nicht als Sicherheit
angerechnet. Eine neue ACME-Registrierung oder ein zweiter Challenge-CNAME ist
nicht erforderlich.

### 5.3 Eingeschränkte Netzwerkzone in v1

- **Zwei-NIC-Standardweg:** feste private Restricted-IPv4 in einem anderen, nicht
  überlappenden Subnetz; Portal-Clients liegen in diesem Segment;
- **Same-NIC-Warnpfad:** eine zweite, lokal bindbare IPv4; sie darf im selben
  Staff-Subnetz oder in einem zusätzlichen Subnetz liegen. Beides liefert nur
  IP-/Origin-Trennung, keine nachgewiesene Netztrennung;
- die Restricted-Network-Konfiguration fügt in beiden Fällen **kein Default-Gateway** und
  keinen DNS-Server hinzu; die Standardroute bleibt ausschließlich die
  Staff-Konfiguration;
- IPv6-Adressen auf Staff- oder Restricted-NIC sind **kein** Einrichtungsblocker.
  Der Portal-Listener bindet in v1 nur die gewählte IPv4. Phase 0 verbietet
  Publishes auf `[::]`/`:::`. Der F1-PoC muss belegen, dass trotzdem kein
  Portal-/Staff-Port über IPv6 von außen erreichbar ist. Ein IPv6-Patientennetz
  als gleichwertiger Pfad ist nicht v1.

Ein überlappendes Subnetz auf zwei **verschiedenen** Interfaces wird wegen
mehrdeutiger Host-Routen blockiert. Geroutete Patientennetze, mehrere getrennte
Patientensubnetze und IPv6 sind spätere Erweiterungen, nicht Teil des ersten
Wurfs.

---

## 6. Proxy- und Portgrenze

### 6.1 Phase 0: Wildcard-Publishes vor dem Restricted-Binding beseitigen

Der heutige Stack ist noch kein sicherer Ausgangspunkt: App und Proxy werden je
nach Betriebsart ohne Host-IP auf `0.0.0.0:8080`, `0.0.0.0:80` beziehungsweise
`0.0.0.0:443` veröffentlicht. Sobald eine zweite NIC angeschlossen ist, sind
diese Ports deshalb auch dort erreichbar, **bevor** die eingeschränkte Zone
eingerichtet wird.

Die erste Umsetzungsetappe ist daher eine allgemeine Härtung des
Auslieferungsstacks, unabhängig vom Restricted-Network-Zustand:

- kein IPv4- oder IPv6-Delivery-Publish ohne explizite Host-IP; insbesondere
  weder `0.0.0.0:*` noch `[::]:*` beziehungsweise `:::*`;
- ohne Proxy: App höchstens `<staff-ip>:8080:8080`, niemals `0.0.0.0:8080`;
- mit Proxy: App nur `127.0.0.1:8080:8080`, Proxy-Ports nur auf der Staff-IP;
- Maintenance bleibt `127.0.0.1:8082`;
- Docker-/Proxy-Neustart verweigern, wenn eine erforderliche Bind-Adresse fehlt
  oder nicht mehr lokal vorhanden ist.

Der heutige Statusvertrag reicht für dieses Audit nicht aus:
`publishedPortsFromRow` reduziert Docker-Publishes auf `number[]` und verwirft
damit Host-IP, Container-Zielport und Protokoll. Phase 0 erweitert
`ComposeServiceStatus` deshalb um die tatsächlichen Laufzeit-Bindings, mindestens

```text
hostIp + publishedPort + targetPort + protocol
```

Die Daten werden aus `docker compose ps --format json` einschließlich
`Publishers[].URL` gelesen und, wo Docker Desktop dies nicht eindeutig liefert,
mit `docker inspect` (`HostIp`/`HostPort`) verifiziert. `0.0.0.0`, leere
Wildcard-Angaben sowie `::`/`[::]` werden normalisiert und als globale Bindung
erkannt. Eine reine Portnummer darf keine Sicherheitsentscheidung mehr
begründen. Geprüft wird der tatsächlich laufende Container, nicht nur die
beabsichtigte Compose-Datei.

Die Einrichtung des Restricted-Bindings setzt den TLS-Proxy und die
Loopback-Bindung der App voraus.
Setup prüft diese Phase-0-Grenze schon im normalen Staff-Betrieb; der Manager
zeigt das Ergebnis. Eine zusätzliche NIC darf keinen App-, HTTP-, HTTPS-,
Debug- oder Maintenance-Port erben. Damit hängt die Absicherung nicht davon ab,
dass jemand rechtzeitig ein Restricted-Binding einrichtet.

Diese Härtung wird auf Windows und macOS erst ausgerollt, nachdem das F1-Gate
in §6.3 auf der jeweiligen freigegebenen Docker-Desktop-Version bestanden hat
(Compose-Host-IP, Host-Firewall und externer Scan). Die Umstellung sichert den
bisherigen Compose-Zustand, erzeugt und validiert die neue Konfiguration, legt
den betroffenen Proxy-Container neu an und prüft Staff von außen. Schlägt
Bindung, Firewall oder Probe fehl, wird der alte Compose-Zustand
wiederhergestellt. Bis zur Plattformfreigabe bleiben Portal und der Betrieb mit
einer zusätzlichen NIC gesperrt; eine ungeprüfte Phase-0-Mutation darf eine
bestehende Staff-Installation nicht unterbrechen.

### 6.2 Getrennte Host- und Container-Listener

Ein Caddy-`bind <host-ip>` **innerhalb eines Docker-Bridge-Containers** ist keine
wirksame Host-IP-Grenze: Docker-DNAT liefert Verbindungen an eine
Containeradresse und erhält die ursprüngliche lokale Host-Ziel-IP nicht als
Caddy-Listeneradresse. Deshalb werden Staff und Portal über verschiedene
Container-Ports getrennt:

```text
Host-Publish                         Caddy intern
<staff-ip>:80  → proxy:80            Staff-HTTP/Redirect
<staff-ip>:443 → proxy:443           Staff-Server + Staff-Host-Matcher
<restricted-ip>:443 → proxy:444      Restricted-Server + Portal-Host-Matcher
```

Es gibt keine Publish-Regel `:80`, `:443` oder `0.0.0.0:*` ohne Host-IP. Der
Restricted-Server auf dem internen Port 444 terminiert extern weiterhin normales
HTTPS auf Port 443. Beide Server verwenden das installationsbezogene
Wildcard-Zertifikat, haben aber getrennte Host-Matcher und Handler. Diese
Trennung ist Teil der generierten Caddy-Konfiguration; SNI allein ist keine
Netzgrenze.

Caddys automatische HTTPS-Konfiguration darf dabei keinen zusätzlichen
Portal-Handler auf dem Staff-Server oder einen Staff-Handler auf dem
Portal-Server erzeugen. Falls der Caddyfile-Adapter diese Trennung nicht
eindeutig abbildet, wird die Serverstruktur als Caddy-JSON generiert. Vor jedem
Reload oder Proxy-Recreate wird die adaptierte/effektive Konfiguration geprüft:
Staff-Routen (einschließlich interner `/portal`-Vorschau) dürfen nur am
internen Listener 443 hängen, der Patienten-Portal-Origin nur am internen
Listener 444. Zertifikatsverwaltung und Request-Routing werden dabei als
getrennte Belange behandelt.

Auf der Restricted-IP gilt für den ersten freigegebenen Konsumenten:

- TCP 443 ist der einzige erforderliche eingehende Port.
- Port 80 bleibt geschlossen; der ausgegebene QR-Code enthält immer `https://`.
- Unbekannte SNI-/`Host`-Werte werden verworfen.
- Verbindungen ohne SNI und Requests ohne passenden `Host` treffen auf keinem
  der beiden Ports einen Staff-Defaultserver, sondern werden abgebrochen.
- Der Staff-Hostname auf der Restricted-IP liefert keine Staff-UI und keine API.
- Der Portal-Hostname auf der Staff-IP liefert kein Patientenportal.
- UI-Navigation außerhalb `/portal` wird nicht nur umgeleitet, sondern
  abgewiesen.
- Nicht freigegebene APIs liefern 403/404, niemals einen Browser-Redirect.
- App, Manager, Maintenance und Debug-Ports bleiben Loopback bzw.
  Docker-intern.
- Keine veröffentlichten Docker-Ports auf `0.0.0.0` oder der Restricted-IP außer
  dem expliziten Restricted-Listener.

Die Positivliste ist ein eigener, ausführbarer Vertrag aus HTTP-Methode und
exaktem beziehungsweise parametrisiertem Pfad für die tatsächlich vom Portal
verwendeten UI-Assets, Session-, Upload- und Formularrouten. Das allgemeine
`public: true` aus `route-access-rules.ts` darf nicht als Ersatz dienen: Dort
sind auch Login-, Pairing- und Ops-Routen öffentlich markiert, die auf dem
Portal-Origin nichts zu suchen haben. Generator und Integrationstests verwenden
dieselbe Portal-Positivliste als Quelle. Ein Negativtest läuft über den gesamten
App-Routenkatalog und weist nach, dass jede nicht gelistete Route auf dem
Portal-Listener abgewiesen wird. Eine Präfixfreigabe wie `/api/*` ist
unzulässig; ohne vollständige Liste gibt es keine Portal-v1-Freigabe.

**v1-Enforcement ist Caddy**, nicht die App. Die App bleibt ein Kern und prüft
den Portal-Origin in v1 nicht extra (Staff unter `staff.` inklusive `/portal`
unverändert). Ein App-Gate aus derselben Liste ist spätere Defense-in-Depth,
sobald der Portal-Listener existiert. Voraussetzung bleibt Phase 0: App nicht
auf der Restricted-IP erreichbar.

Staff-/Geräte-Session-Cookies bleiben host-only: Es wird kein
`Domain=.<installationsraum>` gesetzt. Das entspricht dem heutigen Cookie-Code
und wird als Regressionstest für die getrennten Origins festgeschrieben.

Rate-Limits müssen hinter Caddy den ursprünglichen Client unterscheiden. Der
heutige Fastify-Start ohne `trustProxy` würde andernfalls nur die gemeinsame
Docker-/Caddy-Adresse als `request.ip` sehen. v1 vertraut Proxy-Header deshalb
nur für den eindeutig festgelegten Caddy-Hop; Caddy überschreibt eingehende
Forwarding-Header, bevor er die verifizierte Client-IP weitergibt. Eine globale
Freigabe beliebiger `X-Forwarded-For`-Werte ist unzulässig. Integrationstests mit
mindestens zwei Client-IPs sowie einem gespooften Header weisen nach, dass
Limits weder praxisweit zusammenfallen noch umgangen werden können.

CORS bleibt zusätzliche Browser-Härtung, aber keine Zugriffsgrenze. Maßgeblich
sind Ziel-IP, Interface, Host-Firewall, SNI/Host und die Proxy-Allowlist.

Die Umsetzungstests müssen die gekreuzte Matrix prüfen: Staff- und Portal-SNI
jeweils gegen Staff- und Restricted-IP sowie unbekanntes SNI gegen beide IPs. Docker
Port-Inspection und ein externer Scan müssen bestätigen, dass keine weitere
Publish-Regel existiert.

### 6.3 F1 — Erreichbarkeit erzwingen, nicht nur publizieren

Die Praxis-Hosts sind **Windows und macOS mit Docker Desktop**. Portal, App,
Sandbox und Proxy bleiben gemeinsam in diesem Stack; es ist weder ein
Linux-Host noch ein ausgelagerter Portal-Rechner vorgesehen.
`network_mode: host` ist nicht der Produktweg.

**F1 (Produktanforderung):** Auf der freigegebenen Windows- und
macOS-/Docker-Desktop-Kombination müssen Portal- und Staff-Endpunkte
nachweisbar und fail-closed ausschließlich aus den vorgesehenen Segmenten
erreichbar sein — unabhängig davon, wie Docker Desktop Port-Publishing intern
umsetzt. Compose-Binding ist ein Mechanismus von F1, nicht die
Sicherheitsarchitektur.

#### Binding ist Spezifikation, nicht Isolationsgrenze

Compose `HOST_IP:HOST_PORT:CONTAINER_PORT` (zum Beispiel
`<staff-ip>:443:443` und `<restricted-ip>:443:444`) **soll** laut Docker nur diese
Host-IP publizieren. Unterstützt die Engine Host-IP-Mapping nicht, soll Compose
das Mapping ablehnen. Das ist die gewünschte Expositionskonfiguration und
gehört in Phase 0.

Docker Desktop implementiert dasselbe **nicht** wie natives Linux-Host-NAT.
Die Engine läuft in einer Linux-VM; eingehende Verbindungen auf Windows und
macOS nimmt `com.docker.backend` entgegen und leitet in die VM weiter. Ein
erfolgreiches spezifisches Binding, `docker compose ps` oder `docker inspect`
beweist deshalb keine externe Erreichbarkeit und reicht nicht als
Sicherheitsnachweis.

Historisch gab es auf macOS Versionen, in denen Bind an eine LAN-IP mit
`cannot assign requested address` scheiterte, sowie Regressionen bei
Host-IP-/Port-Bindings und den gemeldeten Metadaten. Das ist PoC-Risiko, kein
generell zu erwartendes Verhalten der Form „Compose zeigt `10.0.0.20:443`, der
Host lauscht trotzdem auf `0.0.0.0:443`“. Tritt genau das reproduzierbar auf,
ist das Bug/Regression und fällt durch F1 — nicht spezifikationskonform.

Interface-/IP-Binding bleibt also nützlich, auf Docker Desktop aber **keine
hinreichende Netzwerk-Isolationskontrolle**.

#### Drei Ebenen

```text
                 Praxis-Host
           ┌─────────────────────┐
Patient ───┤ NIC / Restricted-IP │
           │   Host-Firewall     │
           │      ↓              │
           │ com.docker.backend  │
           │      ↓              │
           │ Docker-Desktop-VM   │
           │      ↓              │
           │ Caddy Portal :444   │
           │                     │
Staff ─────┤ NIC / Staff-IP      │
           │   Host-Firewall     │
           │      ↓              │
           │ com.docker.backend  │
           │      ↓              │
           │ Caddy Staff :443    │
           └─────────────────────┘
```

1. **Compose-Binding** — explizite Host-IP, interne Ports wie §6.2. Vermeidet
   unnötige Exposition; ohne passende Host-IP startet der Publish nicht.
2. **Host-Firewall** — produktive Enforcement-Grenze am Eingang von
   `com.docker.backend`. Restricted-NIC/IP: eingehend nur TCP 443 zum
   Restricted-Listener; Staff-Publishes auf dieser Adresse verboten. Staff-NIC/IP:
   Staff-HTTP/HTTPS wie vorgesehen; Portal-Listener dort verboten. Windows:
   Defender Firewall nach Local Address, Interface/Profil und Remote Network.
   macOS: paket- und interfacebezogen mit `pf`, nicht die GUI-Application-
   Firewall. Linux-`DOCKER-USER` ist kein v1-Vertrag.
3. **Black-Box-Abnahme** — nicht Compose-PS, netstat oder inspect, sondern Scan
   und HTTPS-Proben von einem Patienten- und einem Staff-Client gegen die
   realen Host-IPs.

Ohne stabile Ebene 2 gilt F1 auf dieser Plattform als nicht erfüllt, auch wenn
Ebene 1 im PoC bindet. Schlägt F1 fehl, gibt es innerhalb dieses Plans keinen
stillen Fallback. Ein plattformnativer Edge-Proxy wäre eine eigene
Alternativarchitektur mit separater Entscheidung, Implementierung und Abnahme
für Portbelegung, TLS, Rechte, Packaging, Updates und Rollback. Bis dahin wird
die betroffene Plattform für das Portal nicht freigegeben; Linux ist keine
automatische Rückfalllösung.

#### Abnahmematrix (PoC und Freigabe)

Windows und macOS werden jeweils erst freigegeben, wenn die Suite auf der
festgelegten Mindest-Docker-Desktop-Version besteht. Zusätzlich: Weak-Host,
virtuelle Adapter, Loopback-App ohne LAN-Erreichbarkeit (Engine mit bekanntem
L2-Fix), gekreuzte SNI-/Ziel-IP-Matrix.

| Test                                  | Portal-Listener                                                         | Staff-Listener                |
| ------------------------------------- | ----------------------------------------------------------------------- | ----------------------------- |
| Patient → Restricted-IP               | erreichbar (nur Portal-Allowlist)                                       | abgewiesen                    |
| Patient → Staff-IP                    | abgewiesen                                                              | abgewiesen                    |
| Staff → Staff-IP                      | abgewiesen                                                              | erreichbar                    |
| Staff → Restricted-IP                 | nur falls das fremde Netz es routet; kein Host-Publish auf der Staff-IP | abgewiesen                    |
| nach Reboot / Docker-Desktop-Neustart | unverändert                                                             | unverändert                   |
| Restricted-NIC entfernt / IP weg      | fail-closed                                                             | Staff unverändert             |
| Staff-NIC entfernt / IP weg           | Portal unverändert, sofern Restricted-IP bleibt                         | fail-closed für Staff-Publish |
| DHCP-/Adresswechsel                   | fail-closed                                                             | fail-closed                   |
| IPv6                                  | kein `[::]`-Publish; PoC: Port von außen über IPv6 zu                   | dasselbe                      |

IPv6 auf der Karte darf existieren. Ohne explizite Host-IP publiziert Docker
oft zusätzlich `[::]`. Phase 0 und der PoC müssen das ausschließen; eine
IPv6-Adresse allein sperrt das Portal nicht.

---

## 7. Keine Weiterleitung zwischen den Netzen

„Ping geht nicht“ ist kein ausreichender Nachweis. ICMP kann blockiert sein,
während TCP oder IPv6 weiterhin funktionieren. Außerdem besitzt ein Dual-Homed
Host zwangsläufig lokale Routen zu beiden direkt angeschlossenen Subnetzen.

Wir müssen stattdessen verhindern:

- IPv4- und IPv6-Forwarding;
- Betriebssystem-Netzwerkbrücken, an denen Staff- oder Restricted-Interface
  beteiligt sind;
- Internet Connection Sharing, RRAS, NAT oder vergleichbare Dienste zwischen
  den ausgewählten Interfaces;
- Forwarding-Regeln zwischen Staff- und Restricted-Interface;
- Listener auf der falschen IP;
- Docker-Regeln, die die Host-Firewall umgehen;
- Antworten auf Staff-Dienste, wenn Pakete über das Patienten-Interface
  eintreffen.

Die Host-Firewall (F1-Ebene 2) filtert nach **eingehendem Interface, lokaler
Zieladresse und Zielport**, nicht nur nach Ziel-IP. Das ist insbesondere bei
Betriebssystemen mit schwachem Hostmodell wichtig, die lokal konfigurierte
Adressen nicht strikt einem Eingangsinterface zuordnen. Sie muss den Verkehr
zum Docker-Desktop-Backend treffen, nach Reboot fortbestehen und darf nicht
durch neu erzeugte Publish-Regeln umgangen werden. Maßgeblich bleibt der
externe Scan aus beiden Netzen.

---

## 8. Setup- und Laufzeitprüfungen

### 8.1 Lokale Prüfungen

Setup prüft die Publish-Grenze bereits im Staff-Betrieb und wiederholt die
vollständigen Prüfungen beim Einrichten des Restricted-Bindings, bei jedem
Stack-Start und nach erkannten Netzwerkänderungen. Der Manager zeigt Ergebnisse
und Aktionen an, ist aber nicht selbst die Sicherheitsinstanz:

1. freigegebene Kombination aus Windows/macOS und Docker-Desktop-Version;
2. keine IPv4-/IPv6-Docker-Publishes auf `0.0.0.0`, `[::]`/`:::` oder einer
   unerwarteten Host-IP;
3. App abhängig vom Modus nur auf Staff-IP oder Loopback;
4. stabile, eindeutig ausgewählte Staff- und Restricted-Adressen samt Interface-ID;
5. ob die Restricted-IP auf einem anderen gemeldeten Interface liegt oder nur eine
   zweite Adresse des Staff-Interface ist;
6. bei verschiedenen Interfaces: unterschiedliche, nicht überlappende
   Subnetze; beim selben Interface: Überlappung als ausdrücklicher Warnzustand;
7. Standardroute nur über die Staff-Konfiguration;
8. kein zusätzliches Gateway und kein DNS durch die Restricted-Network-Konfiguration;
9. kein IPv4-/IPv6-Forwarding und keine Bridge-/ICS-/NAT-Verbindung zwischen
   den ausgewählten Staff- und Restricted-Interfaces; interne Docker-Desktop-Netze
   sind kein Fehlerzustand;
10. erwartete Host-Firewallregeln aktiv;
11. tatsächliche Host-Publishes und getrennte Container-Listener je IP und Port;
12. Portal-SNI nur auf Restricted-IP erfolgreich;
13. Staff-SNI und bekannte Staff-/Admin-Pfade auf Restricted-IP abgewiesen;
14. Portal-SNI auf der Staff-IP abgewiesen; `/portal` unter Staff-SNI bleibt
    als interne Vorschau erlaubt;
15. Wildcard-Zertifikat gültig und für Staff- sowie Portal-Namen passend;
16. weder am Staff- noch am Portal-Listener ein Default-Fallback ohne passendes
    SNI/`Host`.

Eine nicht mehr bindbare oder nicht mehr eindeutig zuordenbare Restricted-IP ist
**fail-closed**: Der Restricted-Listener startet nicht beziehungsweise wird
geschlossen. Der interne Staff-Betrieb bleibt verfügbar. Adapterwechsel,
Adressänderungen und neue Default-Routen dürfen nicht still akzeptiert werden.

Eine zweite Adresse auf demselben gemeldeten Interface ist dagegen ein
**Warnzustand**, kein technischer Blocker (Demos, fehlende zweite NIC). Der
Manager erklärt, dass dabei keine getrennte Interfacegrenze vorhanden ist.
Liegt sie im Staff-Subnetz, weist er zusätzlich darauf hin, dass Staff-IP und
andere Geräte im selben LAN erreichbar sein können. Ohne ausdrückliche
Bestätigung startet kein Restricted-Listener. Die Warnung bleibt im
Restricted-Network-Status sichtbar.

### 8.2 Optionale Prüfung durch die Praxis

Der Host kann lokal nicht beweisen, was ein externer AP oder Router tatsächlich
routet. Diese Netzkonfiguration liegt in der Verantwortung der Praxis
beziehungsweise ihrer IT und ist keine Voraussetzung für das
Restricted-Binding von Praxis Flow.

Der Manager kann nach dem Anwenden des Bindings einen QR-Code und eine kurze optionale
Prüfhilfe anzeigen:

- `https://portal.<installationsraum>` vom Patienten-WLAN aus öffnen;
- bei Bedarf prüfen, ob Staff-Hostname, Staff-IP oder andere Praxisgeräte aus
  diesem WLAN erreichbar sind.

Das ist ein Vorschlag zur Unterstützung der Praxis, keine von Praxis Flow
durchgeführte oder zertifizierte Netzabnahme. Das Ergebnis ändert weder den
Restricted-Network-Status noch unsere Produktzusage. Im Same-NIC-Warnpfad
bleibt unabhängig davon der Status `eingerichtet mit Warnung — keine getrennte
NIC` sichtbar.

---

## 9. Manager-Strecke

Der Manager verwaltet keine fachliche Portal-Aktivierung. Er stellt unter
**Netzwerk → Eingeschränkter Netzwerkzugang** die technische Grundlage bereit:
eine zusätzliche Host-IP, das zugehörige Interface, Listener-/Firewall-Binding
und die Prüfung der festen Expositions-Policy. Das Patientenportal ist in v1
der einzige lesbar angezeigte, durch den Produktcode freigegebene Konsument.

Die fachliche Einstellung `portalEnabled` bleibt in Ops. Der HTTPS-Bereich des
Managers verwaltet Namen und Zertifikat. Der Restricted-Bereich zeigt fehlende
TLS-/DNS-Voraussetzungen nur als Blocker oder Verweis und implementiert keinen
zweiten TLS-Flow. Ein zusätzlicher Haupt-Tab und eine frei konfigurierbare Liste
extern erlaubter Funktionen sind nicht vorgesehen.

Die detaillierte UI-, Controller-, DTO- und Setup-API-Planung steht in
[`plan-manager-restricted-network-access.md`](plan-manager-restricted-network-access.md).

### 9.1 Erkennung und Auswahl der Restricted-IP

Vor dem Einrichten ermittelt Setup alle lokal konfigurierten, bindbaren
IPv4-Adressen und gruppiert sie nach dem vom Betriebssystem gemeldeten
Interface. Die Auswahl zeigt nur Interface-Name, IPv4/CIDR und Linkstatus –
vergleichbar mit der Service-Bindung üblicher NAS-Oberflächen. VLANs, Bonds,
Bridges, USB-, Docker-, VPN- und andere Adapter erscheinen so, wie das
Betriebssystem sie bereitstellt; Praxis Flow versucht nicht, ihre
Hardwaretopologie zu erraten. Erkennbare virtuelle Adapter (docker, vEthernet,
utun/VPN, Tethering) werden nicht ausgeblendet, tragen aber einen Warnhinweis
und brauchen eine Bestätigung.

Nicht angeboten werden Loopback und Link-Local, die Staff-IP, widersprüchlich
belegte Adressen sowie Adressen auf einem anderen Interface mit überlappendem
Staff-Subnetz. Bei einem anderen Interface bestätigt die Praxis dessen Nutzung
für das Patientennetz. Eine zweite Adresse auf demselben Interface bleibt als
Same-NIC-Warnpfad auswählbar und verlangt eine ausdrückliche Bestätigung.

Entscheidend ist nicht die Adapterbezeichnung, sondern der tatsächliche
Bind-Test: Der Restricted-Host-Publish wird ausschließlich an die gewählte
Adresse gebunden, während der übrige Stack an Staff-IP oder Loopback bleibt.
Praxis Flow erfindet oder scannt keine vermeintlich freie Adresse. **Erneut
prüfen** liest die Kandidaten neu ein; eine Neuinstallation ist nicht nötig.

### 9.2 Binding anwenden

1. Plattform-/Docker-Desktop-Freigabe, Phase-0-Publishes und TLS-Proxy prüfen.
2. Restricted-IP auswählen und den getrennten oder Same-NIC-Pfad bestätigen.
3. Host-Firewallregeln und lokale Publish-/Listenergrenze vorbereiten.
4. Portal-A-Record auf die Restricted-IP ergänzen; vorhandenes Wildcard-
   Zertifikat beziehungsweise Custom-PEM-Abdeckung prüfen.
5. Caddy- und Compose-Konfiguration sichern, erzeugen und offline validieren.
6. `restricted-ip:443 → proxy:444` mit der festen Portal-Positivliste durch
   Neuerzeugen des Proxy-Containers transaktional anwenden.
7. Staff zuerst, anschließend Restricted-Binding und Portalpfad prüfen.

Offene DNS- oder Zertifikatsschritte verwerfen die gewählte Konfiguration
nicht. Bis alle blockierenden Sicherheitsprüfungen erfolgreich sind und
Warnungen bestätigt wurden, startet kein Restricted-Listener. Setup führt die
Operation aus und persistiert ihren Fortschritt; der Renderer projiziert nur
Zustand und Formularentwurf.

Bei einem Fehler stellt Setup Compose-, Proxy- und Firewallzustand wieder her,
erzeugt den Proxy erneut und prüft Staff. Eine kurze angekündigte Staff-
Unterbrechung ist zulässig, ein dauerhafter Staff-Ausfall nicht.

Der angezeigte Status unterscheidet mindestens:

- `nicht eingerichtet`;
- `nicht unterstützt — Hostplattform`;
- `gesperrt — unsichere Docker-Portfreigabe`;
- `vorbereitet — DNS/Zertifikat offen`;
- `eingerichtet — getrennte NIC`;
- `eingerichtet mit Warnung — keine getrennte NIC`;
- `gesperrt — Netzkonfiguration unsicher`;
- `degradiert — Listener/DNS/Zertifikat`.

### 9.3 Binding entfernen und reparieren

Das Restricted-Binding kann nachträglich entfernt werden. Setup entfernt
transaktional Host-Publish, Restricted-/Portal-Listener und die von Praxis Flow
verwalteten Firewallregeln. App, fachliches `portalEnabled`, Staff-Publishes,
Staff-Origin und Wildcard-Zertifikat bleiben unverändert. Der Portal-A-Record
kann bestehen bleiben; ohne Listener antwortet der Host dort nicht.

Wird die gespeicherte Restricted-IP entfernt, der Adapter getauscht oder die
Adresse zur Staff-IP, schließt Setup den Restricted-Listener fail-closed. Der
Manager bietet erneute Auswahl beziehungsweise Reparatur an, ohne den
Staff-Stack neu einzurichten. Auch Entfernen und Reparatur verwenden Sicherung,
Probe und Rollback wie das erstmalige Anwenden.

---

## 10. Ausblick: Captive-Adapter (nicht Portal-v1)

Captive-Adapter sind nicht Teil von Portal-v1. Das Portal funktioniert ohne
Internetfreischaltung; Praxis Flow wird auch später weder Gateway noch
Captive-Datenpfad.

**Später:** eine von uns erweiterbare Liste schlanker Captive-Adapter mit
Auswahl im Manager — Grenze und Kurzvertrag:
[`operations/integrations.md`](operations/integrations.md); Entwurf im Archiv:
[`archive/roadmap-captive-portal-adapters.md`](archive/roadmap-captive-portal-adapters.md).

Damit wir den Weg nicht verbauen, bleiben `PORTAL_BASE_URL` und Portal-Origin
stabil und vendorneutral. Der persistierte Restricted-Network-Zustand erhält
keine Captive-Felder. Eine spätere Adapterkonfiguration und ihr Adapterstatus
bleiben davon getrennt. Captive-Einrichtung erst nach funktionierendem
Restricted-Binding und Portal-URL; unabhängig aktivier-, deaktivier- und
diagnostizierbar. Keine Gesundheitsdaten an Controller.

---

## 11. Bedrohungsmodell und akzeptiertes Restrisiko

Ein Patientengerät gilt als nicht vertrauenswürdig und darf den Portal-Origin
aktiv angreifen. Im empfohlenen Standardweg begrenzt die Zwei-NIC-Konfiguration
die von **unserem Host** über die Restricted-IP angebotenen Dienste und verhindert
dort Host-Forwarding. Ob das externe Patientennetz daneben einen anderen Weg
zur Staff-IP oder ins Praxis-LAN besitzt, liegt außerhalb dieser Produktgrenze.
Auch hostintern entsteht keine vollständige Trennung zweier Anwendungen: Portal
und Staff verwenden weiterhin denselben App-Kern.

Akzeptiertes Restrisiko:

- Eine echte Codeausführungsschwachstelle in Portal oder Backend könnte trotz
  Netzgrenze den gemeinsamen Host, die SQLite-Datenbank oder das Praxis-LAN
  gefährden.
- Portal-Daten können während einer aktiven Session im Speicher oder kurzzeitig
  auf Disk vorhanden sein, auch wenn keine langfristig wertvollen Bestände im
  Portal gehalten werden.
- Die kurze Anwesenheit eines Patienten reduziert die Gelegenheit, ist aber
  keine eigene Sicherheitskontrolle; Angriffe können automatisiert werden.

Das Risiko wird für den lokalen, nicht aus dem Internet erreichbaren Betrieb als
vertretbar akzeptiert, wenn mindestens gilt:

- kleine Proxy-Positivliste;
- kurze Portal-Sessions und kurze temporäre Datenhaltung;
- Größen-, Typ- und Anzahlgrenzen für Uploads;
- Rate-Limits pro Client und Session;
- keine Secrets oder Gesundheitsdaten in Logs;
- Container ohne Root, Docker-Socket und unnötige Capabilities;
- kein vom Patienten steuerbares Ziel für serverseitige Requests; App und
  Sandbox dürfen ausgehend nur fest konfigurierte, fachlich erforderliche
  Dienste erreichen;
- zeitnahe Sicherheitsupdates;
- App-/Host-Härtung bleibt unabhängig von der Netztrennung bestehen.

Diese Punkte sind Freigabekriterien, nicht nur Empfehlungen im
Bedrohungsmodell. Die Delivery-Konfiguration weist insbesondere Non-Root,
entfernte Linux-Capabilities, `no-new-privileges`, fehlenden Docker-Socket und
die tatsächlich notwendigen ausgehenden Ziele nach. Wo eine technische
Egress-Allowlist auf einem gemeinsam genutzten Praxis-PC nicht zuverlässig
durchsetzbar ist, reduziert die empfohlene DMZ-/Applikationsplatzierung aus §4.1
den erreichbaren Netzbereich; der Same-NIC-Warnpfad erhält daraus keine
zusätzliche Isolationszusage.

Technische Zusage für den geprüften Zwei-NIC-Standardweg:

> Praxis Flow veröffentlicht auf seiner ausgewählten Restricted-IP ausschließlich
> den getrennten Restricted-Listener mit der Portal-Positivliste und leitet auf dem Host keinen
> Verkehr zwischen Patienten- und Staff-Interface weiter. Staff-SNI und
> Staff-Pfade werden auf der Restricted-IP abgewiesen. Das Portal bleibt ein bewusst
> erreichbarer Anwendungseingang; das Restrisiko einer Anwendungsschwachstelle
> wird begrenzt, aber nicht ausgeschlossen.

Diese Zusage bestätigt **nicht**, dass AP, Router oder andere Wege im
Patientennetz den Zugriff auf die Staff-IP oder das übrige Praxis-LAN
verhindern. Das verantwortet die Praxis beziehungsweise Praxis-IT. Der externe
QR-/Kontrolltest ist lediglich eine optionale Prüfhilfe für diese und weder
Bestandteil der technischen Freigabeentscheidung noch eine Zertifizierung der
fremden Netzkonfiguration.

Bei Staff- und Restricted-IP auf demselben Interface gilt diese Zusage ausdrücklich
**nicht**. Praxis Flow kann dort die getrennte Origin-/Listener-Bindung und die
Portal-Positivliste prüfen, aber keine physische oder logische Netztrennung
bestätigen. Der Pfad bleibt bewusst erlaubt (Bestätigung plus dauerhafter
Warnstatus), weil Demos und Ein-NIC-Setups sonst ausgesperrt wären. Ein härteres
Gate würde fremdes Routing im Patientennetz ohnehin nicht sichtbar machen.

---

## 12. Nicht Teil dieser Entscheidung

- Cloud-/Internet-Portal oder öffentliche Portweiterleitung;
- Betrieb von Gesundheitsdaten durch einen externen Portal-Dienst;
- eigener Access Point, Router, DHCP-, DNS- oder Captive-Dienst;
- Fritzbox-spezifische Automatisierung;
- automatische Einstufung eines Clients als Patient allein anhand seines CIDR;
- gemeinsamer Origin mit pfadbasierter Patientenerkennung;
- Mini-PC als zweiter App-Kern oder zweite SQLite-Installation;
- IPv6-Patientennetz im ersten Wurf;
- vollständige Absicherung fremder PVS-, NAS- oder Druckersysteme.

---

## 13. Umsetzungsblöcke

Status der groben Blöcke:

- [x] **TLS-Fundament:** Dev-Proxy-Image gebaut; Managed- und Cutover-Smoke mit
      Pebble bestanden; genau eine ACME-Order für `*.<raum>`; Staff positiv sowie
      Portal-SNI und unbekannter Wildcard-Host negativ geprüft.
- [ ] **Gate 0 / F1-Machbarkeit:** explizite Host-IP-Publishes und die
      erforderliche Host-Firewall je freigegebener Plattform praktisch belegen.
- [ ] **Phase 0 / Staff-Binding:** bestehende Staff-Auslieferung ohne globale
      Publishes betreiben und ihren tatsächlichen Laufzeitzustand diagnostizieren.
- [ ] **Restricted-Binding:** zweite IP, Portal-A-Record, getrennter
      Portal-Listener, Portal-Positivliste und Firewallregeln einführen.
- [ ] **Portal-Härtung und Freigabe:** App-Vertrag, Runtime-Härtung,
      Plattformmatrix, Betriebsabnahme und Release-Tests abschließen.

Damit ist der TLS-Namensumbau technisch abgeschlossen. Delivery-Bindings und
Restricted-Network-UI werden weiterhin nicht in einem Schritt verändert. Vor
der produktiven Ausrollung der Phase 0 muss Gate 0 auf den vorgesehenen
Windows-/macOS- und Docker-Desktop-Versionen bestanden sein.

Die verbleibenden Blöcke sind:

1. **F1-Machbarkeits-PoC:** zwei explizite Host-IP-Bindings auf Port 443,
   Defender beziehungsweise `pf`, benötigte Elevation, Firewall-Rollback und
   Black-Box-Scan aus beiden Netzen; außerdem Reboot, Adressverlust, IPv6 und
   Weak-Host-Verhalten. Bei Fehlschlag kein Portal auf dieser Plattform und
   separate Architekturentscheidung statt stillen Edge-Proxy-Fallbacks.
2. **Phase 0 nach bestandenem Gate 0:** alle Delivery-Publishes von
   IPv4-/IPv6-Wildcard-Adressen auf explizite Staff-IP beziehungsweise Loopback
   umstellen; Docker-Statusvertrag von reinen Portnummern auf vollständige
   Laufzeit-Bindings erweitern; Setup-Audit, Elevation und transaktionalen
   Firewall-/Compose-Rollback umsetzen und im Manager darstellen. Zusätzlich
   zum bestehenden macOS-DMG wird ein Windows-Manager-Artefakt benötigt.
3. **Proxy (Portal-Listener):** getrennte Host-Publishes auf interne
   Staff-/Portal-Ports, getrennte Caddy-Server, abweisende Defaults ohne
   SNI/Host, strikte SNI-/Host-Prüfung, ausführbare Portal-Positivliste und
   keine globalen IPv4-/IPv6-Docker-Ports.
4. **App-Vertrag:** `PORTAL_BASE_URL`, host-only Cookies und getrennte
   Rate-Limits mit verifizierter Client-IP vom ausschließlich vertrauten
   Caddy-Hop. Origin-Gate in der App ist nicht v1 (siehe §6.2).
5. **Runtime-Härtung:** App und Sandbox non-root, keine unnötigen Capabilities
   oder Docker-Socket, `no-new-privileges`, fest konfigurierte ausgehende Ziele
   und möglichst kleine Egress-Freigaben.
6. **Manager:** generisches Restricted-Binding mit IP-/Adapterauswahl,
   bestätigungspflichtigem Same-NIC-Warnpfad, wiederaufnehmbarer Einrichtung,
   transaktionalem Anwenden/Entfernen, Fail-closed-Status und Reparatur nach
   Adapter-/Adressänderung. Das Portal erscheint nur als erster fest
   freigegebener Konsument; `portalEnabled` bleibt in Ops. Details:
   [`plan-manager-restricted-network-access.md`](plan-manager-restricted-network-access.md).
   Die Captive-zentrierte Topologieanzeige wird durch interne/eingeschränkte
   Zone, Same-NIC-Warnpfad und optionalen späteren Captive-Adapter ersetzt.
7. **Betrieb:** Praxis-IT-Checkliste einschließlich der empfohlenen
   DMZ-/Applikationsplatzierung, unterstützte AP-/Router-Szenarien, Diagnose und
   Supportgrenze. Aufbereiteter Entwurf:
   [`operations/praxis-it-network-isolation.md`](operations/praxis-it-network-isolation.md).
8. **Tests:** gekreuzte Ziel-IP-/SNI-Matrix, Listener-/Firewall-
   Integrationstests, Zwei-NIC- und Same-NIC/Warnpfad, Docker-Port-Audit,
   Parserfälle für explizite sowie globale IPv4-/IPv6-Bindings, IPv4/IPv6,
   Reboot und Docker-Desktop-Neustart, Firewall-/Elevation-Rollback,
   manuelle ACME-Staging-Abnahme vor Releases, Restore mit angewendetem Restricted-Binding, getrennte Rate-Limits für
   mehrere Client-IPs samt Spoofing-Negativtest, Container-/Egress-Härtung,
   Routenkatalog-Negativtest, NIC-Drift, Apply-Rollback und Entfernen des
   Bindings.
9. **Später, nicht v1:** erweiterbare schlanke Captive-Adapter mit
   Manager-Auswahl — [`operations/integrations.md`](operations/integrations.md).

### 13.1 Nächster Arbeitsblock: explizites Staff-Binding

Dieser Arbeitsblock verändert noch keinen Portalpfad. Er macht ausschließlich
den heutigen Staff-Zugang sicher gegenüber einer später zusätzlich
angeschlossenen NIC.

#### Schritt 1 — Gate 0 als kleiner Plattform-PoC

- Auf den konkret freizugebenden Docker-Desktop-Versionen zwei lokale IPv4-
  Adressen verwenden und einen Testcontainer explizit nur an eine davon
  publizieren.
- Von außen gegen beide Ziel-IPs sowie gegen IPv6 scannen; anschließend
  Docker-Neustart, Host-Reboot und Verlust der Bind-Adresse prüfen.
- Die kleinste nötige Firewallregel, Elevation sowie deren sauberen Rollback
  für Windows und macOS erproben und die getesteten Versionsstände festhalten.
- Ergebnis pro Plattform binär dokumentieren: `freigegeben` oder `gesperrt`.
  Ein nur lokal plausibles Compose-Rendering schließt F1 nicht.

Erst nach einem positiven Ergebnis wird der produktive Binding-Code aktiviert.
Der PoC bekommt keine Portalroute und braucht weder Portal-DNS noch eine
fachliche Portal-API-Allowlist.

macOS-F1-Kernnachweis vom 13.09.2026, **bestanden für die unten genannte
Version; noch kein vollständiges Gate 0**:

- macOS 26.5.1, Docker Desktop 4.89.0, Engine 29.7.2 und Compose 5.5.0;
- WLAN `en0` mit `192.168.0.93`, Gigabit-LAN `en7` mit `192.168.0.83`;
- kurzlebiger Caddy-Testcontainer zuerst mit
  `127.0.0.1:18080 -> container:8080`: positiv über `127.0.0.1`, negativ über
  `127.0.0.2` und `::1`;
- zweiter Lauf mit `192.168.0.83:18443 -> container:8080`: positiv über die
  LAN-Adresse `.83`, negativ über die WLAN-Adresse `.93` und die aktive globale
  IPv6-Adresse von `en7`;
- `docker inspect` meldete in beiden Läufen ausschließlich die jeweils
  konfigurierte Host-IP;
- eine nicht lokale TEST-NET-Adresse wurde von Docker vor dem Containerstart
  mit `can't assign requested address` abgewiesen;
- externer Client `192.168.0.96`: bei globalem Docker-Publish waren `.83` und
  `.93` erreichbar; ein host-nativer Kontrollserver war ebenfalls über beide
  Adressen erreichbar;
- isolierter Anchor `com.apple/praxis-flow-f1-poc`: `en7/.83` blieb erreichbar,
  `en0/.93` wurde für den Testport blockiert;
- der Anchor wurde anschließend geleert und sein `pf`-Enable-Token freigegeben;
  der externe Client erreichte danach wieder beide Adressen;
- nach einem Docker-Desktop-Neustart startete der Testcontainer mit
  `restart=unless-stopped` automatisch neu; `docker inspect` behielt
  ausschließlich `192.168.0.83:18443 -> container:8080` bei, der externe Client
  erhielt über `.83` weiterhin HTTP 200 und `.93` lehnte den Verbindungsaufbau
  weiterhin ab;
- Docker- und Kontrollserver wurden entfernt; auf den Testports lauscht kein
  Prozess und es blieb kein PoC-Container zurück.

Die zwei echten NICs liegen derzeit im selben `/24`; der externe Test belegt
deshalb die Ziel-IP-/Interface-Selektion dieses Hosts, aber keine Trennung
zweier gerouteter Subnetze. Offen bleiben auf macOS der Host-Reboot sowie echter
Verlust und Wiederkehr der Bind-Adresse. Außerdem stehen der vollständige
Nachweis auf Windows und die Festlegung der freigegebenen Plattformversionen
aus. Gate 0 bleibt bis dahin offen.

#### Schritt 2 — Binding- und Statusvertrag ohne Verhaltensänderung

Arbeitsstand: Der abwärtskompatible DTO-/Parser-Schnitt und das read-only
Runtime-Audit sind umgesetzt. Die kontrollierte Publish-Umstellung und die
ausführliche Manager-Zuordnungsanzeige bleiben offen.

- `SETUP_LAN_APP_IP` wird begrifflich zur bereits persistierten Quelle der
  Staff-IP. Es wird kein paralleles `STAFF_BIND_IP` eingeführt.
- `TLS_LAN_IP` bleibt TLS-/DNS-Snapshot und wird nicht als zweite Quelle für
  Docker-Publishes verwendet.
- [x] `ComposeServiceStatus` erhält zusätzlich zu den vorerst kompatibel
      beibehaltenen `publishedPorts` vollständige Bindings aus
      `hostIp + publishedPort + targetPort + protocol`.
- [x] `setup/src/docker.ts` liest `Publishers[].URL`; unklare Docker-Desktop-Fälle
      werden über `docker inspect` aufgelöst. Globale IPv4-/IPv6-Werte und
      unbekannte Bindings werden explizit erkannt.
- [x] Sicherheitsentscheidungen verwenden nur die vollständigen Bindings. Fehlen
      sie, lautet das Ergebnis `unbekannt/gesperrt`, nicht `in Ordnung`.

Dieser Schnitt lässt sich separat testen und committen, bevor ein laufender
Stack umgestellt wird.

#### Schritt 3 — Compose-Publishes auf Staff-IP beziehungsweise Loopback

- Ohne Proxy: App ausschließlich `<staff-ip>:8080 -> app:8080`.
- Mit Proxy: App ausschließlich `127.0.0.1:8080 -> app:8080`; HTTP und HTTPS
  ausschließlich `<staff-ip>:80/443 -> proxy:80/443`.
- Maintenance bleibt `127.0.0.1:8082`; Sandbox und interne Dienste erhalten
  keinen Host-Publish.
- Basis-, Delivery-, Proxy- und TLS-Compose-Dateien werden gemeinsam geprüft,
  damit Overlay-Merging keine alte globale Publish-Regel stehen lässt.
- Eine fehlende oder nicht lokale Staff-IP darf niemals auf `0.0.0.0`, einen
  leeren Host oder IPv6-Wildcard zurückfallen.

#### Schritt 4 — kontrollierte Migration, Apply und Rollback

- Bestandsinstallationen zuerst nur inspizieren. Fehlt eine gültige
  `SETUP_LAN_APP_IP`, bleibt der laufende Stack unberührt und der Manager fordert
  eine Staff-IP-Auswahl an; ein späterer Start/Apply mit globalem Fallback ist
  gesperrt.
- Vor Recreate: lokale IP, Portbelegung, gerenderte Compose-Konfiguration und
  Plattformfreigabe prüfen; bisherigen Env-/Compose-/Firewallzustand sichern.
- Danach Container neu erzeugen und die **tatsächlichen** Runtime-Bindings
  auditieren. Staff-Erreichbarkeit wird vor Abschluss positiv geprüft.
- Bei Bind-, Firewall- oder Staff-Probe-Fehlern den gesicherten Zustand
  wiederherstellen und den Fehler sichtbar lassen. Kein Teilzustand darf einen
  Portal-A-Record oder Portal-Listener anlegen.

#### Schritt 5 — Manager-Diagnose

- [x] Das bestehende Netzwerk-Prüffeld übernimmt die read-only Ergebnisse des
      Staff-Runtime-Audits und verwirft sie nicht als alten Gateway-Status.
- Im vorhandenen Netzwerkbereich Staff-IP und die beobachteten Bindings
  lesbar anzeigen; kein neuer Haupt-Tab.
- Klare Zustände für `bereit`, `globale Bindung`, `Bindung unbekannt`,
  `Staff-IP fehlt/nicht lokal` und `Plattform nicht freigegeben` ausgeben.
- Start, Neustart und Repair an dieselbe Setup-Prüfung koppeln; der Renderer
  entscheidet nicht selbst über Sicherheit.

#### Schritt 6 — Abnahme des Staff-Bindings

Mindestens folgende automatisierte beziehungsweise Plattformtests sind das
Commit-/Rollout-Gate:

- Parserfälle für konkrete, globale, leere und IPv6-Publisher sowie den
  Inspect-Fallback;
- Compose-Rendering für Proxy aus/an und TLS aus/an ohne globale Publishes;
- ungültige oder verschwundene Staff-IP blockiert vor dem Recreate;
- erfolgreicher Apply sowie Fehler nach Env-, Compose- und Firewall-Schritt mit
  Rollback;
- Staff positiv an der Staff-IP; Ports 80, 443 und 8080 an einer zweiten IP
  negativ; Maintenance von außen negativ;
- bestehender Managed-, Custom- und Legacy-TLS-Zustand bleibt identisch und
  löst keine ACME-Order aus;
- Backup/Restore übernimmt die Staff-IP konsistent und ein inkonsistenter
  Restore startet nicht mit globalem Fallback;
- bestehende Managed- und Cutover-Pebble-Smokes bleiben grün.

Nicht Teil dieses Arbeitsblocks sind Restricted-IP-Auswahl, Portal-A-Record,
Proxy-Port 444, Portal-Listener, Portal-Routenfreigabe, `PORTAL_BASE_URL`,
Portal-spezifische Firewallregeln oder Captive-Adapter. Diese beginnen erst,
wenn Phase 0 auf den Zielplattformen abgenommen ist.

### 13.2 Noch offene Entscheidungen

Vor **Gate 0 / Staff-Binding** offen:

- unterstützte Windows-/macOS- und Docker-Desktop-Mindestversionen;
- F1-PoC: Compose-Host-IP **und** Host-Firewall **und** externer Zwei-NIC-Scan
  je Plattform; Binding allein schließt F1 nicht;
- Packaging, Installation, Elevation und Firewall-Rollback des Managers auf
  Windows und macOS.

Erst vor dem **Restricted-/Portal-Block** offen:

- vollständige API-Positivliste des Portals;
- nur bei gescheitertem F1-PoC: eigene Folgeentscheidung, ob ein nativer
  Edge-Proxy als separate Alternativarchitektur geplant wird oder die Plattform
  ohne Portal bleibt.
