# Routing-Modus in Ops Settings

Stand: 2026-09-06 · Plan für die Verlagerung von Simple/Complex Routing aus dem Praxis Flow Manager in die Ops-Web-App

## 1. Zielbild

`routingMode` wird in der Ops-Web-App unter einer eigenen Settings-Seite als globale Praxis-Konfiguration gepflegt. Der Manager bleibt für Host-Setup, Docker, Netzwerk und Wartung zuständig, bietet aber weder im Installations-Wizard noch in der Wartungsansicht eine Routing-Modus-Auswahl an.

Die App bleibt die fachliche Autorität für:

- Persistenz in `ops_settings.routing_mode`
- Rollenprüfung
- Wechsel-Guard bei offenen Visits
- Catalog-Synchronisierung
- Capability-Ermittlung für Simple/Complex Routing

Der Manager darf den Routing-Modus nach dem Umbau nicht mehr als eigene UI-Funktion präsentieren. Ein eventuell weiterhin benötigter Host-/Setup-API-Vertrag ist separat als technischer Kompatibilitätspfad zu bewerten und nicht als zweite Konfigurationsoberfläche zu behandeln.

## 2. Warum diese Platzierung

Der Modus ist zwar praxisweit und betriebskritisch, wird aber fachlich bereits in den Ops-Settings gespeichert und dort verarbeitet. Die App führt den Wechsel heute schon über `/api/v1/ops/settings`, validiert offene Wartenummern und synchronisiert danach den Flow-Catalog.

Der Manager hatte ursprünglich einen sinnvollen Host-Admin-Grund: Routing sollte während der Einrichtung ohne Ops-PIN und über einen lokalen Trust-Kanal erreichbar sein. Dieser Grund rechtfertigt weiterhin einen möglichen Setup-Integrationspfad, aber keine dauerhafte doppelte UI. Die reguläre fachliche Konfiguration gehört in die Ops Settings, zusammen mit anderen praxisweiten Betriebsoptionen.

## 3. Ist-Zustand und betroffene Flächen

### App und API

- `app/src/routes/ops/ops-settings-routes.ts`
  - bestehende `GET/PATCH /api/v1/ops/settings`
  - bestehende `GET /api/v1/ops/settings/capabilities`
- `app/src/routes/ops/ops-settings-patch-by-role.ts`
  - `routingMode` ist bereits dem `ops`-Rollenpfad zugeordnet
- `app/src/shared/ops/routing-mode-guard.ts`
  - blockiert einen Wechsel bei offenen Visits
- `app/src/shared/ops/routing-capabilities.ts`
  - bildet aktive Routing-Fähigkeiten aus Modus und Lizenzstatus
- `app/src/shared/db/database-ops-settings.ts` und `app/src/shared/db/database.ts`
  - Persistenz, Validierung und Catalog-Sync
- `openapi/ops.yaml`, generierte App-/UI-Typen und Drift-Checks
  - Vertrag muss nach Änderungen synchron bleiben

### Ops-Web-App

- `ui/src/routes/ops/+layout.svelte`
  - bestehendes Ops-Settings-Layout mit `StaffSettingsLayout`
- `ui/src/lib/ops/settings-nav.ts`
  - neuer Navigationspunkt, voraussichtlich zwischen „Allgemein“ und weiteren Praxis-Settings
- `ui/src/lib/queue/ops-settings-api.ts`
  - bestehende Fetch-/Patch-Funktionen und `OpsSettingsResponse`
- `ui/src/routes/ops/practice/+page.svelte` sowie bestehende `ui/src/lib/components/ops/*`
  - Referenz für Seitenstruktur, Panel, Ladezustand, Fehlerzustand, Save-Button und Toasts
- `ui/src/lib/styles/ops.css` und `ui/src/lib/styles/staff-settings-layout.css`
  - vorhandene CSS-Konventionen verwenden; keine neue Design-Sprache einführen
- `ui/src/lib/i18n/locales/*.ts`
  - neue Titel, Erklärung, Optionen, Guard- und Fehlertexte vollständig lokalisieren

### Manager

Zu entfernen beziehungsweise zu entkoppeln:

