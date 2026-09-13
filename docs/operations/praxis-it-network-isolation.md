# Praxis-IT-Hinweise zur Netzwerkisolation

Stand: 2026-09-13 · **Beratungsunterlage zum geplanten Restricted-Binding, kein umgesetzter Produktvertrag**

Das vorausgesetzte Wildcard-TLS-Namensmodell ist umgesetzt und per lokalem
Pebble-Smoke geprüft. Explizites Staff-Binding, Plattform-/Firewall-Gate und
Restricted-Binding sind weiterhin offen; die nachfolgenden Netzempfehlungen
dürfen daher noch nicht als verfügbare Manager-Funktion verstanden werden.

Produktplan: [Eingeschränkter Netzwerkzugang für das Patientenportal](../plan-portal-lan-isolation.md) ·
Manager-Plan: [Restricted Network Access](../plan-manager-restricted-network-access.md) ·
heutiger Betrieb: [`runtime.md`](runtime.md)

## 1. Zweck und Verantwortungsgrenze

Dieses Dokument bündelt Hinweise, die wir der Praxis beziehungsweise ihrer IT
für Netzplanung, Abnahme und eine mögliche spätere Härtung mitgeben können.
Praxis Flow unterstützt mit Produktinformationen und Prüfhinweisen. Planung,
Konfiguration und Betrieb von Switches, VLANs, WLAN, Router, DHCP, DNS und
Praxis-Firewalls bleiben Aufgabe der Praxis-IT.

Die Hinweise ersetzen weder eine Prüfung der konkreten Umgebung noch eine
Sicherheitsfreigabe durch die verantwortliche IT. Aussagen zum Restricted-
Binding gelten erst nach Umsetzung und Plattformfreigabe des Produktplans.

## 2. Technische Einordnung des geplanten Standardwegs

Der geplante Standardweg ist:

```text
Patienten-/Gastsegment
        │
        │ nur HTTPS zur Restricted-IP
        ▼
NIC 2 ─ Restricted-IP ─ Host-Firewall ─ Portal-Listener
                                           │
                                      Praxis-Flow-App
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
Für Praxis Flow kommt hinzu, dass Portal und Staff heute denselben App-Kern
verwenden; zwei Docker-Netze machen daraus keine getrennten Security-Domains.

Folgerung für die Kommunikation:

> Der Portal-Service wird ausschließlich über die Restricted-IP exponiert.
> Praxis Flow routet auf dem Host nicht zwischen Patienten- und Staffsegment.

Nicht zugesagt werden sollte:

> Der Portal-Container ist an die Patienten-NIC gebunden oder kann technisch
> niemals das Praxisnetz erreichen.

## 3. Empfehlung an die Praxis-IT

### 3.1 Netzplatzierung

Empfohlen wird eine Behandlung als DMZ-/Applikationslösung:

- eigenes Patienten-/Gastsegment mit eigener SSID und eigenem Subnetz;
- zweite physische NIC oder ein von der IT eindeutig bereitgestellter,
  untagged VLAN-Port für die Restricted-IP;
- Praxis-Flow-Host nach Möglichkeit in einem eigenen Applikationssegment statt
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
| Praxis-Flow-Applikationssegment | PVS/NAS/Drucker                      | alle                    | standardmäßig sperren; nur konkrete Integration freigeben                       |
| Praxis-Flow-Host                | Internet                             | alle                    | nach Bedarf minimieren; Update-, DNS-, Zeit- und Zertifikatsziele dokumentieren |

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
Firewall-/VLAN-Änderungen dokumentieren. Praxis Flow kann dafür eine Prüfhilfe
anbieten, nimmt das fremde Netz damit aber nicht ab.

## 4. Härtungsstufen

### Stufe A — geplanter Produktstandard

Ein gemeinsamer Windows- oder macOS-Host mit zwei NICs, expliziten Host-IP-
Publishes, getrennten Proxy-Listenern, Host-Firewall, keinem Forwarding und
Black-Box-Abnahme. Das begrenzt die eingehende Angriffsfläche, lässt Portal und
Staff aber bewusst im selben App-Kern und auf demselben Host.

### Stufe B — dedizierter Host oder Applikationssegment

Praxis Flow läuft auf einem dedizierten, von PVS, NAS, Druckern und Clients
getrennten Host beziehungsweise Segment. Nur erforderliche Verbindungen werden
freigegeben. Das reduziert den erreichbaren Bereich bei einer kompromittierten
Anwendung, ohne die Software in zwei Laufzeiten zu teilen. Diese Stufe ist die
sinnvollste zusätzliche Empfehlung an eine Praxis-IT.

### Stufe C — getrennte Portal- und Core-VMs (Discovery)

Für eine stärkere Workload-Grenze ist unter Windows ein späteres Hyper-V-
Zielbild denkbar:

```text
UNTRUSTED                                                        TRUSTED
Patientensegment                                               Staffsegment
      │                                                              │
physische NIC 2                                               physische NIC 1
      │                                                              │
