# Plan: Manager — eingeschränkter Netzwerkzugang

Stand: 2026-09-03 · **Architekturentscheidung, Umsetzung offen**

Grundlage: [Eingeschränkter Netzwerkzugang für das Patientenportal](plan-portal-lan-isolation.md) ·
TLS-Ist: [`operations/tls.md`](operations/tls.md)

## 1. Entscheidung

Der Manager bekommt kein eigenes Portal-Feature und keinen zweiten
`portalEnabled`-Schalter. Er verwaltet eine generische Host-Fähigkeit:

> Eine zusätzliche Host-IP bildet eine eingeschränkte Netzwerkzone. Über diese
> Zone sind nur im Produktcode ausdrücklich freigegebene Funktionen erreichbar.

Das Patientenportal ist der erste und in v1 einzige Konsument. Seine fachliche
Verfügbarkeit bleibt die Ops-Einstellung `portalEnabled` in der App. Der
Manager konfiguriert nur IP-/Interface-Binding, Listener, Firewall und deren
technische Prüfung.

```text
Praxis-Flow-Host
├── interne Zone / Staff-IP
│   └── Staff, Ops, Geräte und interne Portalvorschau
└── eingeschränkte Zone / Restricted-IP
    └── v1: Portal-Origin mit fester Portal-Positivliste
```

Ein Wildcard-Zertifikat deckt Namen ab, erteilt aber keine Freigabe. Jede
weitere Funktion braucht später einen expliziten Host-Matcher und eine
versionierte Routen-Policy.

## 2. Begriffe und Zuständigkeiten

| Begriff                | Bedeutung                                                               |
| ---------------------- | ----------------------------------------------------------------------- |
| **Restricted-IP**      | Zusätzliche lokal gebundene Host-IP für die eingeschränkte Zone         |
| **Restricted-Binding** | Zuordnung von Restricted-IP, Interface und Host-Publish                 |
| **Exposed Surface**    | Vom Produktcode fest freigegebene Funktion auf dem Restricted-Listener  |
| **Portal-Origin**      | `https://portal.<installationsraum>`; in v1 die einzige Exposed Surface |
| **`portalEnabled`**    | Fachliche App-/Ops-Einstellung; kein Manager- oder Host-Binding-Zustand |

Verantwortungsgrenzen:

- **Ops/App:** Portal fachlich anbieten oder sperren; Sessions, Uploads und
  Formulare autorisieren.
- **TLS:** Installationsraum, Staff-/Portal-Hostname, Zertifikatsname,
  Zertifikatsmaterial und DNS-Voraussetzungen.
- **Setup:** Restricted-Binding persistieren, prüfen und transaktional auf
  Compose, Caddy und Host-Firewall anwenden.
- **Manager-Renderer:** Setup-Zustand darstellen, IP-Auswahl als Draft halten
  und Aktionen auslösen.

Setup schreibt für diesen Flow nicht direkt in die fachliche SQLite-Datenbank.
Ein konfiguriertes Restricted-Binding darf daher mit `portalEnabled=false`
existieren; Portalaktionen werden dann weiterhin von der App abgewiesen.

## 3. UI-Schnitt

Die Oberfläche bleibt im bestehenden Haupt-Tab **Netzwerk**. Es entsteht kein
neuer Haupt-Tab.

Arbeitstitel im UI:

> **Eingeschränkter Netzwerkzugang**  
> Zusätzliche Netzwerkadresse für getrennt erreichbare Funktionen, derzeit das
> Patientenportal.

Konfigurierbar sind nur:

- Restricted-IP samt Interface;
- Bestätigung des empfohlenen getrennten Interfaces oder des Same-NIC-
  Warnpfads;
- Binding anwenden, entfernen, erneut prüfen oder nach Drift reparieren.

Nur lesbar werden angezeigt:

- Staff-IP und gewählte Restricted-IP;
- `Patientenportal` als aktuell freigegebene Funktion;
- technischer Status und konkrete Blocker;
- Ergebnis der relevanten Binding-, Firewall-, Listener- und
  Erreichbarkeitsprüfungen;
- Portal-URL, sobald DNS-/TLS-Vertrag sie bereitstellt.