- `manager/src/renderer/WizardRoutingModePanel.svelte`
- `manager/src/renderer/RoutingModePanel.svelte`
- Routing-Schritt und Routing-State aus `WizardSteps.svelte`, `WizardView.svelte`, `wizard-flow.ts`, `wizard-state.ts` und zugehörigen Controllern/View-Modellen
- Routing-Sektion aus `MaintenanceSection.svelte` beziehungsweise `MaintenanceView.svelte`
- nur noch für diese UI vorhandene Helfer aus `routing-mode-ui.ts`, sofern keine andere Verwendung bleibt
- Manager-Tests, die die entfernten Panels oder den entfernten Wizard-Schritt absichern

Nach dem Entfernen muss geprüft werden, ob die Setup-API weiterhin einen Routing-Endpunkt für alte Installationsstände, automatisierte Abläufe oder zukünftige unbeaufsichtigte Setups benötigt. Falls ja, bleibt der Endpunkt intern/kompatibel bestehen, wird aber nicht mehr von Manager-Views gerendert. Falls nein, kann er in einem separaten Cleanup-Schritt entfernt werden.

## 4. Ziel-UI in Ops Settings

### Route und Navigation

Neue Route:

```text
/ops/routing
```

Alternativ darf die Einstellung in die bestehende `/ops/practice`-Seite integriert werden, wenn die vorhandene Informationsarchitektur bewusst keine weitere Navigationsebene erhalten soll. Die bevorzugte Variante ist eine eigene Seite, weil Routing eine eigene fachliche Entscheidung mit eigenem Guard, eigener Erklärung und eigener späterer Lizenzdarstellung ist.

Die Seite verwendet:

```svelte
<StaffSettingsShell title={...} lead={...}>
  <section class="panel">
    ...
  </section>
</StaffSettingsShell>
```

Keine neuen globalen CSS-Token und keine Manager-CSS-Klassen übernehmen.

### Inhalt

Die Seite zeigt:

1. aktuellen Modus beziehungsweise Ladezustand
2. zwei klar beschriebene Optionen:
   - **Simple Routing:** pro Topic ein Standardziel, ein schneller einstufiger Ablauf
   - **Complex Routing:** Topics können mehrschrittige Journeys verwenden
3. Hinweis, dass die Einstellung praxisweit gilt
4. Hinweis, dass ein Wechsel erst möglich ist, wenn keine aktiven Wartenummern/Visits vorhanden sind
5. Speichern mit bestehendem Ops-Settings-Patch und bestehendem Toast-/Fehlermuster

Die Auswahl darf nicht mit einem stillen Default gerendert werden. Erst nach erfolgreichem Laden darf der aktuelle Wert als ausgewählt erscheinen. Während des Ladens und Speicherns sind die Controls deaktiviert. Nach einem erfolgreichen Patch wird die vom Server zurückgegebene Einstellung als neue Wahrheit übernommen.

## 5. API, Rollen und Datenfluss

### Lesen

Die UI lädt `GET /api/v1/ops/settings`. `routingMode` kommt aus demselben Response wie die übrigen Ops Settings. Für die spätere Lizenzdarstellung lädt die UI zusätzlich oder künftig gebündelt die Capabilities.

### Schreiben

Die UI verwendet ausschließlich:

```json
PATCH /api/v1/ops/settings
{ "routingMode": "simple" | "complex" }
```

Kein direkter SQLite-Zugriff und kein Manager-Local-Header aus der Browser-UI.

Der App-Backend-Pfad bleibt maßgeblich:

```text
Ops-Web-App
  -> Ops-Auth / clientRole = ops
  -> PATCH /api/v1/ops/settings
  -> Rollenprüfung
  -> Lizenz-/Entitlement-Prüfung, falls aktiv
  -> Guard für offene Visits
  -> Persistenz + Catalog-Sync
  -> aktualisierte OpsSettingsResponse
```

Die MFA-Rolle soll `routingMode` weiterhin nicht patchen können. Das ist eine globale Ops-/Administratorentscheidung und keine normale MFA-Betriebsoption.

## 6. Lizenzvorbereitung

Stand heute soll Complex Routing **nicht durch eine Lizenz blockiert werden**. Das bedeutet:

