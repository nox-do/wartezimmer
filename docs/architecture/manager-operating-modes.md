# Betriebsmodi im Manager

Die hier beschriebenen Klassifikationen bilden den aktuellen Implementierungsstand ab.

Zentrale, lesende Einordnung im Setup-Backend mit Darstellung und Navigation im Manager.
Es gibt keinen zusätzlich gespeicherten Betriebsmodus und keine Datenmigration.

Der Betriebsmodus ist nicht der Installationszustand. `HostStatus.installation` wird
ebenfalls ausschließlich im Setup-Backend abgeleitet und unterscheidet
`docker-unavailable`, `fresh`, `starting`, `healthy`, `stopped`, `needs-repair`,
`inconsistent` und `needs-reinstall`. Der
Zustand `installing` trägt den persistenten Installationsvorgang. `healthy` verlangt
gesunde App und Sandbox sowie
eine mit dem Installations-Token authentifizierte Maintenance-API. Störungen von
Proxy, TLS oder Gateway ändern den Installationszustand nicht; sie bleiben eigene
Dienstzustände. `starting` beschreibt den erwarteten Übergang, wenn App und Sandbox
jeweils gesund oder startend sind und mindestens einer der Dienste noch startet.

| Modus                            | Bestätigte Konfiguration                                                                                          |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Nicht installiert                | Keine `.env`, kein gefundenes TLS-/Recovery-Material und keine Container/Volumes mit der Compose-Projektidentität |
| Direkter HTTP-Betrieb            | Proxy aus, kein HTTPS-Cutover, Portalzugang aus                                                                   |
| HTTP mit Proxy                   | HTTP-Proxy, kein HTTPS-Cutover; HTTPS darf vorbereitet sein                                                       |
| HTTPS                            | HTTPS-Cutover, passender TLS-Proxy und Staff-Identität; Portalzugang aus                                          |
| HTTPS mit separatem Portalzugang | Zusätzlich aktivierter Restricted-Zugang mit Portal-Identität und Zieladresse                                     |

Internes Portal für Staff gehört zum normalen App-Betrieb. DNS-Anlage, Zertifikat
und vorbereitetes Restricted-Binding aktivieren den separaten Portalzugang nicht.
Docker-Gesundheit, gestoppte Dienste, Zertifikatsablauf und fehlende lokale Adapter
sind keine Betriebsmodi. Ihre vorhandenen Prüfungen bleiben zuständig.

## Aufbau

- `setup/src/host-lifecycle.ts`: reine Ableitung und kleine Konsistenzprüfung.
- `setup/src/host-lifecycle-facts.ts`: lesender Adapter für Journal und lokale
  Installationsmerkmale; ohne `.env` zusätzlich Suche nach Docker-Projektresten.
- `HostStatus.lifecycle`: fachliche Sicht auf Installations- und Recovery-Befunde;
  Laufzeitbeobachtungen bleiben davon getrennt.
- `lifecycleKey` in Config und Runtime: Vergleich ausschließlich öffentlicher
  abgeleiteter Metadaten. Änderungen lösen einen Config-Refresh aus, auch wenn
  Praxisadresse und Proxy-Flag unverändert bleiben. Runtime überschreibt Config nicht.
- `HostLifecycleSummary`: Anzeige auf der Statusseite; UI-Entwürfe bleiben lokal.
- Navigation: `installation` ist maßgeblich. `fresh` und `installing` öffnen den
  Assistenten; `stopped` bietet den sicheren Start. `needs-reinstall` und
  `needs-repair`, `inconsistent` und Docker-Ausfall bleiben auf der Statusseite.
  Die beiden Diagnosezustände öffnen keinen Assistenten und keine Mutationsflächen. Wartung und Netzwerk sind bei
  `healthy` zugänglich. Core-Servicewechsel im Runtime-Poll lösen einen erneuten
  Config-Refresh aus.
- Netzwerkübersicht: Verbindung und Publikationsumfang folgen dem bestätigten Modus.
  Bei unbekannter Einordnung wird weder HTTP noch eine Freigabe auf allen NICs
  behauptet. Offene Portaländerungen werden als noch nicht abgeschlossen angezeigt.
  Der Manager verwendet den vom Setup gelieferten Lifecycle ohne Legacy-Ableitung.

Ein offenes Restricted-Journal hat Vorrang vor der aktuellen `.env`: Die vorherige
Konfiguration bestimmt den Modus bis zum Journalabschluss. Das berücksichtigt auch
Fehler nach dem Schreiben der neuen `.env`, die noch einen Rollback auslösen können.
Der Journalinhalt und insbesondere `previousEnv` werden nicht an den Manager gegeben.
Ein offenes Journal beweist keine aktiv laufende Operation; die Anzeige sagt deshalb
nur, dass der Wechsel noch nicht abgeschlossen ist.

Fehlen Daten für eine verlässliche Einordnung, wird kein Modus geraten. Insbesondere
ist ohne Docker-Prüfung eine fehlende `.env` allein kein Nachweis einer sauberen
Neuinstallation. Die Restprüfung sucht bekannte lokale TLS-/Recovery-Artefakte und
Container/Volumes mit Compose-Projektlabel; sie ist keine vollständige Datenträgersuche.