Nicht in diesen Bereich gehören:

- fachliches Portal an/aus;
- Portalsprachen, Formulare oder Sessionregeln;
- freie Auswahl beliebiger extern erreichbarer Funktionen;
- ein zweiter TLS-Assistent;
- Captive-Anbieter oder Controller-Zugangsdaten.

Fehlt eine TLS-/DNS-Voraussetzung, zeigt der Bereich den Blocker und verweist
auf **HTTPS**. Er dupliziert weder Zertifikatsausstellung noch PEM-Erneuerung.

Ein eigener Wizard-Schritt ist für den ersten Schnitt nicht nötig. Falls die
Einrichtung später im Erstinstallationsablauf angeboten wird, verwendet sie
dieselbe Komponente und denselben Setup-Vertrag; es entsteht kein zweiter
Workflow.

## 4. Vertragsmodell

Die Namen sind absichtlich nicht portalspezifisch:

```ts
type RestrictedNetworkBinding = {
  hostIp: string;
  interfaceId: string;
  interfaceName: string;
  sameInterfaceConfirmed: boolean;
};

type RestrictedNetworkPhase = 'unconfigured' | 'prepared' | 'applied';

type RestrictedNetworkStatus = {
  phase: RestrictedNetworkPhase;
  binding: RestrictedNetworkBinding | null;
  exposedSurfaces: readonly ['patient-portal'];
  lastError: { code: string; message: string } | null;
};

type RestrictedNetworkHealth =
  | 'healthy'
  | 'warning-shared-interface'
  | 'unsupported'
  | 'blocked'
  | 'degraded';

type RestrictedNetworkAudit = {
  health: RestrictedNetworkHealth;
  checks: RestrictedNetworkCheck[];
};

type RestrictedNetworkActionResult = {
  status: RestrictedNetworkStatus;
  audit: RestrictedNetworkAudit;
};
```

Die endgültigen Feldnamen dürfen sich bei der Implementierung ändern. Bindend
ist die Trennung:

1. **Persistierter Sollzustand:** Binding, wenige Fortschrittsphasen,
   bestätigte Warnung, letzter Aktionsfehler.
2. **Aktuelle Beobachtung:** Plattformfähigkeit, Interfaces, Docker-Publishes,
   Firewall, Listener, DNS und TLS.
3. **UI-Projektion:** Formulierungen wie „gesperrt — unsichere
   Netzkonfiguration“ werden aus Sollzustand und Audit abgeleitet und nicht als
   neun konkurrierende FSM-Zustände persistiert.

Eine laufende transaktionale Operation erhält bei Bedarf einen separaten,
persistierten Journalzustand. Er wird nicht in die dauerhafte fachliche Phase
eingebacken.

## 5. HostStatus und Audit

`HostStatus` darf eine kleine, günstig berechenbare
`restrictedNetwork`-Zusammenfassung enthalten. Der Config-Snapshot ist nicht
der zwölfsekündige Runtime-Poll. Vollständige Interface-, Docker-, Firewall-,
DNS- und SNI-Prüfungen gehören dennoch nicht in den allgemeinen Statusabruf.

Beim Öffnen des Bereichs lädt der Manager einen gezielten Inspect-Snapshot mit:

- persistiertem Status;
- Plattform-/Docker-Capabilities;
- aktuell bindbaren Kandidaten;
- vollständigem Audit, soweit es für Anzeige und Reparatur nötig ist.

Vor jeder Mutation führt Setup die sicherheitsrelevanten Prüfungen unabhängig
von diesem UI-Snapshot erneut aus. Fail-closed darf nie von einem offenen
Managerfenster oder Renderer-Poll abhängen.

## 6. Setup-API

Der erste vertikale Schnitt braucht höchstens diese Operationen:

| Operation                         | Zweck                                                           |
| --------------------------------- | --------------------------------------------------------------- |
| `inspectRestrictedNetwork()`      | Status, Capabilities, Kandidaten und aktuelles Audit laden      |
| `prepareRestrictedNetwork(input)` | Auswahl validieren, bestätigen und resumierbar persistieren     |
| `applyRestrictedNetwork()`        | Firewall/Compose/Caddy transaktional anwenden und prüfen        |
| `removeRestrictedNetwork()`       | Binding und verwaltete Regeln transaktional entfernen           |
| `repairRestrictedNetwork()`       | Erst ergänzen, wenn die Semantik über erneutes Apply hinausgeht |

