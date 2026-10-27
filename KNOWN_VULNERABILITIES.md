# Bekannte Sicherheitslücken

**OFFEN: Der Wartezimmer Manager enthält mit Electron 44.4.3 eine von
CVE-2026-111497 betroffene Runtime. Das eingebettete Setup ist ebenfalls betroffen.**
Der lokale Betrieb reduziert die Exposition, ersetzt aber keinen Fix. Die
Behebung im Manager ist bewusst bis zu einem bestätigten stabilen Electron-Fix
zurückgestellt. Dies ist keine Einstufung als „nicht betroffen“.

Stand und letzte Bewertung: **27. Oktober 2026**. Dieser Eintrag muss bei
Electron-Updates, Änderungen der Netzwerkzugriffe und vor Manager-Releases erneut
geprüft werden. Für Release 6.1.6 erneut geprüft: Runtime und Netzwerkpfade sind unverändert;
die Lücke bleibt offen. Die Angaben zu verfügbaren Electron-Versionen sind eine Momentaufnahme.

## CVE-2026-111497 im Manager und Setup

Der Brotli-Decoder kann beim Entpacken präparierter Daten Prozessspeicher
überschreiben. Mögliche Folgen sind Abstürze, Speicherabfluss und Codeausführung.
Node bestätigt den Fix in 22.23.4, 24.22.1 und 26.12.1.

| Bereich               | Stand und Exposition                                                                                                                                                                                                                                                         |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Manager               | `manager/package.json` und `package-lock.json` legen Electron 44.4.3 fest. Laut Electron enthält diese Version Node 24.21.0, vor dem Node-Fix.                                                                                                                               |
| Lokale Setup-API      | Der Manager verwendet `http://127.0.0.1:<port>` in `manager/src/main/setup-server.ts`; `manager/src/main/setup-api.ts` verarbeitet die Antworten über `fetch()`. Ein Angreifer müsste für diesen Pfad zunächst den lokalen Antwortdienst kontrollieren oder ersetzen.        |
| Eingebettetes Setup   | `startPackagedSetupServer()` startet das Setup mit `process.execPath` und `ELECTRON_RUN_AS_NODE=1`. Es verwendet damit die Electron-Runtime des Managers, nicht ein separat installiertes Node.                                                                              |
| Externer Setup-Aufruf | `registerAcmeDnsDefault()` in `setup/src/host-tls.ts` ruft beim entsprechenden TLS-Setup den konfigurierten ACME-DNS-Server mit `fetch()` auf und liest JSON. Ein bösartiger oder kompromittierter Antwortserver kann damit Brotli-Daten an die verwundbare Runtime liefern. |

Die Bewertung der konkreten Angriffswege beruht auf dem Projektcode. Ein allgemein
aus dem Internet erreichbarer Angriffspfad zum Manager wurde dabei nicht
nachgewiesen. Neue externe Abrufe, Remote-Setup-Zugriffe oder eingehende
Dekompression erfordern eine erneute Bewertung; die bisherige geringere Exposition
darf dann nicht ungeprüft übernommen werden.

## Entscheidung und verbleibendes Risiko

Die Dockerfiles für App und Sandbox sowie die CI-Workflows legen Node 22.23.4
fest. Das behebt die separate Runtime des Managers nicht. Bereits gebaute oder
ausgelieferte Images müssen neu gebaut und ersetzt werden.

Nach den am 27. Oktober 2026 geprüften offiziellen Release-Angaben enthalten
Electron 44.9.3 und 45.0.0 noch Node 24.22.0; sie sind damit kein bestätigtes
Update-Ziel für diese Lücke. Electron 46.0.0-alpha.1 enthält Node 24.22.1, wird
wegen des Vorabstatus und des größeren Versionssprungs derzeit nicht als
Produktionslösung eingesetzt. Ein bestätigter Backport kann auch ohne Änderung
der eingebetteten Node-Versionsnummer relevant sein und muss anhand der
Electron-Release-Notes geprüft werden.

Bis zum Fix nur vertrauenswürdige ACME-DNS-Server konfigurieren und den Manager
weiter mit lokaler Setup-API betreiben. Diese Maßnahmen reduzieren die Exposition;
sie schließen die Lücke nicht. Das Entfernen von `br` aus `Accept-Encoding` gilt
nicht als Behebung. Auch ein erfolgreiches `npm audit` oder ein Update des
separaten Host-Node belegt keine Behebung im Manager.

## Voraussetzungen zum Schließen des Eintrags

- [ ] Einen stabilen Electron-Release mit bestätigtem Brotli-Fix ermitteln
      (gepatchtes eingebettetes Node oder dokumentierter Electron-Backport).
- [ ] Electron in `manager/package.json` und `package-lock.json` aktualisieren.
- [ ] Manager und eingebettetes Setup bauen und testen; insbesondere Start,
      Setup-API/IPC, TLS-Einrichtung sowie Installation, Update und Recovery prüfen.
- [ ] Gepackte macOS- und Windows-Anwendungen prüfen, einschließlich der tatsächlich
      eingebetteten Runtime und des Setups ohne externes Node/npm auf dem Suchpfad.
- [ ] Korrigierte Manager-Pakete ausliefern und die behobene Wartezimmer- und
      Electron-Version sowie Prüfnachweise hier dokumentieren.
- [ ] Erst danach den Status hier und die offenen Hinweise in `AGENTS.md`,
      `README.md`, `SECURITY.md` und `manager/README.md` aktualisieren.

## Bereits geprüfter Node-Patch

Unter der offiziellen macOS-arm64-Runtime Node 22.23.4 liefen die vorhandenen
Testgruppen einschließlich Datenbank, Setup, Sandbox, Manager-Logik, Messaging,
Flow-Core, UI und App-Netzwerktests erfolgreich. App- und UI-Build, eine gültige
Brotli-Antwort über `fetch()` und die TLS-Verbindung zu `gateway.seven.io` wurden
ebenfalls erfolgreich geprüft. Diese Prüfung ersetzt weder einen Test mit einer
gepatchten Electron-Runtime noch die Prüfung der neuen Alpine-Images und des
Windows-Betriebs.

## Offizielle Quellen

- [Node Security Advisory vom 21. Oktober 2026](https://nodejs.org/en/blog/vulnerability/october-2026-security-releases)
- [Node 22.23.4 Release Notes](https://nodejs.org/en/blog/release/v22.23.4)
- [Electron 44.4.3 mit Node 24.21.0](https://releases.electronjs.org/release/v44.4.3)
- [Electron 44.9.3 mit Node 24.22.0](https://releases.electronjs.org/release/v44.9.3)
- [Electron 45.0.0 mit Node 24.22.0](https://releases.electronjs.org/release/v45.0.0)
- [Electron 46.0.0-alpha.1 mit Node 24.22.1](https://releases.electronjs.org/release/v46.0.0-alpha.1)
