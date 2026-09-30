# Betrieb und Installation

Eine Installation = eine Praxis, ein Stack auf einem Host. Der Manager ist die
operative Oberfläche; CLI und manuelle Compose-Aufrufe sind Support-Fallback.

| Aufgabe                                                      | Verbindliches Dokument                              |
| ------------------------------------------------------------ | --------------------------------------------------- |
| Pakete bauen, ausliefern und Software aktualisieren          | [Delivery](delivery.md)                             |
| Erst-/Neuinstallation, Backup-Übernahme und Recovery         | [Installation und Recovery](reinstall-recovery.md)  |
| Tagesbetrieb, Compose, Ports und Volumes                     | [Runtime](runtime.md)                               |
| Bestehenden Betrieb ohne Neuinstallation wiederaufbauen      | [Betrieb wiederherstellen](rebuild.md)              |
| HTTPS einrichten und betreiben                               | [TLS](tls.md)                                       |
| Patientenzugang: Apply/Remove, Crash-Recovery, Updatevertrag | [Restricted-Lifecycle](restricted-lifecycle.md)     |
| Netzplanung und Vor-Ort-Prüfung durch die Praxis-IT          | [Netzwerkisolation](praxis-it-network-isolation.md) |
| Sicherung und Restore                                        | [Backup](backup.md)                                 |
| SMS, CSV und Grenzen weiterer Integrationen                  | [Integrationen](integrations.md)                    |

Noch fehlende Produkt-/Plattformnachweise: [Offene Abnahmen](../open-items.md).
Betriebsvertrag und Abnahmestatus sind getrennt; eine beschriebene Funktion ist
kein Nachweis ihrer Freigabe auf jeder Plattform.

## Andere Leser

- [Manager-Bedienung und Entwicklung](../../manager/README.md)
- [Architektur](../architecture/README.md)
- [Fachliche Abläufe](../flows.md)
- [TLS-Lab für Entwickler](../development/tls-lab.md)

Abgelöste Implementierungspläne werden nicht parallel fortgeschrieben; ihre
Historie bleibt in Git. Das [Archiv](../archive/README.md) enthält nur noch
historische Nicht-Produkt-Entwürfe.