- ein Wechsel nach `complex` muss in Produktion erlaubt sein
- die UI darf Complex Routing nicht als „nicht verfügbar“ oder deaktiviert anzeigen
- `COMPLEX_ROUTING_NOT_LICENSED` darf im normalen aktuellen Pfad nicht ausgelöst werden
- der Manager darf keine zusätzliche Lizenzentscheidung treffen

Die spätere Lizenzierbarkeit bleibt trotzdem vorbereitet:

- `routingMode` bleibt ein reiner Konfigurationswert und wird nicht mit Lizenzmetadaten vermischt
- Capabilities bleiben der geeignete Ort für `complexRouting`, `journeyDesigner` und später `complexRoutingLicensed`
- ein zukünftiger Entitlement-Resolver soll zentral im App-Backend entscheiden, nicht in Svelte und nicht im Manager
- die UI behandelt einen zukünftigen `COMPLEX_ROUTING_NOT_LICENSED`-Fehler bereits als fachlichen Serverfehler und zeigt eine lokalisierte, verständliche Meldung
- Tests decken beide Zustände ab: aktuell Complex erlaubt; späterer Lizenzstatus deaktiviert/abgewiesen

Vor der Implementierung muss entschieden werden, ob der bestehende `isComplexRoutingLicensed()`-Stub für den aktuellen Stand auf „immer erlaubt“ beziehungsweise auf eine explizite Produkt-Capability umgestellt wird. Nur die UI zu aktivieren, während der Backend-Guard in Production weiterhin blockiert, wäre inkonsistent.

## 7. Wechsel- und Fehlerverhalten

Der bestehende Server-Guard bleibt erhalten:

- gleicher Modus: erfolgreich beziehungsweise keine unnötige Sync-Aktion
- anderer Modus ohne offene Visits: speichern und Catalog synchronisieren
- anderer Modus mit offenen Visits: HTTP 409 mit `ROUTING_MODE_CHANGE_BLOCKED`
- Complex ohne künftige Berechtigung: HTTP 403/entsprechender Domain-Code
- nicht authentifiziert oder falsche Rolle: bestehendes Auth-Verhalten

Die UI soll den `openVisitCount` aus Capabilities verwenden, um den Hinweis und die optionale Vorab-Deaktivierung anzureichern. Der Server bleibt die Autorität; eine UI-Sperre ersetzt niemals den Backend-Guard, weil mehrere Clients parallel arbeiten können.

## 8. Umsetzungsreihenfolge

### Phase A: Vertrag und Backend-Zustand klären

1. Prüfen, ob `OpsSettingsResponse` `routingMode` bereits überall im UI-Vertrag enthält.
2. Den aktuellen Lizenzpfad dokumentieren und so ändern, dass Complex Routing heute nicht geblockt wird.
3. Capabilities-Vertrag für spätere Lizenzinformationen beibehalten oder, falls bereits vorhanden, nur semantisch auf den aktuellen Stand korrigieren.
4. Bestehende App-Tests für Persistenz, Catalog-Sync, Rollen und Mode-Guard ergänzen/aktualisieren.

### Phase B: Ops-Settings-Seite bauen

1. Neue Routing-Settings-Komponente mit dem Muster der bestehenden Ops-Komponenten anlegen.
2. Neue Route und Navigation ergänzen.
3. Bestehende `ops-settings-api`-Funktionen nutzen; keine neue Fetch-Abstraktion ohne Bedarf.
4. Lokalisierungen in allen unterstützten Sprachen ergänzen.
5. UI-Tests für Laden, Auswahl, Speichern, Fehler und blockierten Wechsel anlegen.

### Phase C: Manager-UI entfernen

1. Routing aus Wizard-Schrittfolge und Wizard-State entfernen.
2. Routing-Panel aus Wartung entfernen.
3. Manager-Controller/View-Model-Methoden und API-Aufrufe entfernen, die nur diese Panels bedienen.
4. Routing-bezogene Manager-Tests löschen oder auf den neuen, erwarteten Wizard-Ablauf anpassen.
5. Setup-API-Endpunkt nur dann entfernen, wenn keine technische Nutzung außerhalb der entfernten UI besteht; andernfalls als kompatiblen Nicht-UI-Pfad belassen.

