# Praxis-IT-Hinweise zur Netzwerkisolation

Stand: 2026-09-21 · Betriebs- und Abnahmehinweise für das Restricted-Binding

Wildcard-TLS, explizite Proxy-Publishes, Runtime-Audit sowie Prepare, Apply und
Remove des Restricted-Bindings sind umgesetzt. Der proxyfreie initiale Betrieb
bleibt bewusst auf allen Host-Interfaces erreichbar. Die praktische
Zwei-NIC-Abnahme und die Plattformfreigabe bleiben davon getrennte
[Rollout-Gates](../open-items.md). Technischer Lebenszyklus: [`restricted-lifecycle.md`](restricted-lifecycle.md) ·
TLS-Betrieb: [`tls.md`](tls.md) · Runtime: [`runtime.md`](runtime.md)

## Gültige Systemgrenze — Entscheidung vom 14.09.2026

Wartezimmer verwaltet seine Docker-/Compose-Konfiguration, Caddy-Listener,
TLS und den tatsächlichen Runtime-Publish-Vertrag. Host-Firewall, Routing,
Forwarding und die Trennung der Praxisnetze verantwortet die Praxis-IT.
Der Manager ändert keine Host-Firewallregeln und benötigt dafür keine
Elevation. Er bietet verständliche Hinweise, insbesondere im Netzwerkdiagramm.

Die Produktzusage lautet: explizite Ziel-IP-Bindings und geprüfte Listener-Policy.
Die Auswahl eines Adapters über seine lokale IPv4-Adresse garantiert keine
Filterung nach eingehendem Interface und keine Isolation des Praxisnetzes.
Ein grüner Docker-/Listener-Status darf daher nicht „Netz sicher isoliert“ bedeuten.
IPv6 bleibt ein Negativtest auf unbeabsichtigte Erreichbarkeit, kein angebotener
Zugangspfad. Windows ist ab Manager 6.1.2-beta.1 für einen protokollierten
Betatest freigegeben; der reale Binding-Nachweis bleibt offen. Siehe
[Windows-Portal-Beta](windows-portal-beta.md).

Diese Entscheidung ersetzt die frühere Planung einer produktverwalteten
Host-Firewall einschließlich Elevation, Apply/Rollback und Firewall-Release-Gates.
Entsprechende ältere Architekturpassagen und F1-Enforcement-Zusagen in diesem
Dokument sind historisch und kein gültiger Produktvertrag. Die dokumentierten
Firewall-PoCs bleiben als Versuchsprotokolle erhalten, nicht als Produktfunktion.

## 1. Zweck und Verantwortungsgrenze

Dieses Dokument bündelt Hinweise, die wir der Praxis beziehungsweise ihrer IT
für Netzplanung, Abnahme und eine mögliche spätere Härtung mitgeben können.
Wartezimmer unterstützt mit Produktinformationen und Prüfhinweisen. Planung,
Konfiguration und Betrieb von Switches, VLANs, WLAN, Router, DHCP, DNS und
Host- und Praxis-Firewalls bleiben Aufgabe der Praxis-IT. Wartezimmer
verwaltet ausschließlich seine Docker-/Caddy-Konfiguration; der Manager gibt
Hinweise und bestätigt keine Isolation des Praxisnetzes.

Die Hinweise ersetzen weder eine Prüfung der konkreten Umgebung noch eine
Sicherheitsfreigabe durch die verantwortliche IT. Eine Plattform darf erst nach
dem für sie dokumentierten Binding- und Netztest freigegeben werden.

## 2. Technische Einordnung des Standardwegs

Der Standardweg nach erfolgreicher Plattform- und Praxisabnahme ist:

```text
Patienten-/Gastsegment
        │
        │ nur HTTPS zur Restricted-IP
        ▼
NIC 2 ─ Restricted-IP ─ Host-Firewall ─ Portal-Listener
                                           │
                                      Wartezimmer-App
                                           │
NIC 1 ───── Staff-IP ─── Host-Firewall ─ Staff-Listener
        ▲
        │
Praxis-/Staffsegment
```

Dabei müssen zwei Aussagen sauber getrennt werden:

1. **Exposition:** Der Portal-Service wird ausschließlich über die IP der
   vorgesehenen Host-Schnittstelle veröffentlicht. Staff-Dienste werden dort
   durch Listener-Policy und Host-Firewall abgewiesen.
2. **Workload-Isolation:** Der Container besitzt die physische NIC nicht
   exklusiv. Ein Host-IP-Publish ist weder eine physische NIC-Zuweisung noch
   allein eine Egress-Sperre für den Container.