`Erneut prüfen` ist zunächst ein erneutes Inspect und benötigt keine eigene
Mutation. `Repair` wird nicht vorsorglich implementiert.

Für die neuen Operationen genügt ein kleiner gemeinsamer Descriptor mit
Methode, Pfad und Timeout-Klasse, analog zu den bestehenden TLS-Routenkonstanten.
Request-Typen liegen in `@praxis-flow/server-shared`; Setup normalisiert und
validiert eingehende JSON-Werte. Eine Migration aller vorhandenen Setup-Routen,
OpenAPI für die Setup-API oder eine neue Runtime-Schema-Bibliothek ist kein
Bestandteil dieses Umbaus.

Die bestehende Main-Präfixprüfung kann separat zu einer exakten
Methode-/Pfad-Positivliste gehärtet werden. Sie ist wegen fest exponierter
Preload-Methoden, Loopback, Start-Token und Build-/Protokoll-Handshake kein
Blocker für den ersten Restricted-Network-Schnitt.

## 7. Setup als Autorität

Setup besitzt den gesamten Host-Lifecycle:

1. Kandidat und Same-NIC-Bestätigung validieren.
2. TLS-/DNS-Voraussetzungen prüfen.
3. aktuellen Compose-, Caddy-, Env- und Firewallzustand sichern.
4. neue Dateien erzeugen und offline validieren.
5. Host-Firewall anwenden.
6. Proxy mit explizitem Restricted-Publish neu erzeugen.
7. zuerst Staff, danach Restricted-Listener und Portal-Policy prüfen.
8. Erfolg persistieren oder vollständig zurückrollen und Staff erneut prüfen.

Nach Prozessabbruch oder Neustart erkennt Setup einen unvollständigen
Journalzustand und setzt die Operation kontrolliert fort oder rollt zurück. Der
Renderer darf dafür keine eigene persistente Zustandsmaschine besitzen.

Die feste Expositions-Policy ist ausführbarer Produktcode, keine
Benutzerkonfiguration. In v1 enthält sie genau:

```text
Restricted-Listener
└── portal.<installationsraum>
    └── explizite Portal-UI-/Session-/Upload-/Formularrouten
```

Neue Oberflächen können später dasselbe Restricted-Binding verwenden, werden
aber nur durch eine Code-/Releaseänderung ergänzt. Wildcard-Hostname,
`public: true` oder `/api/*` reichen niemals als Freigabe.

## 8. Renderer-Schnitt

`NetworkView.svelte` bleibt die äußere Seite. Der erste sinnvolle
Komponentenschnitt ist:

```text
NetworkView
└── RestrictedNetworkPanel
    ├── restricted-network-controller
    └── restricted-network-view-model
```

Der Controller hält nur:

- Formular-Draft;
- Load-/Apply-/Remove-Phase;
- lokale Anzeige von ActionResult und Fehlern;
- Generation zum Verwerfen verspäteter Antworten beim Verlassen der View.

Persistierter Status, Auditregeln und Rollback bleiben in Setup. Das Panel
erhält keine direkten Kenntnisse über Caddydateien, Compose-Overlays oder
Firewallkommandos.

`NetworkView` darf das Panel, den vorhandenen Confirm-Dialog und den
übergreifenden Busy-Zustand verdrahten. Die bestehenden LAN-/TLS-Bereiche werden
nicht vorsorglich in weitere Hüllen zerlegt. Erst wenn drei Controller durch
paarweise `isPeerMutating`-Prüfungen unübersichtlich werden, entsteht ein
kleiner gemeinsamer Host-Mutations-Lock.

Ein Feature-Unterordner ist sinnvoll, sobald Panel, Controller, View-Model und
Tests gemeinsam entstehen. Ein vorheriger Umzug des flachen Renderer-
Verzeichnisses ist nicht nötig.

