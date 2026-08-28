# LAN-TLS Wizard Mock

Statische Vorlage für den Manager-Umbau. **Nicht verdrahtet**, keine DNS-/ACME-Aufrufe.
Nicht vor dem Kunden-Test in den Manager übernehmen.

- Architektur: [`../../plan-proxy-tls.md`](../../plan-proxy-tls.md)
- Manager-UX: [`../../plan-proxy-tls-manager.md`](../../plan-proxy-tls-manager.md)
- Heutiger Wizard (ohne TLS): [`../../../manager/README.md`](../../../manager/README.md)

Öffnen: `docs/mocks/lan-tls-wizard/index.html` als Datei (Doppelklick oder Cursor-Preview). Kein lokaler Server nötig — die Scripts sind absichtlich keine ES-Module, damit `file://` funktioniert.

## Mock-Umfang

| Fläche | Im Mock | Beim Port |
| --- | --- | --- |
| Assistent | Schritte **4–8** in Leiste und UI (Start: Netzwerk) | Schritte 1–3 bleiben in `WizardSteps.svelte`; HTTPS = neuer Schritt 6 |
| Tabs | Status · Netzwerk · Wartung · Assistent (vereinfachte Tab-Nav) | bestehende Manager-Views — **keine** `mockNav` übernehmen |
| Dev-Helfer | keine Sprungmarken | — |

Schritte 1–3 (Voraussetzungen, Routing, Ordner) sind bewusst **nicht** im Mock.

## Dateien

| Datei | Rolle beim Port |
| --- | --- |
| `tls-model.js` | Selektiv heben. Kein DOM. Nummern, Phasen, Hostname, Mailtext, Gates, Wizard-Advance. Öffentliche Mock-Fläche: `globalThis.LanTlsModel` (IIFE für `file://`). |
| `app.js` | Markup/Events und deutsche UI-Texte. Kommentare nennen Ziel-Svelte-Dateien. Lokaler `state` + `deriveTlsState()` nur für die statische Vorschau — **nicht** als zweites State-Modell in den Renderer portieren. |
| `styles.css` | Klassennamen wie `manager/src/renderer/styles.css`; Reuse-Map im Dateikopf. Mock-only: `mock-banner`, `app-shell`-Page-Chrome. Duplikat nötig, solange der Mock per `file://` läuft. |

## TLS-State (Manager-Vertrag)

Im Manager liefert **`GET /host/status` → `tls`** die Autorität (`packages/server-shared` → `TlsStatus`):

- `tls.state`: `off` · `preparing` · `awaiting-operator-dns` · `dns-verified` · `obtaining-certificate` · `active` · `degraded` · `error`
- Nach `obtain-certificate` / `check-certificate` bleibt der State `dns-verified`, bis `apply` läuft — Cutover-Freigabe über **`tls.applyReady`**
- `tls.mode` (`managed` / `custom`) und `tls.cutoverApplied` — keine Ableitung aus `PROXY_MODE` oder Zertifikatsfeldern

Der Renderer leitet keinen zweiten TLS-State aus Wizard-Feldern ab. Mock-Helfer `deriveTlsState`, `canObtainCertificate` und `canApplyTls` sind **Mock-only**; im Port Buttons aus `tls.state` / `tls.applyReady` steuern.

## Wizard-Nummern

Heutiger Manager: 1–7 (Vorschau = 6, Abschluss = 7). HTTPS wird als **6** eingeschoben:

1 Voraussetzungen · 2 Routing · 3 Import & Export · 4 Netzwerk · 5 Zugang · **6 HTTPS** · 7 Vorschau · 8 Abschluss

Nummern in `tls-model.js` bleiben **1–8** (Port zu `wizard-flow.ts`). Ohne Proxy Schritt 6 überspringen. Nach Mail/PEM geht der Assistent mit HTTP weiter; `verify-dns` und Cutover liegen unter **Netzwerk**.

HTTPS innen (Badge „6“, vier Punkte): Angebot → Hostname → feste IP → Mail (Betreiber-Zone) oder PEM (eigene Domain).

Schritt-Titel in der App heute: 4 „Netzwerk — Host & Erreichbarkeit“, 5 „Zugang — Proxy & Patientenportal“. Mock verkürzt zu „Netzwerk — Host“ / „Zugang — Proxy“.

## CSS-Reuse (Manager)

Keine Mock-eigenen Box-Typen portieren — bestehende Manager-Klassen:

| Mock-Markup | Manager-Klasse |
| --- | --- |
| Warn-/Ok-/Fehler-Boxen | `notice is-warn` / `is-ok` / `is-bad` (Warn = Alias zu `lan-warning`) |
| URL-Vorschau | `hint` + `code`; hervorgehoben: `hint--preview` |
| Mail-/DNS-Text | `textarea.wizard-input is-monospace` (+ `is-compact` in `<details>`) |
| Zertifikats-Meta | `status-grid wizard-summary-grid` |
| Mail/DNS-Wiederholung, LAN-Expander | `<details>` in `network-config-block` |
| Namenswahl-Zusatz | `wizard-nested` |
| mailto primär | `a.btn-primary` |
| HTTPS-Unterschritte | **`wizard-step-progress` / `wizard-step-dot`** (einzige echte Neuklassen) |

## Ziel im Manager

| Mock | Manager |
| --- | --- |
| `planWizardNext` / `planWizardBack` | `wizard-flow.ts` |
| `wizardNextLabel` / `wizardBackHidden` | `wizard-view-model.ts` |
| TLS-Inspect / Restore-Helfer | `inspectPfbackup`, Shared DTO, `restore-wizard-flow.ts`, `settings-backup-restore.ts` |
| HTTPS-Punkte in der Leiste | `WizardStepIndicator.svelte` |
| Phasen-UI Schritt 6 | neuer Zweig in `WizardSteps.svelte` |
| Netzwerk-Fortsetzung | `NetworkView.svelte` + TLS-Controller; LAN-Save in `network-controller.ts` / Setup — TLS **nicht** in `POST /host/network` |
| Status-Karten | `SetupEntry.svelte` / `StatusView.svelte` → Tab Netzwerk |
| Wartung Sidecar | `BackupPanel.svelte` (JSDoc vorhanden) |

Setup-API laut Plan — Betreiber-Zone: `prepare → verify-dns → obtain-certificate → apply`; eigene Domain: `prepare → custom-certificate (Staging) → verify-dns → check-certificate → apply`. Erst `apply` wechselt Canonical. ACME-Fehler: `repair` / `reset-tls` vor Cutover.

Port-Regel: Helfer aus `tls-model.js` liefern Fachentscheidungen, ersetzen aber nicht `loadNetwork` / `loadPlan` / `apply-and-refresh`. PEM- und Sidecar-Dateidialoge in Electron-Main; Setup erhält Dateiinhalt, nie frei gewählte Host-Pfade.

## Bewusste Abweichungen (UX-Pass, im Mock so gelassen)

| Thema | Plan / heutige App | Mock |
| --- | --- | --- |
| Eigene Domain | Namenswahl = PEM, nur A-Record | wie Plan |
| Wartezeit-Copy | Tage sind normal | „bis zu 48 Stunden“ |
| „Später“ ohne `prepare` | `tls.state = off`, keine Status-Karte | Karte „Noch nicht vorbereitet“ |
| Netzwerk-Save | „Einstellungen übernehmen“ vs. Cutover | „Proxy speichern“ / „Auf HTTPS umstellen“ |
| Schritt 4 | LAN-IP und Erreichbarkeit | nur Host |
| Schritt 5 | Proxy + Portal-Hinweis | nur Proxy |

## Nicht im Mock (beim Port nicht vergessen)

Aus [`plan-proxy-tls-manager.md`](../../plan-proxy-tls-manager.md):

- Install-ID und Token erzeugt `prepare` (Mock: `SAMPLE`-Konstanten)
- Fehlerklassen `dns-filter` / `isolation` / `clock` / `cert-name` nur in `tlsErrorCopy`, noch **keine** eigene Fehler-UI
- Zweites LAN-Gerät: QR vs. manuell (offen)
- Gast-WLAN / privates DNS: Entwurf unter Netzwerk-Erreichbarkeit; Manager nur JSDoc (`ReachabilityPanel.svelte`)
- Restore-Wizard nicht nachgebaut (Inspect-Zeile + Gate in `tls-model.js`)

In Status / Netzwerk / Wartung skizziert: Token redigiert nach Zertifikat; Aussteller/Ablauf; ACME-/443-Fehler; LAN-IP veraltet; Zertifikat bald/abgelaufen; Sidecar neben `.pfbackup`. PoC-Mail: CNAME auf `auth.acme-dns.io` (Testdomain `lan.notaus.de`).

Vom Mock nicht nachgebaut (existiert in der App): Wizard fullscreen ohne Tabs; Geräte-URLs kopieren/öffnen; Routing-Hydrate; Binding-Checks / Topology.