## Installation und Betriebsmodus

Der Lifecycle beschreibt die Netzwerkkonfiguration, `InstallationState` den
Installationszustand. Eine ungültige Proxy-Konfiguration verhindert die Statusantwort
nicht: Der Manager zeigt `inconsistent` mit konkreten Gründen, ohne Neuinstallation
zu empfehlen. Betriebs- und Authentifizierungsstörungen ergeben `needs-repair`.

Der aktuelle Recovery-Vertrag steht unter
[Neuinstallation und Recovery](../operations/reinstall-recovery.md).
Nach ausdrücklich bestätigter Neuinstallation gibt es kein Rollback zur alten Runtime;
Backups und der aktive Vorgang bleiben erhalten. Der vorhandene Restore-Core kann
auf die gesunde frische Installation zurückrollen.

Eine `stopped`-Installation wird nicht durch einen Status-Poll gestartet. Der
mutierende Start-Endpunkt prüft zuerst das lokale App-Image und das erwartete
Compose-App-Volume mit erfolgreichen Docker-Bestandsabfragen und danach `wartezimmer.db` in einem netzwerklosen,
read-only Utility-Container. Erst anschließend startet er Compose und verlangt
gesunde App/Sandbox sowie erfolgreiche Maintenance-Authentifizierung. Fehlt das
Image, Volume oder Datenbank, wird `needs-reinstall` zurückgegeben. Compose-Start-,
Health- und Auth-Fehler ergeben `needs-repair`; technische Prüffehler bleiben
strukturierte API-Fehler. Die Klassifikation verwendet Codes, keine Logtexte.

Produktservices besitzen keine globalen `container_name`-Werte. Besitz und Zugriff
laufen über Compose-Projekt und Servicenamen. Die Produktports bleiben unverändert
auf 8080 für die App und 8082 für die lokale Maintenance-API festgelegt.

## Installationsvorgang

Der `.pfinstall`-Import besitzt genau zwei persistente Phasen:

- `prepared`: Paket, Manifest, Archivpfade, Images, Plattform, Proxy-Digest und
  Compose-Konfiguration sind geprüft. Die Paketbytes liegen gepinnt unter
  `operations/install/<id>/`; Live-Konfiguration und Runtime wurden noch nicht
  verändert. Nur hier ist Abbruch zulässig.
- `installing`: Commit wurde bestätigt. Dieser Marker wird atomar vor der ersten
  Änderung an Containern, Volumes oder Host-Dateien geschrieben. Es gibt danach
  keinen behaupteten Rückweg zur alten Installation.

Prepare, Commit und Abbruch laufen unter demselben Host-Mutationsmutex. Ein
Replace-Commit verlangt zusätzlich die ausdrückliche Bestätigung im Backend. Der
Factory Reset verwendet `docker compose down --volumes --remove-orphans`, prüft
verbliebene Produktvolumes anhand Name und Compose-Projektlabel und entfernt danach
nur eine feste Allowlist verwalteter Hostartefakte. `backups/`, der aktive Vorgang,
externe Import-/Export-Verzeichnisse und geladene Images bleiben erhalten.

Ein Status-Poll führt weder Commit noch Reset aus. Solange ein lesbarer Marker
existiert, erscheint der öffentliche Zustand als `installing`; die Summary trägt
weiterhin die persistente Phase `prepared` oder `installing`.

## Gemeinsame Vorprüfung für Host-Aktionen

Die öffentliche Lifecycle-Ableitung ist jetzt auch die gemeinsame erste
Vorprüfung für Host-Mutationen. Der reine Kern liegt in
`packages/server-shared/src/host-lifecycle-policy.ts`; Setup liest den Zustand
unmittelbar vor der Aktion über `setup/src/host-lifecycle-guard.ts`. Der Manager
verwendet denselben Kern für TLS- und Netzwerkaktionen. Ein Snapshot aus dem
Manager autorisiert keine Mutation.

Die Matrix erlaubt nur bestätigte Übergänge: `direct-http → proxy-http` über
das Staff-/Netzwerk-Binding, `proxy-http → https` über TLS-Cutover,
`https → https-portal` über Restricted-Apply und die Rücknahme
`https-portal → https`. Start, Stop, Neustart, Wiederaufbau, Restore und Update
benötigen einen bekannten installierten Modus. Unbekannte, widersprüchliche oder
unlesbare Zustände sowie offene Journale werden abgewiesen. Vorbereitete oder
aktive TLS-/Portalidentitäten werden bei Netzwerk-, Wartungs- und
Restricted-Aktionen als zu erhaltend markiert.

Diese Prüfung ersetzt keine Detailprüfung: lokale Staff-IP, Docker-Bindings,
DNS, Zertifikate, Portalvertrag, Images, Volumes, Runtime-/Listener-Audit und
DHCP-/IP-Drift bleiben nachgelagerte fail-closed Gates. Die alten Env-Felder
bleiben unverändert Teil des Persistenz- und Compose-Vertrags.

Eigene Domains für den separaten Portalzugang bleiben ein eigener
Funktionsausbau.
