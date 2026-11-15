# Veröffentlichung prüfen

Diese Checkliste gilt für Änderungen an Quellcode, Releasepaketen und Website.
Prüfergebnisse müssen zum veröffentlichten Commit und zum jeweiligen Paket passen.
Historische Veröffentlichungsprotokolle sind über die Git-Historie nachvollziehbar.

## Quellcode

- `npm run check:repository` ausführen. Laufzeitdaten, lokale Konfiguration,
  Zugangsdaten, Backups und Diagnosepakete gehören nicht ins Repository.
- Änderungen auf echte Patienteninformationen und vertrauliche Inhalte prüfen.
  Beispiele und Tests verwenden fiktive Daten.
- Die für die Änderung relevanten Tests ausführen. Für ein Anwendungsrelease
  `npm run verify` und `npm run build` auf den unterstützten Plattformen prüfen.
- Produktumfang, Betriebsdokumentation und bekannte Einschränkungen mit dem
  tatsächlichen Verhalten abgleichen.
- Lizenz und Drittanbieterhinweise bei neuen oder aktualisierten Abhängigkeiten prüfen.

## Releasepakete

- Versionen, Releasebeschreibung und Downloadlinks abgleichen.
- Neuinstallation, Update und Wiederherstellung mit fiktiven Daten prüfen;
  Plattform, Architektur, Paketversion und Ergebnis im Release-Nachweis festhalten.
- Die Netztrennung im konkreten Testnetz prüfen. Plattformgrenzen und ausstehende
  Prüfungen ausdrücklich in der Releasebeschreibung benennen.
- Installer und Archive auf vollständige Lizenzbeigaben und unerwünschte lokale
  Dateien prüfen. SHA256-Prüfsummen erstellen und mit den hochgeladenen Assets abgleichen.
- Sicherheitsrelevante Änderungen an der tatsächlich ausgelieferten Runtime prüfen.
  Ein separates System-Update belegt keinen Fix in einem gepackten Manager.

## Website

- `npm run lint:website`, `node --test scripts/build-pages.test.mjs` und
  `npm run build:website` ausführen.
- Das fertige Artefakt aus `dist/pages/` auf Desktop und Mobilgerät ansehen;
  Navigation und wesentliche Interaktionen auch per Tastatur prüfen.
- Downloadlinks, Versionsangaben, Quellen und Preise kontrollieren.
- Nach dem Pages-Deploy die öffentlichen Seiten, `sitemap.xml` und Downloadziele abrufen.

Prüfprotokolle und lokale Referenzdateien können außerhalb des veröffentlichten
Dateibaums unter `.local/` liegen; dieser Ordner ist von Git und Docker-Builds
sowie der Formatierung ausgeschlossen. Öffentliche Releasehinweise stehen unter
[`../releases/`](../releases/). Der vertrauliche Meldeweg steht in
[`SECURITY.md`](../../SECURITY.md).
