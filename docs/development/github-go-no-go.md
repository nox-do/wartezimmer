# Go No Go Checkliste für die GitHub Veröffentlichung

Diese Checkliste entscheidet über die öffentliche Veröffentlichung von Wartezimmer. Wir gehen sie in der angegebenen Reihenfolge durch und halten zu jedem Punkt Entscheidung und Nachweis fest. Quellcode, installierbare Pakete und Website erhalten jeweils eine eigene Freigabe.

## Freigaberegeln

- **GO:** Alle Pflichtpunkte des gewählten Umfangs sind bestanden und für denselben Commit belegt.
- **NO-GO:** Ein Pflichtpunkt ist fehlgeschlagen oder noch offen. Fehlende Nachweise zählen als offen.
- **ENTFÄLLT:** Nur bei Punkten außerhalb des gewählten Umfangs, mit Begründung.
- Ein Häkchen bedeutet: Freigabekriterium erfüllt und Nachweis eingetragen. Eine vorhandene Datei oder ein vorhandenes Testskript genügt allein nicht.
- Verbesserungen ohne Einfluss auf die Freigabekriterien dürfen mit Verantwortlichem und Termin nachgezogen werden. Pflichtpunkte werden nicht dadurch erledigt, dass ein Issue angelegt wird.

## Umfang und Verantwortliche

Vor der Prüfung ausfüllen:

**Releaseziel vom 14. Oktober 2026:** Reguläre Version für den produktiven Praxisbetrieb, einschließlich Windows x64. Wir haben die Patientenportal-Netztrennung unter Windows x64 auf echter Hardware geprüft; im Interview bestätigt. Windows ARM erhält die Kennzeichnung Early Access: Die bisherigen Versuche erfolgten in einer VM und genügen nicht für eine reguläre Freigabe. Ein natives Windows-ARM-Releasepaket gehört nicht zum bisherigen Paketumfang. [Docker kennzeichnet ebenfalls Windows ARM als Early Access, nicht Windows x86_64](https://docs.docker.com/desktop/setup/install/windows-install/). [Portveröffentlichung mit Bindung an eine konkrete Hostadresse und Host-Firewall-Regeln sind dokumentiert](https://docs.docker.com/desktop/features/networking/). Für die Freigabe bleiben die konkreten Testumgebungen und Ergebnisse dem Veröffentlichungskandidaten zuzuordnen.

| Angabe                                          | Festlegung                                                    |
| ----------------------------------------------- | ------------------------------------------------------------- |
| Zielrepository und Eigentümer                   | `nox-do/wartezimmer`, `git@github.com:nox-do/wartezimmer.git` |
| Öffentlicher Quellcode                          | Ja                                                            |
| Installierbares Release                         | Ja                                                            |
| GitHub Pages Website                            | Nein, außerhalb der ersten Veröffentlichung                   |
| Releaseversion                                  | 6.1.3; am 14. Oktober 2026 festgelegt                         |
| Zu veröffentlichender Commit                    | Offen                                                         |
| Verantwortlich für technische Prüfung           | Offen                                                         |
| Verantwortlich für Lizenz, Inhalte und Freigabe | Offen                                                         |
| Datum der Entscheidung                          | Offen                                                         |

## A Öffentlicher Quellcode

Alle Punkte A01 bis A11 sind Pflicht für die Veröffentlichung des Repositorys einschließlich des vereinbarten Overviews.

- [ ] **A01 Veröffentlichungsumfang und Git-Historie festlegen.** Zielrepository, Eigentümer, öffentlicher Branch und Umgang mit bisherigen Commits und Tags sind entschieden. Auch Archive unter `docs/archive/` werden bei einer Repository-Veröffentlichung sichtbar; ihr Ausschluss vom Website-Build schützt sie dort nicht. Offene lokale Änderungen sind geprüft und bewusst übernommen oder aus dem Veröffentlichungskandidaten ausgeschlossen.
  - Status: Teilweise festgelegt. Zielrepository am 14. Oktober 2026 bestätigt: `nox-do/wartezimmer`. Die vollständige Git-Historie soll nach Prüfung veröffentlicht werden. Die offenen lokalen Änderungen einschließlich dieser Checkliste sollen gemäß Nutzerauftrag eingecheckt werden. Auswahl der zu veröffentlichenden Branches und Tags offen. Remote `origin` eingerichtet. SSH mit `id_rsa` und macOS-Keychain funktioniert; GitHub erkennt `nox-do`. Zielrepository ist erreichbar und enthält noch keine Branches. Zugriff auf `client-concepts` ebenfalls bestätigt.
  - Nachweis / Verantwortlich: Offen.

- [ ] **A02 Geheimnisse und private Daten ausschließen.** Ein Secret-Scan und eine Sichtprüfung decken den Veröffentlichungskandidaten und die gesamte zur Veröffentlichung vorgesehene Git-Historie ab. Keine echten Patienten- oder Praxisdaten, Zugangsdaten, Tokens, privaten Schlüssel, Dumps oder Backups enthalten; auch Screenshots, Fixtures, Archive und Konfigurationsbeispiele prüfen. Gefundene echte Zugangsdaten werden ersetzt beziehungsweise widerrufen und aus dem Veröffentlichungsumfang entfernt. Den geprüften Umfang und bereinigte Befunde dokumentieren, ohne Geheimnisse in den Nachweis zu kopieren.
  - Status: Quelltext-Mustercheck am 14. Oktober 2026 ohne Befund: 320 erreichbare Commits, 7346 eindeutige Textblobs (Stand `d2d0afb`) und drei lokale Secret-Werte geprüft. Muster für private Schlüssel sowie GitHub-, AWS-, Slack- und Stripe-Zugangsdaten geprüft. 58 binäre Blobs separat zu bewerten; kein vollständiger Nachweis für beliebige Secret-Formate. `npm run check:repository` bestanden, 1466 erfasste Pfade zum Zeitpunkt der Vorprüfung. `.env`, `backups/` und `dumps/` sind ignoriert und aktuell nicht erfasst. Der Hygienecheck prüft Dateimuster und einzelne Schlüsselmarker, keinen vollständigen Secret-Scan oder die Historie.
  - Im Interview am 14. Oktober 2026 bestätigt: Wir haben keine echten Patienten- oder Praxisdaten verwendet. Den seven.io-API-Key haben wir ausschließlich über das WebUI hinterlegt. Der Speicherweg in `database-messaging.ts` schreibt Zugangsdaten in die Laufzeitdatenbank; Standardpfad laut `database.ts`: `/var/lib/wartezimmer/app/wartezimmer.db`. Eine Prüfung der Dateinamen in der erreichbaren Git-Historie fand keine `.env`, SQLite-Dateien, Backups, Dumps oder Dateien unter `data/`; die gefundene `lab/coredns/lan.tls.lab.db` ist eine DNS-Zonendatei. Das ist noch kein vollständiger Secret-Scan. Kein bestätigter Leak; Widerruf nur bei festgestellter Offenlegung erforderlich. Laufzeitdaten dürfen nicht in Releasepakete gelangen. Den Schlüsselwert nicht in Prüfprotokolle übernehmen.
  - Nachweis / Verantwortlich: Offen.

- [ ] **A03 Rechte und Lizenzumfang klären.** Die Verantwortlichen bestätigen die Veröffentlichung des eigenen Codes, der Beiträge, Bilder, Schriften und eingebundenen Komponenten. `LICENSE`, `THIRD_PARTY_NOTICES.txt`, Drittanbieter-Lizenzen und öffentliche Beschreibungen stimmen überein. Die eigene Wartezimmer-Lizenz 1.1 und die Bezeichnung „Source-available“ sind bewusst gewählt; Assets und Website-Inhalte haben einen nachvollziehbaren Lizenzumfang.
  - Status: Teilweise bestätigt. Wir haben die eigene Lizenz bewusst gewählt; die aktuelle Website-Darstellung ist unsere Referenz. `website/lizenz.html` erhält den vollständigen Text beim Build aus der Root-Datei `LICENSE` (Version 1.1 vom 13. Oktober 2026). Die Lizenzzusammenfassungen in Root-README und Website stimmen inhaltlich überein. Der veraltete Verweis auf Abschnitt 3.2 in der Flow-Core-README wurde auf Abschnitt 3 korrigiert. Die Vollständigkeit der Drittanbieterhinweise bleibt zu prüfen.
  - Herkunft der eigenen Inhalte: Unser eigener Projektcode stammt vollständig von uns; eingesetzte Bibliotheken prüfen wir separat. Bilder und Texte haben wir gemeinsam mit Codex generiert. Im Interview am 14. Oktober 2026 bestätigt. Die Herkunft der eigenen Inhalte ist damit im Interview geklärt. Drittanbieterkomponenten, Schriften und Vollständigkeit der Lizenzhinweise bleiben separat zu prüfen.
  - Nachweis / Verantwortlich: Offen.

- [ ] **A04 Start aus einem frischen Clone nachweisen.** Eine separate Testumgebung startet mit dokumentierten Voraussetzungen, `npm ci`, `.env.example` und eigenen Testzugangsdaten. Docker-Start und die in der README beschriebenen Oberflächen funktionieren ohne Dateien aus dem bisherigen Entwicklerrechner. Beispiele enthalten ausschließlich fiktive Daten; die initiale PIN und ihr Änderungsweg sind verständlich dokumentiert.
  - Status: Frischer lokaler Clone von Commit `34ec949`: `npm ci`, vollständiger Build und nativer Start mit eigener temporärer Datenbank und Import-/Exportordnern bestanden. Der vollständige Docker-Start nach README ist noch separat zu prüfen.
  - Nachweis / Verantwortlich: Isolierter Checkout `/private/tmp/wartezimmer-release-check-20261014`; Installations-, Build- und Startlogs in `/private/tmp/wartezimmer-fresh-*-20261014.log`.

- [x] **A05 Vollständige technische Prüfung bestehen.** `npm run verify` und `npm run build` laufen am Veröffentlichungskandidaten erfolgreich. Das zusätzliche Build prüft auch den Backend-Build; `verify` allein ersetzt ihn nicht. Fehler werden behoben und betroffene Prüfungen erneut ausgeführt.
  - Status: Bestanden am 14. Oktober 2026. `npm run verify` vollständig erfolgreich, einschließlich aller Workspace-Tests, Typprüfung, Drift-Prüfung, UI-Build und UI-Secretcheck. `npm run build` ebenfalls erfolgreich. HTTP-Tests benötigten lokale Testports außerhalb der Sandbox.
  - Nachweis / Verantwortlich: Commit, Befehle und Ergebnisse eintragen.

- [ ] **A06 Abhängigkeiten und bekannte Schwachstellen bewerten.** npm-Abhängigkeiten und eingesetzte Container sind geprüft. Sicherheitsbefunde sind nach Erreichbarkeit und Auswirkung bewertet; keine ungeklärte Schwachstelle mit erheblicher Auswirkung im ausgelieferten Betrieb. Festgestellte Grenzen und erforderliche Maßnahmen sind dokumentiert.
  - Status: `npm audit --omit=dev` am 14. Oktober 2026 ohne bekannte Schwachstellen. Vollständiger npm-Audit inklusive Entwicklungstools meldet 38 Befunde, darunter zwei kritische bei Vitest/Tinypool; Bewertung des ausgelieferten Umfangs noch offen. Docker Scout nach ausdrücklich erlaubter Übertragung an Docker durchgeführt: ARM64-App ohne hohe/kritische Befunde, Sandbox mit zwei hohen Befunden (`pcre2`, `libxml2`), Proxy mit hohen und kritischen Befunden in Alpine-/Go-Paketen. Containerbefunde noch zu bewerten beziehungsweise zu beheben; kein reguläres GO für die Pakete aus diesen Scans.
  - Nachweis / Verantwortlich: npm-Audit-Berichte in `/private/tmp/wartezimmer-*-audit-20261014.json`; Scout-SARIF-Berichte im Releaseordner `dist/releases/6.1.3/SCOUT-*.sarif.json`. Finale Releaseimages für AMD64 und ARM64 erneut gescannt; je Architektur App und Proxy ohne hohe/kritische Befunde, Sandbox mit einem hohen libxml2-Befund. Aktuelle Berichte: `SCOUT-{APP,SANDBOX,PROXY}-{amd64,arm64}.sarif.json`.
  - Sandbox-Nachprüfung am 14. Oktober 2026: `pcre2` betrifft **CVE-2026-103111**. `sandbox/Dockerfile` verlangt jetzt mit `apk add --no-cache --upgrade ... 'pcre2>=10.49-r0'` mindestens die korrigierte Version; ein Repository ohne passende Version lässt den Build scheitern. Das offizielle Alpine-3.24-Repository liefert `10.49-r0`. Neue Prüfimages: `wartezimmer/sandbox:security-20261014-arm64` und `wartezimmer/sandbox:security-20261014-amd64`. Die Korrektur ist inzwischen in beiden neu gebauten Releasepaketen enthalten; laufende Container bleiben unverändert.
  - Validierung der Prüfimages: Beide Builds mit SBOM und Provenance bestanden. Scout meldet für ARM64 (Image-Manifest `sha256:11f2d859e4674992a07c7f1978d34e120d39919e798c96ea844838e9c092a6cb`) und AMD64 (Image-Manifest beginnend mit `sha256:d7c2b089d772`) jeweils **0 kritische und 1 hohen Befund**, ausschließlich libxml2. Paketprüfung bestätigt auf beiden Plattformen `pcre2 10.49-r0`, `libxml2 2.13.9-r2` und ClamAV `1.4.6-r0`. Scanner-Smokes ohne Netzwerk mit eigener harmloser Signatur bestehen: saubere PDF-Testdatei mit Exitcode 0, passende Testdatei erkannt mit Exitcode 1. `npm run -w @wartezimmer/sandbox test` bestanden. Build- und Scout-Protokolle liegen unter `/tmp/praxis-sandbox-security-{arm64,amd64}-{build.log,scout.txt}`; sie sind temporär und keine Nachweise für die bisherigen Releasepakete.
  - Proxy-Nachprüfung am 14. Oktober 2026: Caddy auf 2.11.7 aktualisiert, offizieller Builder per Digest gepinnt (Go 1.27.2), `golang.org/x/net` gezielt auf 0.60.0 gesetzt und stabile Alpine-Sicherheitsupdates eingespielt. Das acme-dns-Plugin bleibt auf 0.7.0. Neue Images `wartezimmer-proxy:2.11.7-acmedns-arm64` und `wartezimmer-proxy:2.11.7-acmedns-amd64` melden in Docker Scout jeweils **0 kritische und 0 hohe Befunde**. HTTP-Reverse-Proxy sowie HTTPS mit strenger Zertifikatsprüfung und HTTP/2 auf beiden Architekturen bestanden. `npm run verify`, Server-Shared-Tests und Release-Skripttests bestanden. Frühere Stock-/acmedns-Pakete werden weiterhin mit ihrem ursprünglichen Caddy-Digest akzeptiert. Alle sieben Release-Dateien aus Commit `d2d0afb` neu gebaut. Beide `.pfupdate`-Paketvalidierungen und sämtliche Nutzlastprüfsummen beider `.pfinstall`-Pakete bestanden. `SHA256SUMS.txt`, `BUILD-INFO.json` und `VALIDATION.json` aktualisiert. Laufende Container bleiben unverändert.
  - libxml2-Bewertung: **CVE-2026-86140** betrifft einen Stack-Pufferüberlauf in `xmlSnprintfElements` bei der Ausgabe eines DTD-Validierungsfehlers. `clamav-libs 1.4.6-r0` benötigt und lädt `libxml2.so.2`; Entfernen des Pakets würde den Scanner beschädigen. Die Sandbox übergibt eingehende Dateien an `clamscan`. PDF/JPEG/PNG-MIME-Header und das 25-MB-Limit sind keine Beweise gegen XML-Verarbeitung: MIME-Header kommen vom Aufrufer und ClamAV untersucht auch eingebettete Inhalte.
  - Erreichbarkeit: Im offiziellen [ClamAV-1.4.6-Quellcode](https://github.com/Cisco-Talos/clamav/tree/clamav-1.4.6/libclamav) verwenden die XML-Reader `CLAMAV_MIN_XMLREADER_FLAGS = XML_PARSE_NOERROR | XML_PARSE_NONET`, bei DMG zusätzlich `XML_PARSE_COMPACT`. Es wurden keine Aktivierung von `XML_PARSE_DTDVALID`, keine nachträgliche Reader-Validierung und keine direkten Aufrufe der betroffenen Validierungsfunktionen gefunden. Der [libxml2-2.13.9-Code](https://github.com/GNOME/libxml2/blob/v2.13.9/valid.c) ruft `xmlSnprintfElements` aus der Fehlerausgabe von `xmlValidateElementContent` auf. Daraus folgt: Im geprüften ClamAV-Aufrufpfad ist die konkrete CVE voraussichtlich nicht erreichbar. Das ist eine Quellcodebewertung, kein vollständiger dynamischer Nachweis für das Alpine-Binary und keine Behebung des Paketbefunds; bei Änderungen an ClamAV oder seinen Parseroptionen erneut prüfen. `XML_PARSE_NONET` allein wäre kein Schutz gegen diesen Pufferüberlauf.
  - Verfügbare Lösung: `apk policy` im Alpine-3.24-Container bestätigt weiterhin nur `libxml2 2.13.9-r2`; Scout nennt keine korrigierte Version. Upstream ist die CVE ab `2.15.4` korrigiert ([CVE-Nachweis und Fix-Verweis bei Red Hat](https://access.redhat.com/security/cve/cve-2026-86140)). Bevorzugt einen Alpine-Sicherheitsbackport übernehmen und anschließend beide Architekturen neu bauen und scannen. Falls der Paketbefund vor einer Freigabe vollständig behoben werden muss, einen eigenen getesteten Alpine-Backport oder einen Basiswechsel mit bereits korrigiertem Paket bewerten; [Ubuntu dokumentiert korrigierte Pakete](https://ubuntu.com/security/CVE-2026-86140). Ein Basiswechsel benötigt eigene ClamAV-, Laufzeit- und Releaseprüfungen. Keine ungeprüfte Mischung mit Edge-Paketen oder Ersetzung der Bibliothek durch eine inkompatible ABI. Bis zum Paketfix beziehungsweise einer ausdrücklich dokumentierten Risikoentscheidung bleibt libxml2 offen; keine pauschale Scanner-Ausnahme.

- [ ] **A07 Sicherheitsgrenzen praktisch prüfen.** Rollen, Sitzungen, Gerätefreigaben und Portalzugriff bestehen positive und negative Tests: Ein Patientengerät erhält keinen Zugriff auf MFA, Ops oder fremde Dokumente. Uploadprüfung, Dokumentenfreigabe und Sandbox-Zugriff entsprechen der dokumentierten Architektur. Änderungen an der Autorisierung sind durch passende Tests abgedeckt.
  - Status: Offen.
  - Nachweis / Verantwortlich: Unter anderem `smoke:auth-session`, `smoke:terminal-pairing`, `smoke:tv-pairing`, `smoke:doc-flow` sowie Tests für verweigerte Zugriffe protokollieren.

- [ ] **A08 Dokumentation und Produktversprechen abgleichen.** README, Betriebsdokumentation und Beispiele beschreiben den tatsächlichen Stand: lokale Verarbeitung, optionale externe Dienste, Netzwerkgrenzen, unterstützte Plattformen und ausgeschlossene Funktionen. Installation, Konfiguration und bekannte Einschränkungen sind auffindbar; Links und Demo-Inhalte sind geprüft.
  - Status: Offen.
  - Vereinbarter Betriebshinweis für 6.1.3: Nach Einrichtung oder Änderung der individuellen Routing-Konfiguration prüft die Praxis ihre vorgesehenen Abläufe mit fiktiven Besuchen, insbesondere jeden Complex-Routing-Pfad und benötigte Abweichungen. In Routing- und Betriebsdokumentation ergänzt; in die finalen Release Notes übernehmen. Dieser Hinweis ersetzt keine allgemeinen Softwaretests und kennzeichnet Complex Routing nicht als experimentell.
  - Zeitangabe: Auf meinem Laptop schaffe ich etwa fünf Minuten einschließlich Docker-Installation. Für die öffentliche Downloadseite als Orientierung bei eingerichtetem Docker Desktop beschrieben, abhängig von Hardware und Downloadzeiten.
  - Nachweis / Verantwortlich: Offen.

- [ ] **A09 GitHub Prüfungen und Zugriffsrechte festlegen.** Schreibrechte, Branch-Regeln, Workflow-Berechtigungen und Umgang mit Beiträgen sind festgelegt. Der vollständige Prüfweg für Änderungen ist eingerichtet und bestanden. Aktuell gibt es Workflows für Windows-Kompatibilität, Releasepakete und Pages; ein allgemeiner Workflow für `npm run verify` ist darunter nicht vorhanden. Release-Tags lösen den Paketbuild aus und müssen bewusst gesetzt werden.
  - Status: Schreib- und Freigaberechte entschieden. Am 14. Oktober 2026 festgelegt: Nur ich, Daniel Deuter, habe Schreib- und Freigaberechte; externe Beiträge erfolgen über Issues und abgestimmte Pull Requests. Tatsächliche Repository-Einstellungen, Branch-Regeln und vollständiger automatisierter Prüfweg noch zu prüfen.
  - Nachweis / Verantwortlich: Workflow-Lauf und Repository-Einstellungen eintragen.

- [ ] **A10 Support und private Sicherheitsmeldungen ermöglichen.** Nutzer finden einen erreichbaren Supportweg, einen privaten Meldeweg für Sicherheitsprobleme und Regeln für Beiträge. Öffentliche Issues sollen keine Patienteninformationen, Zugangsdaten oder unbereinigten Diagnosepakete enthalten. Zuständigkeit für neue Meldungen ist benannt.
  - Status: Kontaktwege, Zuständigkeit und Beitragsprozess festgelegt. Am 14. Oktober 2026 festgelegt: GitHub Issues in `nox-do/wartezimmer` für Entwickler, `info@notaus.de` für Anwender. Ich betreue beide Kontaktwege selbst. Für vertrauliche Sicherheitsmeldungen wird ebenfalls `info@notaus.de` verwendet. Externe Beiträge nur nach Absprache: zuerst ein Issue, dann ein abgestimmter Pull Request. In README, `SECURITY.md` und `CONTRIBUTING.md` dokumentiert; ausdrückliche Zustimmung zur Beitragsregelung aus Abschnitt 3 der Lizenz berücksichtigt. Verfügbarkeit der GitHub Issues noch zu prüfen.
  - Nachweis / Verantwortlich: Interview, README, SECURITY.md und CONTRIBUTING.md; Daniel Deuter. Repository-Konfiguration noch offen.

- [ ] **A11 Projektübersicht mitpflegen.** Der Overview in [nox-do/client-concepts](https://github.com/nox-do/client-concepts) wird zur Veröffentlichung aktualisiert. Projektstatus, Repository-Link, angebotene Pakete, Lizenzbezeichnung und Funktionsumfang stimmen mit dem freigegebenen Stand überein. Änderungen im Overview werden bei künftigen Releases mitgeprüft.
  - Status: Overview per SSH gelesen. Wartezimmer-Eintrag mit Repository-Link, Release 6.1.3, Plattformen und Source-available-Hinweis in `index.html` und README lokal als Commit `5a862d6` vorbereitet. Veröffentlichung steht noch aus; Checkout: `/private/tmp/wartezimmer-client-concepts-20261014`.
  - Nachweis / Verantwortlich: Offen.

## B Installierbares Release

Pflicht, wenn Manager, `.pfinstall` oder `.pfupdate` veröffentlicht werden. Sonst jeden Punkt begründet als ENTFÄLLT markieren.

- [ ] **B01 Releasepakete eindeutig zuordnen.** Version, Tag, Commit, Manager und Installations-/Updatepakete passen zusammen. Pakete enthalten ausschließlich Produktionsartefakte und erforderliche Lizenzen. Unterstützte Architektur und Plattform sind eindeutig benannt; Prüfsummen sind vorhanden. Signierung beziehungsweise der tatsächliche Signierungsstatus und erwartete Betriebssystemmeldungen sind geprüft und dokumentiert.
  - Entscheidung am 14. Oktober 2026: Manager-Installer dauerhaft unsigniert veröffentlichen; Signierungskosten sollen vermieden werden. macOS ohne Signierung und Notarisierung, Windows ohne Codesignierung. Fehlende Signierung ist bewusst gewählt und allein kein NO-GO. Neue Manager-Pakete aus Commit `d2d0afb` gebaut; alle sieben Artefakte mit Prüfsummen und Commitzuordnung in `dist/releases/6.1.3/BUILD-INFO.json`. Paketarchitekturen und enthaltene Dateien geprüft; Windows ohne Authenticode-Zertifikat, macOS nur Ad-hoc-Signatur ohne Herausgeberidentität. Isolierter Setup-Smoke des paketierten ARM64-Mac-Managers bestanden. Erfolgreiche Installation und auftretende Betriebssystemmeldungen weiterhin den finalen Paketen zuordnen; Hinweise in Dokumentation und Release Notes aufnehmen.
  - Status / Nachweis / Verantwortlich: Offen.

- [ ] **B02 Neuinstallation auf unterstützten Plattformen bestehen.** macOS Apple Silicon, macOS Intel und Windows 11 x64 sind für die jeweils angebotenen Pakete geprüft. Installation und Start funktionieren mit den dokumentierten Voraussetzungen und mit dem paketierten Manager. Ein erfolgreicher Entwicklungsstart allein genügt nicht.
  - Status: Im Interview bestätigt. Wir haben Version 6.1.3 mit fertigem Manager und `.pfinstall`-Paket auf macOS Apple Silicon, macOS Intel und Windows 11 x64 vollständig neu installiert und gestartet; im Interview am 14. Oktober 2026 bestätigt. Paketprüfsummen, genaue Betriebssystem-/Docker-Versionen und Zuordnung zum finalen Releasecommit noch offen; deshalb noch kein abschließendes Häkchen.
  - Nachweis / Verantwortlich: Im Interview bestätigt; technische Zuordnung der getesteten Artefakte ergänzen.

- [ ] **B03 Praxisabläufe im Teststack bestehen.** `npm run smoke:all` läuft mit passender Konfiguration erfolgreich. Anmeldung, Warteliste, Raumzuordnung, Aufruf, Abwesenheit/Rückholen, Portal-Dokumente und Tageswechsel sind mit fiktiven Daten geprüft. Manager-, Proxy- und TLS-Prüfungen separat passend zum angebotenen Betriebsumfang ausführen.
  - Status: Manueller Praxisdurchlauf im Interview bestätigt. Wir haben in Version 6.1.3 Anmeldung, Warteliste, Raumzuordnung/Aufruf, Abwesenheit/Rückholen, Portal-Dokumente und Tageswechsel erfolgreich durchgespielt; im Interview am 14. Oktober 2026 bestätigt. Isolierte Smokes für Sitzungen, TV-/Terminal-Pairing einschließlich verweigerter MFA-Mutationen, Emergency, Ops-Einstellungen, Ops-Stream, Praxiszeiten und simulierten Rückholversand bestanden. Veraltete Testdaten und fehlende Rollenheader korrigiert. Paketierter ARM64-Mac-Manager sowie HTTP-/HTTPS-/HTTP2-Proxy-Smokes auf AMD64 und ARM64 bestanden. Live-ACME-DNS-Ausstellung wurde dabei nicht erneut geprüft. Dokumentenfluss, OpenAPI-Gesamtdurchlauf und Tageswechsel mit Sandbox noch offen; `smoke:all` noch nicht vollständig bestanden.
  - Nachweis / Verantwortlich: Im Interview bestätigt; Testumgebung und Zuordnung zu den finalen Paketen ergänzen.

- [ ] **B04 Update, Backup und Wiederherstellung bestehen.** Update von der angebotenen Vorgängerversion, Datenerhalt und Wiederherstellung eines Backups sind praktisch geprüft. Für ein Erstrelease ohne unterstützten Updatepfad ist dies ausdrücklich beschrieben; Backup und Restore bleiben Pflicht. Abbruch und Recovery einer fehlgeschlagenen Installation beziehungsweise eines Updates führen zu einem nachvollziehbaren, wiederherstellbaren Zustand.
  - Status: Teilweise im Interview bestätigt. Wir haben Backup/Wiederherstellung geprüft und eine abgebrochene Installation erfolgreich wiederhergestellt; im Interview am 14. Oktober 2026 bestätigt. `.pfupdate` soll bereits mit 6.1.3 öffentlich angeboten werden. Update-Test erst vor dem nächsten Release vorgesehen; Recovery nach fehlgeschlagenem Update nicht bestätigt. Nach unserem bisherigen Stand sind Update- und Erstinstallationsinhalt aktuell identisch; dies ersetzt keine Prüfung des Updateablaufs auf bestehender Installation. Der öffentliche Paketumfang ist entschieden; die Updateprüfung bleibt für ein reguläres GO offen. Eine Einstufung des Updatepakets als experimentell wurde nicht vereinbart.
  - Nachweis / Verantwortlich: Im Interview bestätigt; getestete Pakete und Umgebungen zuordnen, Update und Update-Recovery prüfen.

- [ ] **B05 Betriebsgrenzen bestätigen.** HTTPS, Patienten-/Team-Netztrennung, initiale Zugangsdaten, Exportpfade und externe Integrationen sind für die angebotene Betriebsart geprüft. Die Anleitung benennt, welche Einrichtung und Prüfung die Praxis-IT vor Ort leisten muss. Inbetriebnahme und Diagnose lassen sich anhand der Dokumentation durchführen.
  - Festgelegte Grenze: Windows x64 einschließlich Patientenportal-Netztrennung regulär vorgesehen. Auf echter x64-Hardware geprüft; im Interview am 14. Oktober 2026 bestätigt. Windows ARM bleibt Early Access; VM-Versuche liefern keine reguläre Abnahme. Testprotokoll, Plattformversionen und Zuordnung zum Releasekandidaten noch offen.
  - Nachrichtenversand: Wir haben SMS mit echtem Empfang erfolgreich getestet. WhatsApp haben wir noch nicht getestet; wir haben Datenschutzbedenken und freuen uns über Feedback von Interessierten. WhatsApp und zugehöriger SMS-Fallback werden als optionaler experimenteller Umfang dokumentiert, nicht als regulär abgenommen. Der Provider ist im Code standardmäßig deaktiviert. In Integrationsdokumentation und Website ergänzt; in Release Notes übernehmen.
  - Status / Nachweis / Verantwortlich: Offen.

- [ ] **B06 Öffentliche Downloads überprüfen.** Die finalen Dateien entsprechen den geprüften Paketen. Dateinamen, Versionen, Prüfsummen und Release Notes passen; alle angebotenen Downloads sind erreichbar. Bekannte Einschränkungen und Updatevoraussetzungen stehen beim Release.
  - Downloads: Alle Manager-Installer, `.pfinstall` und `.pfupdate` veröffentlichen wir im GitHub Release `v6.1.3` unter `nox-do/wartezimmer`.
  - Status / Nachweis / Verantwortlich: Offen.

## C Website auf GitHub Pages

**ENTFÄLLT für diese Veröffentlichung:** Am 14. Oktober 2026 wurde der Umfang auf Quellcode und installierbare Pakete festgelegt. C01 bis C04 werden erst bei einer späteren Website-Veröffentlichung geprüft.

Pflicht, wenn die Website veröffentlicht wird. Offene C-Punkte blockieren die Website-Freigabe; Quellcode und Pakete werden anhand ihrer eigenen Punkte entschieden.

- [ ] **C01 Veröffentlichungsplatzhalter auflösen.** Quellcode-Link, sieben Downloadlinks sowie Hosting- und Kontaktangaben sind mit bestätigten Angaben ausgefüllt. Veröffentlichungsmarker erst nach inhaltlicher Klärung entfernen.
  - Status: Quellcode-Link und alle sieben Downloadlinks für `v6.1.3` eingerichtet, Releaseübersicht und SHA256SUMS verlinkt. Hosting und Kontaktangaben bestätigt und ergänzt: ausschließlich GitHub Pages, E-Mail bei Google, Löschung von E-Mails und Kontakten nach Wegfall des Zwecks unter Beachtung gesetzlicher Aufbewahrungspflichten. Alle bisherigen Website-Platzhalter entfernt. Regulärer Website-Build mit Projektpfad, Website-Lint und zehn Website-Tests bestanden. Download-Erreichbarkeit erst nach Release-Veröffentlichung prüfen.
  - Nachweis / Verantwortlich: Offen.

- [ ] **C02 Öffentliche Inhalte freigeben.** Betreiber-, Kontakt-, Datenschutz- und Lizenzangaben sind durch die zuständige Person freigegeben. Produktversprechen einschließlich „In 5 Minuten startklar“ passen zu den getesteten Voraussetzungen. Illustrationen und Produktbilder mit fiktiven Daten sind zutreffend eingeordnet.
  - Status / Nachweis / Verantwortlich: Offen.

- [ ] **C03 Regulären Website-Build bestehen.** `npm run lint:website`, `node --test scripts/build-pages.test.mjs` und `npm run build:website` bestehen mit der endgültigen Konfiguration. Der Preview-Modus genügt nicht als Freigabenachweis. Links und Assets funktionieren unter dem tatsächlichen GitHub-Pages-Projektpfad; Desktop, Mobilansicht und Tastaturbedienung sind geprüft.
  - Status / Nachweis / Verantwortlich: Offen.

- [ ] **C04 Deployment und öffentliche Ansicht prüfen.** Pages-Konfiguration und gegebenenfalls `PAGES_BASE_URL` stimmen. Der manuelle Pages-Workflow ist erfolgreich; die veröffentlichte Website zeigt die freigegebene Fassung, funktionierende Downloads und keine privaten oder archivierten Inhalte im Website-Artefakt.
  - Status / Nachweis / Verantwortlich: Offen; unmittelbar nach Deployment prüfen.

## Ablauf der gemeinsamen Prüfung

1. Umfang, Verantwortliche und Veröffentlichungskandidat festlegen.
2. A01 und A02 zuerst bearbeiten, bevor Quellcode öffentlich wird.
3. Übrige A-Punkte und die gewählten B-/C-Punkte durchgehen. Pro Punkt Status, Nachweis und bei Fehlern konkrete nächste Maßnahme eintragen.
4. Alle Nachweise dem endgültigen Commit und den endgültigen Paketen zuordnen. Änderungen nach einer Prüfung erfordern eine erneute Prüfung der betroffenen Punkte.
5. Vor Veröffentlichung Go/No-Go für Quellcode, Pakete und Website getrennt festhalten. Öffentliche Sichtbarkeit, Downloads und Website nach dem jeweiligen Veröffentlichungsschritt abschließend prüfen.

Tests, Smokes, Installation und Recovery ausschließlich in einer separaten Testumgebung mit fiktiven Daten ausführen. Einzelne Smokes verändern den Zustand; vorab deren Voraussetzungen prüfen.

## Entscheidungsprotokoll

| Umfang                  | Entscheidung | Commit / Version | Verantwortlich / Datum          | Offene Pflichtpunkte         |
| ----------------------- | ------------ | ---------------- | ------------------------------- | ---------------------------- |
| Quellcode               | Offen        | Offen            | Offen                           | A01 bis A11                  |
| Installierbare Pakete   | Offen        | Offen            | Offen                           | B01 bis B06 oder ENTFÄLLT    |
| Website vor Deployment  | ENTFÄLLT     | —                | Umfang am 14.10.2026 festgelegt | Keine; außerhalb des Umfangs |
| Website nach Deployment | ENTFÄLLT     | —                | Umfang am 14.10.2026 festgelegt | Keine; außerhalb des Umfangs |

**Aktueller Stand: Freigabe offen.** Die bestandene Repository-Hygiene ist ein erster Nachweis; sie genügt noch nicht für ein GO zur Veröffentlichung.