Docker Desktop betreibt Linux-Container in einer VM und führt eingehende
Verbindungen über seinen Backend-Prozess. Ein Publish der Form
`HOST_IP:HOST_PORT:CONTAINER_PORT` begrenzt die vorgesehene Hostadresse, muss
auf jeder freigegebenen Plattform aber zusammen mit Host-Firewall und externen
Proben nachgewiesen werden. Docker `macvlan`, das einem Container eine eigene
Präsenz an einem physischen Linux-Interface geben kann, wird von Docker Desktop
auf Windows und macOS nicht unterstützt.

Auch getrennte Docker-Bridge-Netze lösen die physische Zonengrenze nicht. Sie
trennen direkte Containerkommunikation, verhindern aber nicht automatisch
Verbindungen eines Containers zum Host oder zu vom Host erreichbaren Netzen.
Für Wartezimmer kommt hinzu, dass Portal und Staff heute denselben App-Kern
verwenden; zwei Docker-Netze machen daraus keine getrennten Security-Domains.

Folgerung für die Kommunikation:

> Der Portal-Service wird ausschließlich über die Restricted-IP exponiert.
> Wartezimmer routet auf dem Host nicht zwischen Patienten- und Staffsegment.

Nicht zugesagt werden sollte:

> Der Portal-Container ist an die Patienten-NIC gebunden oder kann technisch
> niemals das Praxisnetz erreichen.

## 3. Empfehlung an die Praxis-IT

### 3.1 Netzplatzierung

Empfohlen wird eine Behandlung als DMZ-/Applikationslösung:

- eigenes Patienten-/Gastsegment mit eigener SSID und eigenem Subnetz;
- zweite physische NIC oder ein von der IT eindeutig bereitgestellter,
  untagged VLAN-Port für die Restricted-IP;
- Wartezimmer-Host nach Möglichkeit in einem eigenen Applikationssegment statt
  in einem pauschal vertrauenswürdigen Praxis-LAN;
- keine Bridge, kein Internet Connection Sharing, kein RRAS/NAT und kein IP-
  Forwarding zwischen Restricted- und Staff-Interface;
- genau eine Standardroute über die Staff-Seite; auf der Restricted-Seite
  normalerweise kein zusätzliches Gateway und kein DNS-Eintrag am Host;
- feste Restricted-IP oder DHCP-Reservierung mit stabiler Interface-Zuordnung.

Ein AP, der das Patienten-WLAN lediglich in das normale Praxis-LAN bridged,
erfüllt diese Empfehlung nicht. Client-Isolation innerhalb des Patienten-WLANs
ist eine sinnvolle Zusatzkontrolle, ersetzt aber nicht die Trennung vom
Praxisnetz.

### 3.2 Firewall-Policy

Als Ausgangspunkt für die Praxis-Firewall:

| Quelle                          | Ziel                                 | Dienst                  | Policy                                                                          |
| ------------------------------- | ------------------------------------ | ----------------------- | ------------------------------------------------------------------------------- |
| Patientensegment                | Restricted-IP                        | TCP 443                 | erlauben                                                                        |
| Patientensegment                | Staff-IP und Praxisnetze             | alle                    | sperren                                                                         |
| Patientensegment                | Management von AP, Switch und Router | alle                    | sperren                                                                         |
| Staffsegment                    | Staff-IP                             | benötigte Staff-Dienste | erlauben                                                                        |
| Wartezimmer-Applikationssegment | PVS/NAS/Drucker                      | alle                    | standardmäßig sperren; nur konkrete Integration freigeben                       |
| Wartezimmer-Host                | Internet                             | alle                    | nach Bedarf minimieren; Update-, DNS-, Zeit- und Zertifikatsziele dokumentieren |

IPv6 braucht dieselbe Policy wie IPv4. Ist im Patientenpfad kein IPv6
vorgesehen, sollte die IT es dort bewusst deaktivieren oder vollständig
filtern, statt sich nur auf IPv4-Regeln zu verlassen.

Die endgültige Regelmenge hängt von den tatsächlich benötigten Integrationen
und vom TLS-/Update-Betrieb ab. Eine pauschale Freigabe in das gesamte
Praxisnetz ist nicht erforderlich.

### 3.3 Abnahme aus beiden Netzen

Die wirksame Grenze wird von realen Clients geprüft, nicht nur anhand von
Docker-, Firewall- oder Listener-Ausgaben:

| Probe                                                       | Erwartung                                     |
| ----------------------------------------------------------- | --------------------------------------------- |
| Patient → Portal-Hostname / Restricted-IP auf TCP 443       | Portal erreichbar                             |
| Patient → Staff-Hostname und Staff-IP                       | nicht erreichbar                              |
| Patient → bekannte Praxisgeräte und Infrastrukturverwaltung | nicht erreichbar                              |
| Staff → Staff-Hostname / Staff-IP                           | Staff-Oberflächen erreichbar                  |
| Staff → Portal-Hostname                                     | nur gemäß bewusst festgelegter Routing-Policy |
| unbekannter Hostname/SNI → beide IPs                        | keine Default-Site                            |
| Wiederholung nach Host- und Docker-Neustart                 | Ergebnis unverändert                          |
| Restricted-NIC oder Restricted-IP entfernt                  | Portal fail-closed, Staff bleibt verfügbar    |

