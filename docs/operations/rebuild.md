# Betrieb wiederherstellen

Im Manager unter **Wartung → Betrieb & Updates → Betrieb wiederherstellen**.
Die Aktion verwendet die gespeicherten Einstellungen und die bereits lokal
vorhandenen Images. Sie ist weder Installation noch Update oder Backup-Restore.

## Voraussetzungen und Abbruch

- `.env` muss vorhanden und ausreichend gültig sein. Nicht maskierte Dollarzeichen
  in Werten führen vor jedem Docker-Aufruf zum Abbruch, damit Compose keine Secrets
  durch Variablenersetzung verändert. Die Datei wird nicht automatisch korrigiert.
  Fehlende Konfiguration wird
  nicht aus Zertifikaten, Sicherungen oder Containern rekonstruiert.
- Docker muss antworten; die installierte Compose-Konfiguration muss lesbar sein.
- Alle Images der konfigurierten Produktdienste müssen lokal vorhanden sein.
  Es gibt keinen Pull und keinen Build, auch nicht nach erfolgreicher Vorprüfung.
- Datenvolumes und eingebundene Host-Pfade müssen vorhanden sein. Es werden keine
  leeren Ersatzvolumes angelegt.
- Proxy-Bindings müssen zur lokalen Netzwerkkonfiguration passen.
- Ein offenes Restricted-Journal sperrt diese Aktion. Beim Erzeugen des Setup-
  Servers läuft die allgemeine Recovery zuerst; der HTTP-Rebuild wartet auf
  dieses Ergebnis und startet keine zweite Recovery. Erst danach prüft der
  Wiederaufbau das Journal selbst und bricht ab, falls es weiterhin offen ist.
- HTTPS benötigt den installierten `state/tls/portal-contract.json`. Es gibt hier
  keinen Rückgriff auf den Standardvertrag des Managers. Ältere Installationen
  ohne diese Datei benötigen zunächst ein passendes Updatepaket.
- Bei aktivem Managed HTTPS müssen gültiges Zertifikat und passender Schlüssel
  im vorhandenen Caddy-Cache liegen; Custom TLS prüft das vorhandene PEM-Paar.
  Fehlendes oder abgelaufenes Material wird durch diese Aktion nicht ersetzt.

Diese Prüfungen erfolgen vor Änderungen an installierten Dateien oder bestehenden
Containern. Die Proxy-Konfiguration wird in einem kurzlebigen Container aus einem
lokalen Image geprüft: ohne Netzwerk, ohne Portfreigaben und ohne schreibbaren
Zugriff auf vorhandene TLS-Daten.

## Ablauf und Erhalt

Die Image-IDs werden nach der lokalen Prüfung für diesen Lauf festgeschrieben.
Bei HTTPS wird das Caddyfile aus den gespeicherten Einstellungen und dem
installierten Portalvertrag neu erzeugt. Die vorhandene HTTP-Proxy-Datei wird
validiert und beibehalten. Beschädigte oder fehlende Compose-/HTTP-Vorlagen werden
nicht durch möglicherweise abweichende Manager-Vorlagen ersetzt.

Laufende oder teilweise laufende Produktdienste werden mit `--force-recreate`,
`--no-build`, `--pull never` und ohne zusätzliche Abhängigkeitsstarts neu erzeugt.
Danach folgen Health- und Binding-Prüfungen sowie bei aktivem Portal das
Host-/SNI-/Pfad-/Methoden-Audit.

Ein vollständig gestoppter Stack bleibt gestoppt. Die Erfolgsmeldung unterscheidet
hier ausdrücklich zwischen wiederhergestellter Konfiguration und noch ungeprüfter
Laufzeit. Der spätere Start ist eine eigene Aktion.

`.env` einschließlich Secrets und TLS-Identität bleibt unverändert. Auch die sonst
übliche Compose-Escaping-Normalisierung ist für diesen Pfad ausgeschaltet.
Praxisdaten, Zertifikate, Schlüssel, ACME-Zugang und Import-/Exportordner werden
nicht ersetzt oder gelöscht. Der normale Dienstbetrieb nach dem Wiederanlauf kann
wie üblich Daten schreiben und Zertifikate automatisch erneuern.

Bei einem Start- oder Auditfehler werden die Produktdienste gestoppt und das vorige
Caddyfile zurückgeschrieben. Schlägt auch das Stoppen fehl, nennt die Fehlermeldung
explizit den ungeklärten Laufzustand. Es gibt keinen automatischen Image-Download,
keinen Install-Reset und keinen automatischen Wiederanlauf nach gescheitertem Audit.
Die Aktion ist erneut ausführbar; sie führt kein neues allgemeines Crash-Journal ein.

API: `POST /api/setup/host/rebuild`, unter dem bestehenden Host-Mutationslock.
