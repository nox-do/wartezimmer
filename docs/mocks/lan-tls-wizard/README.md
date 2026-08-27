# LAN-TLS Wizard Mock

Statische Vorlage für den Manager-Umbau. **Nicht verdrahtet**, keine DNS-/ACME-Aufrufe.
Nicht vor dem Kunden-Test in den Manager übernehmen.

- Architektur: [`../../plan-proxy-tls.md`](../../plan-proxy-tls.md)
- Manager-UX: [`../../plan-proxy-tls-manager.md`](../../plan-proxy-tls-manager.md)
- Heutiger Wizard (ohne TLS): [`../../../manager/README.md`](../../../manager/README.md)

Öffnen: `docs/mocks/lan-tls-wizard/index.html` (startet zur Ansicht auf Schritt 4).

## Dateien

| Datei | Rolle beim Port |
| --- | --- |
| `tls-model.js` | Zuerst heben. Kein DOM. Nummern, Phasen, Hostname, Mailtext, `tls.state`, Wizard-Advance. |
| `app.js` | Nur Markup/Events. Deutsche UI-Texte. Kommentare zeigen die Ziel-Svelte-Dateien. |
| `styles.css` | Gemeinsame Manager-Klassennamen beibehalten; Mock-only am Dateikopf markiert. |

`data-tls-state` am `.app-shell` ist ein **Teil** von `GET /host/status` → `tls.state` (`off` / `preparing` / `awaiting-operator-dns` / `dns-verified` / `active`). `obtaining-certificate`, `degraded` und `error` fehlen.

## Wizard-Nummern

Heutiger Manager: 1–7 (Vorschau = 6, Abschluss = 7). HTTPS wird als 6 eingeschoben:

1 Voraussetzungen · 2 Routing · 3 Import & Export · 4 Netzwerk · 5 Zugang · **6 HTTPS** · 7 Vorschau · 8 Abschluss

Ohne Proxy Schritt 6 überspringen. Nach der Mail geht der Assistent mit HTTP weiter. `verify-dns` und Cutover liegen unter **Netzwerk**, nicht im Assistenten.

HTTPS innen (Leiste bleibt „6“, vier Punkte): Angebot → Hostname → feste IP → Mail/Records.

Titel in der App heute: Schritt 4 „Netzwerk — Host & Erreichbarkeit“, Schritt 5 „Zugang — Proxy & Patientenportal“. Mock verkürzt zu „Netzwerk — Host“ / „Zugang — Proxy“, weil Erreichbarkeit hier gesperrt und Portal-Hinweis nicht Teil der TLS-Strecke ist.

## Ziel im Manager

| Mock | Manager |
| --- | --- |
| `planWizardNext` / `planWizardBack` | `wizard-flow.ts` |
| `wizardNextLabel` / `wizardBackHidden` | `wizard-view-model.ts` |
| HTTPS-Punkte in der Leiste | `WizardStepIndicator.svelte` |
| Phasen-UI | neuer Zweig in `WizardSteps.svelte` |
| Netzwerk-Fortsetzung | `NetworkView.svelte` — nicht `POST /host/network` |
| Status-Karte „wartet auf DNS“ | `SetupEntry.svelte` / `StatusView.svelte` → Tab Netzwerk |

Setup-API laut Plan: `prepare → verify-dns → obtain-certificate → apply`. Der Mock springt von `verify-dns` (sofort grün) direkt zum Cutover — ohne Zertifikat holen und ohne lokale Checks (443, Kette, h2, SSE).

## Bewusste Abweichungen (UX-Pass, im Mock so gelassen)

| Thema | Plan / heutige App | Mock |
| --- | --- | --- |
| Eigene Domain | Records **und** kurze Mail zur ACME-Freischaltung | nur Records + Haken. Mail: `operatorUnlockMailBody()` |
| Wartezeit-Copy | Tage sind normal, kein Timeout | „bis zu 48 Stunden“ |
| „Später“ ohne `prepare` | `tls.state = off`, **keine** Status-Karte | Karte „Noch nicht vorbereitet“ |
| Netzwerk-Save | „Einstellungen übernehmen“ vs. „HTTPS übernehmen“ | „Proxy speichern“ / „Auf HTTPS umstellen“ |
| Schritt 4 | LAN-IP **und** Erreichbarkeit | nur Host; `.local` / eigene Domain unter Netzwerk gesperrt |
| Schritt 5 | Proxy + Portal/WLAN-Hinweis (Auswahl folgt) | nur Proxy |

## Nicht im Mock (beim Port nicht vergessen)

Aus [`plan-proxy-tls-manager.md`](../../plan-proxy-tls-manager.md):

- Token nach Verbrauch nicht erneut in der Mail-Wiederholung zeigen
- Status nach Cutover: Hostname, Installations-ID (kein Token), Aussteller, Ablauf
- Fehlerklassen: fremde A-Record-IP / Kollision, DNS-Filter, Isolation, Firewall, Port 443, Uhrzeit, ACME, Zertifikatsname
- LAN-IP veraltet: alte IP behalten oder neue übernehmen → neuer Mailtext, Delegation bleibt
- Ablaufprüfung: bald abgelaufen / abgelaufen / „Jetzt erneuern“
- Nach Zertifikat: Warnung Portweiterleitung 443 (App sonst im Internet)
- `tls-custom` (PEM) — offener Manager-Punkt, keine Fläche
- Install-ID und Token erzeugt `prepare`, im Mock nur Sample-Konstanten

Heutige App, vom Mock nicht nachgebaut: Wizard zuerst fullscreen ohne Tabs; Geräte-URLs kopieren/öffnen; Routing-Hydrate; Binding-Checks / Topology. In `manager/README.md` steht unter Routing noch „Wizard: Schritt 3“ — das ist Schritt **2**.
