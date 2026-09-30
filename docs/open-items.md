# Offene Abnahmen und Entscheidungen

Konsolidiert am 2026-09-30 aus den bisherigen Reviews und Betriebsdokumenten.
„Offen“ bedeutet hier: Ein abschließender Nachweis beziehungsweise eine Entscheidung
ist in den geprüften Unterlagen nicht dokumentiert. Automatisierte Tests ersetzen
keine Abnahme der konkreten Host-/Netzwerkkombination.

## Release- und Plattformabnahmen

| Thema                              | Noch zu dokumentierender Nachweis                                                                                                                                                                                                             | Aktueller Vertrag                                              |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Windows                            | Manager paketieren/installieren; Windows-/Docker-Desktop-Mindestversionen festlegen; parallele Staff-/Restricted-IP-Publishes auf 443 sowie Update/Restore/Rollback nachweisen                                                                | [Netzwerkisolation](operations/praxis-it-network-isolation.md) |
| Restricted-Zugang in realen Netzen | Zwei-NIC-Matrix: erlaubte Zugriffe sowie gekreuzte Host-/SNI-Werte, globale Bindings und IPv6 negativ prüfen; DHCP-/Adressverlust, Docker-/Host-/Router-Neustart und Stromausfall einschließlich Fail-closed-Verhalten prüfen                 | [Restricted-Lifecycle](operations/restricted-lifecycle.md)     |
| Portal-Auslieferung                | Frische Installation und Upgrade einer älteren TLS-Installation aus dem DMG; vorbereitetes/aktives Binding über Update und Restore; Apply/Remove bei laufenden und gestoppten Diensten; genaue macOS-/Docker-Desktop-Versionen protokollieren | [TLS](operations/tls.md)                                       |
| Neuinstallation mit Recovery       | Abschließender Manager-E2E-Durchlauf mit echtem Docker-Stack, Backup-Übernahme, Fehlerfall und Wiedereinstieg                                                                                                                                 | [Recovery](operations/reinstall-recovery.md)                   |
| Proxy-Reparatur                    | Praktischer Repair-Smoke mit bestehender TLS-Identität; automatisierte Identitätserhaltung allein beweist keinen erfolgreichen Container-Neustart ohne neue ACME-Ausstellung                                                                  | [TLS](operations/tls.md)                                       |
| Manager-Zugänglichkeit             | Native Tastaturbedienung, Fokus nach aufklappender Diagnose und Fehlerankündigungen im Electron-Manager prüfen                                                                                                                                | [Manager](../manager/README.md)                                |

Nachweise jeweils mit Datum, Plattformversionen, Szenario und Ergebnis ergänzen.
Ein erledigter Teiltest schließt nicht automatisch die gesamte Zeile.

Bereits dokumentierter Teilnachweis: Eigene ACME-Domain mit Pebble/Caddy am
2026-09-28 erfolgreich geprüft (Wildcard, DNS, Bindings, HTTPS-Cutover,
HTTP-Redirect, HTTP/2 und SSE); siehe [TLS-Prüfstand](operations/tls.md#review-und-regressionstests-für-eigene-domains).
Das ersetzt weder Windows- noch reale Zwei-NIC-Abnahme.

## UI- und technische Folgeentscheidungen (keine Release-Zusage)

- Manager-Buttonfarben: Grün für Hauptaktionen und hellgraue Sekundärbuttons wurden vorgeschlagen, aber noch nicht bestätigt oder umgesetzt. Die lokale Anzeige der Übernehmen-Buttons je geändertem Netzwerkbereich ist bereits umgesetzt.
- Erweiterte Domain-/PEM-Einrichtung: weitere Vereinfachung bei Bedarf. HTTPS lebt bereits ausschließlich unter Netzwerk; kein zusätzlicher Wizard-HTTPS-Schritt.
- Multi-Tab-SSE: vor einer BroadcastChannel-/Leader-Lösung Browserlimit, Verbindungen und REST-Verzögerung messen. Keine rollenübergreifende Koordination oder Weitergabe von Auth-Tokens. Direkte SSE-Verbindungen müssen als Fallback möglich bleiben; siehe [Echtzeit](architecture/realtime.md).

## Fachliche Fragen und optionale Produktideen

Diese Punkte stammen aus den bisherigen Flow-Notizen; sie sind keine zugesagte Roadmap.

- Erstanamnese-Fragenkatalog mit der Praxis abschließen.
- Klinische Zuständigkeit für Dokumentzugriff (Arzt/MFA), Zielsystem der Übernahme und Aufbewahrung exportierter Dateien klären. Aktuell verarbeitet die MFA Dokumente; temporärer Intake und Tagesreset sind beschrieben unter [Dokumente](architecture/documents.md).
- Upload-/Ticketcode-Limits fachlich bewerten. Ticketcode-Auflösung besitzt bereits einen Rate-Limiter; dieser Punkt behauptet keine generell fehlende technische Begrenzung.
- PVS-Vendor-Anbindung und eGK bleiben Discovery; Captive-Adapter sind nicht Portal-v1. Grenzen: [Integrationen](operations/integrations.md).
- Terminal-Ideen: optionaler Idle-/Bannerzustand und explizite Anzeige bei geschlossener offener Sprechstunde. Aktuelle Flows verwenden die vorhandenen Themen-/Betriebsguards.
- Für einen realen SMS-Rollout Zuständigkeit für Anbietervereinbarung, Zweckbindung und Speicherdauer festhalten; keine Implementierungszusage aus alten Flow-Notizen ableiten.