### Phase D: Dokumentation und Drift

1. `manager/README.md` korrigieren: Routing nicht mehr als Manager-Konfigurationsoberfläche dokumentieren.
2. `docs/architecture/routing.md` aktualisieren: `ops_settings` als fachliche Quelle, Ops-Web-App als reguläre Oberfläche, Manager höchstens als Setup-Integrationspfad.
3. Veraltete Hinweise in `todo.md`, Release-/Setup-Dokumenten und Übersetzungen suchen und entfernen.
4. OpenAPI-/Generated-Type-Drift prüfen.

## 9. Tests und Abnahme

### Unit-/Komponententests

- Ops Settings: `routingMode` wird aus dem Response hydratisiert.
- Simple und Complex können ausgewählt werden.
- Save sendet genau den erwarteten Patch.
- Serverfehler werden als Toast/Fehlertext dargestellt.
- HTTP 409 mit offenen Visits wird verständlich dargestellt.
- Lizenzfehler wird verständlich dargestellt, obwohl er aktuell nicht aktiv sein sollte.
- Manager rendert weder Routing im Wizard noch in der Wartung.
- Wizard-Schrittfolge und Fortschrittsanzeige bleiben nach Entfernung konsistent.

### Vertrag und Backend

- Ops-Rolle darf `routingMode` patchen.
- MFA-Rolle darf `routingMode` nicht patchen.
- Wechsel mit offenen Visits bleibt blockiert.
- Wechsel ohne offene Visits synchronisiert den Catalog.
- Complex Routing ist im aktuellen Produktstand ohne Lizenz-Gate aktivierbar.
- Capabilities liefern weiterhin stabile Feature-Felder für spätere Entitlements.

### Ausführbare Checks

```bash
npm run typecheck -w @praxis-flow/ui
npm run typecheck -w @praxis-flow/manager
npm run typecheck -w @praxis-flow/app
npm run test -w @praxis-flow/ui
npm run test -w @praxis-flow/manager
npm run test -w @praxis-flow/app
npm run check:drift
npm run lint:css
```

Vor dem Abschluss zusätzlich die bestehenden Smoke-Tests für Ops Settings und Setup/Manager ausführen, sofern sie den veränderten Pfad abdecken.

## 10. Offene Entscheidungen vor der Implementierung

1. Eigene Route `/ops/routing` oder Integration in `/ops/practice`? Empfehlung: eigene Route.
2. Bleibt der Setup-API-Routing-Endpunkt als kompatibler Host-API-Pfad bestehen? Empfehlung: zunächst behalten, aber UI-los und als Übergang dokumentieren.
3. Wird `complexRoutingLicensed` vorerst immer `true` beziehungsweise produktseitig freigegeben, oder soll das Capability-Feld bis zur Lizenzinfrastruktur entfallen? Empfehlung: Feld/Hook behalten, aber aktuelles Produktverhalten auf erlaubt setzen.
4. Soll der Manager-Wizard noch einen rein informativen Link auf `/ops/routing` anbieten? Empfehlung: nein, der Wizard soll keine Routing-Konfiguration mehr simulieren; höchstens ein klarer Hinweis auf die Ops Settings wäre möglich.
5. Müssen bestehende Installationen beim Update automatisch migriert werden? Erwartung: keine Datenmigration, weil `routing_mode` bereits existiert; nötig sind UI-/Dokumentationsmigration und Regressionstests.

## 11. Definition of Done

- Ops kann Simple/Complex ausschließlich in der Ops-Web-App ändern.
- Die bestehende Serverlogik bleibt die einzige Stelle für Persistenz, Guard und Catalog-Sync.
- Der Manager zeigt Routing weder im Wizard noch in der Wartung an.
- Complex Routing ist heute nicht lizenzbedingt gesperrt.
- Eine spätere Lizenzsperre kann zentral über Capabilities/Backend ergänzt werden, ohne die Oberfläche erneut zu verschieben.
- Dokumentation, Übersetzungen, Generated Types, Tests und Drift-Checks sind konsistent.