## 9. TLS- und DNS-Interlock

TLS bleibt Eigentümer der gemeinsamen Hostidentität:

```text
installationDomain
staffHostname
portalHostname
wildcardCertificateName
staffIp
```

Restricted Network ergänzt nur `restrictedBindIp` und die Zuordnung des
Portal-A-Records zu dieser IP. Es kopiert weder Zertifikatszustand noch
ACME-Credentials in seinen eigenen Status.

Managed TLS stellt den Wildcard bereits bei der Grundeinrichtung aus. Beim
Restricted-Binding kommt nur der Portal-A-Record hinzu. Custom TLS blockiert
Apply, solange das PEM den Portal-Hostname nicht abdeckt. Der Restricted-
Bereich zeigt diese Abhängigkeit, führt aber die TLS-Aktion über den bestehenden
HTTPS-Vertrag aus.

## 10. Umsetzungsschnitte

### Schnitt 0 — Machbarkeit

- F1-PoC je unterstützter Windows-/macOS-/Docker-Desktop-Kombination;
- spezifische Host-IP-Publishes, Host-Firewall, Elevation und Rollback;
- externer Scan aus beiden Netzen, Reboot und Adressverlust.

Ohne bestandenes F1-Gate keine produktive Restricted-Network-Implementierung.

### Schnitt 1 — technische Basis

- vollständige Runtime-Publish-Bindings statt bloßer Portnummern;
- Staff-/Loopback-Bindings ohne `0.0.0.0` und `[::]`;
- Wildcard-/Origin-Vertrag im TLS-Modul;
- Backup-/Restore-Erweiterung.

### Schnitt 2 — Setup vertical slice

- DTOs und neue Operationsdeskriptoren;
- Persistenz, Inspect, Prepare und Apply;
- feste Portal-Positivliste;
- Compose/Caddy/Firewall-Transaktion und Rollback;
- Fail-closed bei fehlender Restricted-IP.

### Schnitt 3 — Manager

- Bereich im Netzwerk-Tab;
- Kandidatenauswahl und Same-NIC-Bestätigung;
- Status, Apply und Binding entfernen;
- HTTPS-Verweis bei TLS-/DNS-Blockern;
- neue Zwei-Zonen-Topologie statt Captive-zentrierter Erklärung.

### Schnitt 4 — Betrieb und Reparatur

- Drift-Erkennung bei Stack-Start und Netzwerkänderung;
- Repair nur für tatsächlich beobachtete Fehlerfälle;
- optionale QR-/Praxis-IT-Prüfhilfe;
- Betriebs- und Supportdokumentation.

## 11. Mindesttests

- Controller: Hydration, Draft-Erhalt, verspätete Antworten, Leave während
  Apply, gegenseitiger Host-Mutations-Lock.
- API: Normalisierung, unbekannte Felder, Methode/Pfad und Timeout.
- Setup: Prepare/Apply/Remove, Wiederaufnahme, Rollback und Rollbackfehler.
- Audit: separate NIC, Same-NIC-Warnung, überlappende Subnetze, virtuelle
  Adapter, IP-/Interface-Drift und globale IPv4-/IPv6-Publishes.
- Proxy: Staff-/Portal-SNI gegen beide Ziel-IPs, unbekanntes SNI und vollständiger
  Routenkatalog-Negativtest.
- Plattform: Firewallpersistenz, Reboot, Docker-Desktop-Neustart und
  Black-Box-Portscan.
- Restore: aktives Restricted-Binding mit passender TLS-Identität sowie
  fail-closed bei Inkonsistenz.

## 12. Bewusst nicht vorab bauen

- kein neuer Haupt-Tab;
- kein Portal-Controller für fachliches `portalEnabled`;
- kein frei konfigurierbarer Firewall-/Surface-Editor;
- keine allgemeine Operation-Registry für alle Setup-Endpunkte;
- keine Runtime-Validierung sämtlicher bestehender Responses;
- kein Captive-Adapter;
- kein vorsorgliches `Repair`, solange erneutes Apply dieselbe Semantik erfüllt;
- kein Umbau aller vorhandenen Netzwerk- und TLS-Komponenten.
