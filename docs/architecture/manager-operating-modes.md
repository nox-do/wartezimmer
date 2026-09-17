# Betriebsmodi im Manager

Zentrale, lesende Einordnung im Setup-Backend mit Darstellung und Navigation im Manager.
Es gibt keinen zusätzlich gespeicherten Betriebsmodus und keine Datenmigration.

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
- `HostStatus.lifecycle`: additive fachliche Sicht. Alte API-Felder bleiben erhalten.
- `lifecycleKey` in Config und Runtime: Vergleich ausschließlich öffentlicher
  abgeleiteter Metadaten. Änderungen lösen einen Config-Refresh aus, auch wenn
  Praxisadresse und Proxy-Flag unverändert bleiben. Runtime überschreibt Config nicht.
- `HostLifecycleSummary`: Anzeige auf der Statusseite; UI-Entwürfe bleiben lokal.
- Erststart: Nur ein bestätigt nicht installierter Zustand öffnet automatisch den
  Vollbild-Assistenten. Vorhandene Installationen bleiben auch bei Docker-Ausfall
  auf der Statusseite. Unklare oder inkonsistente Zustände zeigen die Diagnose und
  einen bewussten Einstieg in den eingebetteten Assistenten.
- Netzwerkübersicht: Verbindung und Publikationsumfang folgen dem bestätigten Modus.
  Bei unbekannter Einordnung wird weder HTTP noch eine Freigabe auf allen NICs
  behauptet. Offene Portaländerungen werden als noch nicht abgeschlossen angezeigt.
  Alte Setup-Hosts ohne Lifecycle-Feld behalten die bisherige UI-Ableitung.

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

## Grenzen dieses Schritts

Dies ist keine vollständige Installationsvalidierung und keine neue Recovery-Maschine.
Die bisherigen Statusfehler (z. B. ungültige Proxy-Konfiguration) und die vorgeschaltete
Recovery-Sperre des Setup-Servers bleiben bestehen. Wenn sie eine Statusantwort
verhindern, erscheint weiterhin der vorhandene API-Fehler; es wird kein Ersatzmodus
angezeigt. Andere Schreibabläufe erhalten hier kein neues Journal oder Commit-Protokoll.
Aktionsfreigaben und die vorhandenen Detailprüfungen bleiben unverändert.

Wiederaufbau und erneute Einrichtung sind die bevorzugten weiteren Reparaturwege.
Generierte Konfiguration und Container dürfen neu erzeugt werden; Praxisdaten,
Zertifikate, private Schlüssel, ACME-Zugang und die zugehörige TLS-Identität müssen
erhalten bleiben. Dieser Schritt bietet dafür noch keine neue Reparaturaktion an
und darf insbesondere nicht auf den destruktiven Install-Reset verweisen.

Nächste Schritte: Einen ausdrücklich datenerhaltenden
Wiederaufbau konkretisieren und anschließend vorhandene Übergangsprüfungen gemeinsam
nutzen. Eigene Domains für den separaten Portalzugang bleiben ein eigener Funktionsausbau.
