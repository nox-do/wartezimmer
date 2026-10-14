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

| Angabe                                          | Festlegung                                                    |
| ----------------------------------------------- | ------------------------------------------------------------- |
| Zielrepository und Eigentümer                   | `nox-do/wartezimmer`, `git@github.com:nox-do/wartezimmer.git` |
| Öffentlicher Quellcode                          | Ja                                                            |
| Installierbares Release                         | Ja                                                            |
| GitHub Pages Website                            | Nein, außerhalb der ersten Veröffentlichung                   |
| Releaseversion                                  | Offen; aktuell in Root package.json: 6.1.3                    |
| Zu veröffentlichender Commit                    | Offen                                                         |
| Verantwortlich für technische Prüfung           | Offen                                                         |
| Verantwortlich für Lizenz, Inhalte und Freigabe | Offen                                                         |
| Datum der Entscheidung                          | Offen                                                         |

## A Öffentlicher Quellcode

Alle Punkte A01 bis A11 sind Pflicht für die Veröffentlichung des Repositorys einschließlich des vereinbarten Overviews.

- [ ] **A01 Veröffentlichungsumfang und Git-Historie festlegen.** Zielrepository, Eigentümer, öffentlicher Branch und Umgang mit bisherigen Commits und Tags sind entschieden. Auch Archive unter `docs/archive/` werden bei einer Repository-Veröffentlichung sichtbar; ihr Ausschluss vom Website-Build schützt sie dort nicht. Offene lokale Änderungen sind geprüft und bewusst übernommen oder aus dem Veröffentlichungskandidaten ausgeschlossen.
  - Status: Teilweise festgelegt. Zielrepository am 14. Oktober 2026 bestätigt: `nox-do/wartezimmer`. Die vollständige Git-Historie soll nach Prüfung veröffentlicht werden. Die offenen lokalen Änderungen einschließlich dieser Checkliste sollen gemäß Nutzerauftrag eingecheckt werden. Auswahl der zu veröffentlichenden Branches und Tags offen. Noch kein lokales Remote eingerichtet. SSH-Lesezugriff aus dieser Sitzung scheitert mit `Permission denied (publickey)`; Zugriff ist damit noch nicht bestätigt.
  - Nachweis / Verantwortlich: Offen.

- [ ] **A02 Geheimnisse und private Daten ausschließen.** Ein Secret-Scan und eine Sichtprüfung decken den Veröffentlichungskandidaten und die gesamte zur Veröffentlichung vorgesehene Git-Historie ab. Keine echten Patienten- oder Praxisdaten, Zugangsdaten, Tokens, privaten Schlüssel, Dumps oder Backups enthalten; auch Screenshots, Fixtures, Archive und Konfigurationsbeispiele prüfen. Gefundene echte Zugangsdaten werden ersetzt beziehungsweise widerrufen und aus dem Veröffentlichungsumfang entfernt. Den geprüften Umfang und bereinigte Befunde dokumentieren, ohne Geheimnisse in den Nachweis zu kopieren.
  - Status: Offen. `npm run check:repository` bestanden, 1466 erfasste Pfade. `.env`, `backups/` und `dumps/` sind ignoriert und aktuell nicht erfasst. Der Hygienecheck prüft Dateimuster und einzelne Schlüsselmarker, keinen vollständigen Secret-Scan oder die Historie.
  - Nachweis / Verantwortlich: Offen.

- [ ] **A03 Rechte und Lizenzumfang klären.** Die Verantwortlichen bestätigen die Veröffentlichung des eigenen Codes, der Beiträge, Bilder, Schriften und eingebundenen Komponenten. `LICENSE`, `THIRD_PARTY_NOTICES.txt`, Drittanbieter-Lizenzen und öffentliche Beschreibungen stimmen überein. Die eigene Wartezimmer-Lizenz 1.1 und die Bezeichnung „Source-available“ sind bewusst gewählt; Assets und Website-Inhalte haben einen nachvollziehbaren Lizenzumfang.
  - Status: Offen; Lizenzdateien sind vorhanden.
  - Nachweis / Verantwortlich: Offen.