Die Praxis-IT sollte Ergebnis, Testgerät, Quellsegment, Datum sowie relevante
Firewall-/VLAN-Änderungen dokumentieren. Wartezimmer kann dafür eine Prüfhilfe
anbieten, nimmt das fremde Netz damit aber nicht ab.

## 4. Härtungsstufen

### Stufe A — Produktstandard nach Plattformfreigabe

Ein gemeinsamer freigegebener Host mit zwei NICs, expliziten Host-IP-
Publishes, getrennten Proxy-Listenern, Host-Firewall, keinem Forwarding und
Black-Box-Abnahme. Das begrenzt die eingehende Angriffsfläche, lässt Portal und
Staff aber bewusst im selben App-Kern und auf demselben Host.

### Stufe B — dedizierter Host oder Applikationssegment

Wartezimmer läuft auf einem dedizierten, von PVS, NAS, Druckern und Clients
getrennten Host beziehungsweise Segment. Nur erforderliche Verbindungen werden
freigegeben. Das reduziert den erreichbaren Bereich bei einer kompromittierten
Anwendung, ohne die Software in zwei Laufzeiten zu teilen. Diese Stufe ist die
sinnvollste zusätzliche Empfehlung an eine Praxis-IT.

## 5. Produktseitige Härtung — Wartezimmer

Unabhängig von der Netzvariante bleibt Wartezimmer verantwortlich für eine
kleine Portal-Angriffsfläche:

- feste Portal-Routen-Positivliste und kein Default-VHost;
- kurze Sessions, Upload-Limits und getrennte Rate-Limits;
- Container ohne `privileged`, Docker-Socket und unnötige Capabilities;
- Non-Root, `no-new-privileges` und möglichst read-only Dateisysteme;
- fest definierte ausgehende Ziele beziehungsweise möglichst kleine Egress-
  Freigaben;
- zeitnahe Updates, nachvollziehbare Logs ohne Gesundheitsdaten und
  wiederholbare Security-Tests.

Diese Maßnahmen gehören zum Produktvertrag und dürfen nicht auf die Praxis-IT
verlagert werden. Portal und Staff bleiben dabei bewusst in einem gemeinsamen
Frontend- und App-Stack. Die Sicherheitsgrenze entsteht durch die
Restricted-Proxy-Positivliste und die serverseitige API-Autorisierung, nicht
durch getrennte Bundles oder Laufzeiten.

## 6. Informationen für die IT-Übergabe

Vor Installation beziehungsweise Netzabnahme sollten mindestens folgende
Punkte geklärt sein:

- Verantwortlicher Ansprechpartner und Wartungsfenster;
- Staff- und Patientensegment mit IPv4-CIDR sowie IPv6-Policy;
- Zuordnung der beiden physischen Ports, Switchports, VLANs und SSIDs;
- Staff-IP, Restricted-IP, Reservierung und erlaubte Standardroute;
- DNS-Zuordnung für Staff- und Portal-Hostname;
- gewünschter Internetzugang im Patientensegment;
- konkrete interne Integrationsziele von Wartezimmer;
- vorgesehene Firewallregeln und Logging/Aufbewahrung;
- Patch-, Backup-, Restore- und Notfallverantwortung;
- Testplan, Abnahmeergebnis und Verfahren bei NIC-/Adressänderungen.

## 7. Referenzen

- Docker: [Publishing and exposing ports](https://docs.docker.com/get-started/docker-concepts/running-containers/publishing-ports/)
- Docker: [Docker-Desktop-Netzwerk und Backend-Prozess](https://docs.docker.com/desktop/features/networking/networking-how-tos/)
- Docker: [`macvlan`-Plattformgrenzen](https://docs.docker.com/engine/network/drivers/macvlan/)
- Docker: [Compose-Service-Härtungsoptionen](https://docs.docker.com/reference/compose-file/services/)

Windows-Manager-Paketierung ist inzwischen vorbereitet; die Aussage zur noch
fehlenden Windows-Binding-Freigabe bleibt gültig. Windows-Firewall, Netzprofil,
VPN-/WSL-Adapter und physische Quellnetze müssen durch die IT geprüft werden.
Der Manager öffnet keine Firewallports und fordert dafür keine Administratorrechte.
[Konkrete Windows-Abnahmeschritte](../open-items.md#windows-abnahmeprotokoll).