externer vSwitch                                             externer vSwitch
      │                                                              │
Portal-VM ───────── privater vSwitch + enge API-Policy ─────────── Core-VM
```

- Die Portal-VM erhält nur eine externe Verbindung zum Patientensegment.
- Die Core-VM erhält nur eine externe Verbindung zum Staffsegment.
- Ein privater Hyper-V-Switch verbindet ausschließlich die beiden VMs.
- Die Core-Firewall erlaubt von der Portal-VM nur den definierten Backend-
  Endpunkt; Datenbank und Staff-Oberflächen werden nicht exponiert.
- Wird beim externen Switch die gemeinsame Nutzung durch das Management-OS
  deaktiviert, erhält Windows über diesen Switch keinen eigenen virtuellen
  Netzwerkadapter. Das ist präziser als die Aussage, die physische NIC gehöre
  vollständig einer einzelnen VM.

Diese Stufe ist **heute keine Installationsvariante von Praxis Flow**. Der
aktuelle gemeinsame App-Kern lässt sich nicht durch die Praxis-IT in Portal und
Core aufteilen. Vor einer Produktentscheidung wären mindestens nötig:

- eigener, minimaler Portal-zu-Core-API-Vertrag samt gegenseitiger
  Authentisierung und Autorisierung;
- Festlegung von Session-, Upload- und Datenverantwortung;
- Fail-closed Firewall- und Routing-Regeln einschließlich IPv6;
- automatisierte VM-Erstellung, Patchen, Monitoring und Zertifikatsbetrieb;
- gemeinsames Update-, Backup-, Restore- und Disaster-Recovery-Konzept;
- Ressourcen-, Lizenz- und Hardwareprüfung sowie Abnahme eines VM-/Hyper-V-
  Escape-Risikos als verbleibendes Restrisiko.

Hyper-V auf Windows-Clients setzt eine unterstützte Windows-Pro-/Enterprise-
Edition und passende Hardwarevirtualisierung voraus. Zwei Linux-VMs erhöhen
außerdem RAM-, Storage-, Patch- und Betriebsaufwand. Die Variante sollte daher
nur als eigene Produkt-Discovery gegen Stufe B bewertet werden.

## 5. Produktseitige Härtung — Praxis Flow

Unabhängig von der Netzvariante bleibt Praxis Flow verantwortlich für eine
kleine Portal-Angriffsfläche:

- feste Portal-Routen-Positivliste und kein Default-VHost;
- kurze Sessions, Upload-Limits und getrennte Rate-Limits;
- Container ohne `privileged`, Docker-Socket und unnötige Capabilities;
- Non-Root, `no-new-privileges` und möglichst read-only Dateisysteme;
- fest definierte ausgehende Ziele beziehungsweise möglichst kleine Egress-
  Freigaben;
- zeitnahe Updates, nachvollziehbare Logs ohne Gesundheitsdaten und
  wiederholbare Security-Tests.

Diese Maßnahmen werden im Produktplan als Freigabekriterien geführt. Sie dürfen
nicht auf die Praxis-IT verlagert werden.

## 6. Informationen für die IT-Übergabe

Vor Installation beziehungsweise Netzabnahme sollten mindestens folgende
Punkte geklärt sein:

- Verantwortlicher Ansprechpartner und Wartungsfenster;
- Staff- und Patientensegment mit IPv4-CIDR sowie IPv6-Policy;
- Zuordnung der beiden physischen Ports, Switchports, VLANs und SSIDs;
- Staff-IP, Restricted-IP, Reservierung und erlaubte Standardroute;
- DNS-Zuordnung für Staff- und Portal-Hostname;
- gewünschter Internetzugang im Patientensegment;
- konkrete interne Integrationsziele von Praxis Flow;
- vorgesehene Firewallregeln und Logging/Aufbewahrung;
- Patch-, Backup-, Restore- und Notfallverantwortung;
- Testplan, Abnahmeergebnis und Verfahren bei NIC-/Adressänderungen.

## 7. Referenzen

- Docker: [Publishing and exposing ports](https://docs.docker.com/get-started/docker-concepts/running-containers/publishing-ports/)
- Docker: [Docker-Desktop-Netzwerk und Backend-Prozess](https://docs.docker.com/desktop/features/networking/networking-how-tos/)
- Docker: [`macvlan`-Plattformgrenzen](https://docs.docker.com/engine/network/drivers/macvlan/)
- Docker: [Compose-Service-Härtungsoptionen](https://docs.docker.com/reference/compose-file/services/)
- Microsoft: [Hyper-V-Switchtypen](https://learn.microsoft.com/en-us/windows-server/virtualization/hyper-v/features-terminology)
- Microsoft: [`New-VMSwitch` und `AllowManagementOS`](https://learn.microsoft.com/en-us/powershell/module/hyper-v/new-vmswitch)
- Microsoft: [Hyper-V-Systemanforderungen](https://learn.microsoft.com/en-us/windows-server/virtualization/hyper-v/host-hardware-requirements)