- [ ] **A04 Start aus einem frischen Clone nachweisen.** Eine separate Testumgebung startet mit dokumentierten Voraussetzungen, `npm ci`, `.env.example` und eigenen Testzugangsdaten. Docker-Start und die in der README beschriebenen Oberflächen funktionieren ohne Dateien aus dem bisherigen Entwicklerrechner. Beispiele enthalten ausschließlich fiktive Daten; die initiale PIN und ihr Änderungsweg sind verständlich dokumentiert.
  - Status: Offen.
  - Nachweis / Verantwortlich: Betriebssystem, Node/npm/Docker-Versionen, Commit und Startprotokoll eintragen.

- [ ] **A05 Vollständige technische Prüfung bestehen.** `npm run verify` und `npm run build` laufen am Veröffentlichungskandidaten erfolgreich. Das zusätzliche Build prüft auch den Backend-Build; `verify` allein ersetzt ihn nicht. Fehler werden behoben und betroffene Prüfungen erneut ausgeführt.
  - Status: Offen; in dieser Vorprüfung nur `check:repository` ausgeführt.
  - Nachweis / Verantwortlich: Commit, Befehle und Ergebnisse eintragen.

- [ ] **A06 Abhängigkeiten und bekannte Schwachstellen bewerten.** npm-Abhängigkeiten und eingesetzte Container sind geprüft. Sicherheitsbefunde sind nach Erreichbarkeit und Auswirkung bewertet; keine ungeklärte Schwachstelle mit erheblicher Auswirkung im ausgelieferten Betrieb. Festgestellte Grenzen und erforderliche Maßnahmen sind dokumentiert.
  - Status: Offen.
  - Nachweis / Verantwortlich: Bericht, Bewertung und gegebenenfalls begründete Restbefunde eintragen.

- [ ] **A07 Sicherheitsgrenzen praktisch prüfen.** Rollen, Sitzungen, Gerätefreigaben und Portalzugriff bestehen positive und negative Tests: Ein Patientengerät erhält keinen Zugriff auf MFA, Ops oder fremde Dokumente. Uploadprüfung, Dokumentenfreigabe und Sandbox-Zugriff entsprechen der dokumentierten Architektur. Änderungen an der Autorisierung sind durch passende Tests abgedeckt.
  - Status: Offen.
  - Nachweis / Verantwortlich: Unter anderem `smoke:auth-session`, `smoke:terminal-pairing`, `smoke:tv-pairing`, `smoke:doc-flow` sowie Tests für verweigerte Zugriffe protokollieren.

- [ ] **A08 Dokumentation und Produktversprechen abgleichen.** README, Betriebsdokumentation und Beispiele beschreiben den tatsächlichen Stand: lokale Verarbeitung, optionale externe Dienste, Netzwerkgrenzen, unterstützte Plattformen und ausgeschlossene Funktionen. Installation, Konfiguration und bekannte Einschränkungen sind auffindbar; Links und Demo-Inhalte sind geprüft.
  - Status: Offen.
  - Nachweis / Verantwortlich: Offen.

- [ ] **A09 GitHub Prüfungen und Zugriffsrechte festlegen.** Schreibrechte, Branch-Regeln, Workflow-Berechtigungen und Umgang mit Beiträgen sind festgelegt. Der vollständige Prüfweg für Änderungen ist eingerichtet und bestanden. Aktuell gibt es Workflows für Windows-Kompatibilität, Releasepakete und Pages; ein allgemeiner Workflow für `npm run verify` ist darunter nicht vorhanden. Release-Tags lösen den Paketbuild aus und müssen bewusst gesetzt werden.
  - Status: Offen; Einstellungen im Zielrepository prüfen.
  - Nachweis / Verantwortlich: Workflow-Lauf und Repository-Einstellungen eintragen.

- [ ] **A10 Support und private Sicherheitsmeldungen ermöglichen.** Nutzer finden einen erreichbaren Supportweg, einen privaten Meldeweg für Sicherheitsprobleme und Regeln für Beiträge. Öffentliche Issues sollen keine Patienteninformationen, Zugangsdaten oder unbereinigten Diagnosepakete enthalten. Zuständigkeit für neue Meldungen ist benannt.
  - Status: Offen.
  - Nachweis / Verantwortlich: Kontakt beziehungsweise Repository-Konfiguration eintragen.

