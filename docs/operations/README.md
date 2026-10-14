# Betrieb und Installation

Eine Installation = eine Praxis, ein Stack auf einem Host. Der Manager ist die
operative Oberfläche; CLI und manuelle Compose-Aufrufe sind Support-Fallback.

Vor dem produktiven Einsatz und nach Änderungen prüft das Praxisteam seine
konfigurierten Abläufe mit fiktiven Besuchen. Bei Complex Routing insbesondere
jeden vorgesehenen Behandlungspfad und die benötigten Abweichungen durchspielen;
siehe [Prüfung der Routing-Konfiguration](../architecture/routing.md#konfigurierte-abläufe-vor-dem-einsatz-prüfen).

| Aufgabe                                                      | Verbindliches Dokument                             |
| ------------------------------------------------------------ | -------------------------------------------------- |
| Pakete bauen, ausliefern und Software aktualisieren          | [Manager](../../manager/README.md)                 |
| Erst-/Neuinstallation, Backup-Übernahme und Recovery         | [Installation und Recovery](reinstall-recovery.md) |
| Tagesbetrieb, Compose, Ports und Volumes                     | [Runtime](runtime.md)                              |
| Bestehenden Betrieb ohne Neuinstallation wiederaufbauen      | [Betrieb wiederherstellen](rebuild.md)             |
| HTTPS einrichten und betreiben                               | [TLS](tls.md)                                      |
| Patientenzugang: Apply/Remove, Crash-Recovery, Updatevertrag | [Restricted-Lifecycle](restricted-lifecycle.md)    |
| Netzplanung und Vor-Ort-Prüfung durch die Praxis-IT          | [TLS und Netzwerkgrenzen](tls.md)                  |
| Sicherung und Restore                                        | [Backup](backup.md)                                |
| SMS, CSV und Grenzen weiterer Integrationen                  | [Integrationen](integrations.md)                   |

Plattformvoraussetzungen stehen in der [Manager-Dokumentation](../../manager/README.md).
Die Praxis-IT prüft Adressbindung, Firewall und Trennung von Praxis- und
Patientennetz nach jeder Installation und bei Änderungen am Netzwerk.

## Lizenz

Nutzungsrechte und erlaubte beauftragte IT-Leistungen stehen in der
[Wartezimmer-Lizenz, Version 1.1](../../LICENSE). Die Bereitstellung als fremdes Softwareprodukt
oder Softwaredienst benötigt eine gesonderte Erlaubnis, auch bei kostenlosen
Angeboten. GitHub-Ausnahme und nichtöffentliche Weitergabe regelt Abschnitt 3. Die Projektlizenz liegt in den Manager-Ressourcen sowie unter `/app/LICENSE` in App und Sandbox.

## Andere Leser

- [Manager-Bedienung und Entwicklung](../../manager/README.md)
- [Architektur](../architecture/README.md)
- [Fachliche Abläufe](../flows.md)
- [TLS-Lab für Entwickler](../development/tls-lab.md)

Abgelöste Implementierungspläne werden nicht parallel fortgeschrieben; ihre
Historie bleibt in Git. Das [Archiv](../archive/README.md) enthält nur noch
historische Nicht-Produkt-Entwürfe.