- [ ] **A11 Projektübersicht mitpflegen.** Der Overview in [nox-do/client-concepts](https://github.com/nox-do/client-concepts) wird zur Veröffentlichung aktualisiert. Projektstatus, Repository-Link, angebotene Pakete, Lizenzbezeichnung und Funktionsumfang stimmen mit dem freigegebenen Stand überein. Änderungen im Overview werden bei künftigen Releases mitgeprüft.
  - Status: Offen. Pflegeauftrag am 14. Oktober 2026 bestätigt. Inhalt und genaue Zieldatei noch zu lesen; Webabruf war nicht erfolgreich.
  - Nachweis / Verantwortlich: Offen.

## B Installierbares Release

Pflicht, wenn Manager, `.pfinstall` oder `.pfupdate` veröffentlicht werden. Sonst jeden Punkt begründet als ENTFÄLLT markieren.

- [ ] **B01 Releasepakete eindeutig zuordnen.** Version, Tag, Commit, Manager und Installations-/Updatepakete passen zusammen. Pakete enthalten ausschließlich Produktionsartefakte und erforderliche Lizenzen. Unterstützte Architektur und Plattform sind eindeutig benannt; Prüfsummen sind vorhanden. Signierung beziehungsweise der tatsächliche Signierungsstatus und erwartete Betriebssystemmeldungen sind geprüft und dokumentiert.
  - Status / Nachweis / Verantwortlich: Offen.

- [ ] **B02 Neuinstallation auf unterstützten Plattformen bestehen.** macOS Apple Silicon, macOS Intel und Windows 11 x64 sind für die jeweils angebotenen Pakete geprüft. Installation und Start funktionieren mit den dokumentierten Voraussetzungen und mit dem paketierten Manager. Ein erfolgreicher Entwicklungsstart allein genügt nicht.
  - Status / Nachweis / Verantwortlich: Offen; Plattformmatrix beifügen.

- [ ] **B03 Praxisabläufe im Teststack bestehen.** `npm run smoke:all` läuft mit passender Konfiguration erfolgreich. Anmeldung, Warteliste, Raumzuordnung, Aufruf, Abwesenheit/Rückholen, Portal-Dokumente und Tageswechsel sind mit fiktiven Daten geprüft. Manager-, Proxy- und TLS-Prüfungen separat passend zum angebotenen Betriebsumfang ausführen.
  - Status / Nachweis / Verantwortlich: Offen.

- [ ] **B04 Update, Backup und Wiederherstellung bestehen.** Update von der angebotenen Vorgängerversion, Datenerhalt und Wiederherstellung eines Backups sind praktisch geprüft. Für ein Erstrelease ohne unterstützten Updatepfad ist dies ausdrücklich beschrieben; Backup und Restore bleiben Pflicht. Abbruch und Recovery einer fehlgeschlagenen Installation beziehungsweise eines Updates führen zu einem nachvollziehbaren, wiederherstellbaren Zustand.
  - Status / Nachweis / Verantwortlich: Offen.

- [ ] **B05 Betriebsgrenzen bestätigen.** HTTPS, Patienten-/Team-Netztrennung, initiale Zugangsdaten, Exportpfade und externe Integrationen sind für die angebotene Betriebsart geprüft. Die Anleitung benennt, welche Einrichtung und Prüfung die Praxis-IT vor Ort leisten muss. Inbetriebnahme und Diagnose lassen sich anhand der Dokumentation durchführen.
  - Status / Nachweis / Verantwortlich: Offen.

- [ ] **B06 Öffentliche Downloads überprüfen.** Die finalen Dateien entsprechen den geprüften Paketen. Dateinamen, Versionen, Prüfsummen und Release Notes passen; alle angebotenen Downloads sind erreichbar. Bekannte Einschränkungen und Updatevoraussetzungen stehen beim Release.
  - Status / Nachweis / Verantwortlich: Offen.

## C Website auf GitHub Pages

**ENTFÄLLT für diese Veröffentlichung:** Am 14. Oktober 2026 wurde der Umfang auf Quellcode und installierbare Pakete festgelegt. C01 bis C04 werden erst bei einer späteren Website-Veröffentlichung geprüft.

Pflicht, wenn die Website veröffentlicht wird. Offene C-Punkte blockieren die Website-Freigabe; Quellcode und Pakete werden anhand ihrer eigenen Punkte entschieden.

- [ ] **C01 Veröffentlichungsplatzhalter auflösen.** Quellcode-Link, sieben Downloadlinks sowie Hosting- und Kontaktangaben sind mit bestätigten Angaben ausgefüllt. Veröffentlichungsmarker erst nach inhaltlicher Klärung entfernen.
  - Status: Offen. Am 14. Oktober 2026 stehen Marker in `website/lizenzen.html`, `website/downloads.html` und `website/datenschutz.html`.
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
