# Arbeitsstand (intern)

Stand: 2026-08-29

Kein Kunden-Dokument. Einstieg für Beta/IT: [`docs/README.md`](docs/README.md) · Scope: [`docs/roadmap.md`](docs/roadmap.md).
Chronik bis 2026-08-24: [`docs/archive/todo-history.md`](docs/archive/todo-history.md).

## Jetzt — Kunden-Test

- Packaged Manager: TLS-Compose-Template fehlte im Bundle → Setup-API crash. `docker-compose.proxy-tls.delivery.yml` in prepare-packaged.
- Docker: Lab-Images weg; Build-Basen und 0.3.0-Images bleiben.
- Test-Scope und Nicht-Ziele: [`docs/roadmap.md`](docs/roadmap.md)

## Zurückgestellt (nicht Test-Blocker)

- Terminal: Assist-Press UX verdrahten (Stub bleibt)
- MFA: Connection-Budget / hängendes „Starten“ bei vielen SSE-Tabs
- Optional: `SSE_INVALID_DATA`-Semantik
- TLS / Internet-Portal: [`docs/plan-proxy-tls.md`](docs/plan-proxy-tls.md), Manager: [`docs/plan-proxy-tls-manager.md`](docs/plan-proxy-tls-manager.md) — Mailtext an Praxis Flow, DNS manuell/zeitversetzt, 6-Steller oder Wunsch-Label
- Captive-Vendor-Adapter (WLAN bleibt Praxis-IT)

## Als Nächstes

- Manager-Installer aufräumen: [`docs/plan-manager-installer-cleanup.md`](docs/plan-manager-installer-cleanup.md). Wartung A+B durch; Notify-Regel auch Wizard/Netzwerk.
- HTTPS-Aufräumen: Schnitte 1–3 umgesetzt und reviewt.
- Produkt-Spec bleibt [`docs/plan-proxy-tls-manager.md`](docs/plan-proxy-tls-manager.md).
- Boot-Aufräumen ist im Code; Plan dazu gelöscht. Hülle-Reste (View-Unmount, IPC) kein Folgeauftrag.
- `state/tls/` liegt in `.gitignore` (Token, acme-dns, Caddyfile).

## Heute (2026-08-29)

- Manager-Aufräumen Notify: Wizard/Netzwerk eine Leitung (`onStateChange`), Extra-`syncSnapshot`/`onPatch` weg.

- Manager-Aufräumen Diff B: Confirm/PIN armieren die Sperre schon am Dialog; Abbrechen und `hide()` räumen sie. Bestätigte Stack-/Storage-Aktion verpufft nicht mehr still.

- Manager-Aufräumen Diff A (Schnitt 1+2): `lifecycleGeneration`/`hide()`, Bootstrap unabhängig bis alle settled, Routing-Reset, Catch/ein `onAfterMutation` bei Pfupdate, Stack-Refresh vor Logs.

- Manager-Aufräumen-Plan bereinigt: Bootstrap-Busy bis alle drei settled; `show()` setzt Routing zurück; Sperre ist View + Guard (Restore/Pfupdate ziehen in Schnitt 3 den Tab zu); `getPfbackupInfo` → `errors.backup`.

- Schnitt 3 Status-Resume: Warte-Zusatz nur DNS-Warten; `preparing` nicht als Warten; kein „unter Netzwerk“; Fail-Wörter wie Netzwerk; Apply-Fail mit Cutover-Kontext. Post-Cutover ohne HTTP-Zusage. `TlsResumeCard.svelte` unverändert.
- Schnitt 1 Netzwerk: Warte-Copy nur `awaiting-operator-dns`; persistierter Fail vs Apply-Fail; Status-Refresh nach Apply/Obtain/Prepare-Catch; Footer nur ohne `lastError`. `error` ohne `lastError`: nur Footer, Repair/Reset bleiben.
- HTTPS-Plan: Catch ohne Status-Refresh; persistierter Fail nur `error && !cutoverApplied`.
- HTTPS-Plan Review übernommen: Apply-Fail ≠ `state=error` (erneut apply); `clock`/`cert-name` nicht in `lastError`; Warte-Copy nur `awaiting-operator-dns`. [`docs/plan-manager-https.md`](docs/plan-manager-https.md)
- HTTPS-Plan geschärft (kein Umbau): welche Klasse Setup wirklich setzt; Aufräumen = Fail vs. Warten auf Netzwerk.
- Plan Manager-Boot gelöscht (Code war schon da).

- Status-Ampel: Proxy-Kachel nur wenn Proxy enabled (nicht am App/Sandbox-Stack); bei Ersteinrichtung keine Ampel-Kacheln.
- Boot: Chrome/Status erst nach Config — Runtime kam vorher und hat die Statusleiste vor dem Wizard geblitzt.

- Status-HTTPS-Wartekarte: kein „Fortsetzen unter Netzwerk.“ — der Button reicht.
- DNS: Catch-all `*.lan.notaus.de` → öffentliche IP; Meldung nennt aufgelöste vs. LAN-IP, kein „Name vergeben“.
- DNS-Fehlercopy: nur was der Resolver zeigt (fehlt / andere IP). Kein „Name ist vergeben“.
- HTTPS-Resume: Titel mit vorhandenem `network-config-subheading`, kein Extra-CSS.
- HTTPS-Reise: Status-Resume nicht mehr als große h1; Warte-Copy unter Netzwerk als Hinweis.
- HTTPS: kein „Mail ist raus“ — User sendet; Warte-Copy wie Mock (bis 48 h). Kein SMTP aus der App.
- Status-LAN-Warnung: „IP in .env … passt nicht zur aktuellen IP — Bitte unter Netzwerk anpassen.“
- Status-Host: kein `(repo)`/`(install)` mehr hinter dem Pfad.
- Status: Überschrift „Host“ wie „Geräte-URLs“ (nicht mehr Caps/Eyebrow).
- Status-Tab: Meldungen oben (`notice`); Host-Daten kompakt wie LAN-Zeilen. Kein Gesamtstatus mehr über den Ampel-Kacheln.
- Netzwerk-HTTPS Name wählen: Meta-Hinweis „Einstieg unter Netzwerk … Assistent ‚Später‘“ entfernt.
- Netzwerk-HTTPS-Lease: bei abweichender IP stoppen — Kurztext „Bitte anpassen.“
- Netzwerk-HTTPS-Lease: Meta-Hinweis „Portfreigabe … nicht Teil dieser Bestätigung“ entfernt (Warnung bleibt vor Cutover).
- Setup-Build: `applyHostTls` reicht den schon geprüften Hostname in `runChecks` (tsc unter `dist:mac`).
- TLS-Sidecar Restore rund: Caddyfile nach Unpack neu; Rollback sichert `state/tls`; Unpack/Discard wipen; Export-Sidecar folgt dem Stick-Ordner auch ohne Timestamp im Backup-Namen; unlesbares Geschwister = fehlt (zweiter Dialog). Kein Format v2.

## Heute (2026-08-28)

- LAN-TLS Backup-Sidecar (Pilot): `praxis-flow-tls-<timestamp>.tgz` neben `.pfbackup` v1 ab `tls.state ≠ off`. Inspect/Restore über Bytes; Main Timestamp/zweiter Dialog. Aktives HTTPS ohne Sidecar blockt; prepare-only ohne Sidecar restored HTTP. Wartung-Block HTTPS-State. Kein Format v2, kein zweiter Restore-Wizard.
- Wizard: Proxy nach Prepare gesperrt; HTTPS-Vorschau folgt dem Draft, wenn der Fork nicht mehr zur Host-Identität passt.
- Wizard-Schritt 6 HTTPS: 1–8, Phasen Angebot→Name→Lease→Mail/PEM, prepare nach Lease; DNS/Cert/Cutover bleiben unter Netzwerk. Ohne Proxy 5→7.

## Heute (2026-08-28)

- Manager Netzwerk-HTTPS-Block: Start unter Netzwerk; Token-Reload via prepare; Cutover/Reset mit Confirm; PEM nur in Main; Obtain-Timeout 6min. Wizard-Schritt 6 und Backup-Sidecar extra.
- Arbeitspaket 4/4: HTTPS-Cutover-E2E — isolierter `npm run smoke:tls-cutover` (Pebble), `apply` nach `applyReady`; Canonical/Geräte HTTPS, Port-80-Redirect; Reload-Fehler rollt Canonical zurück.
- Pebble-Pfad Review: Compose-Restart nur Produkt-Services; Proxy-Reload ohne hartes Restart nach Recreate; lokale Checks fail-fast bei Konfig/PEM; Smoke-Obtain 180s
- Arbeitspaket 3/4: Setup-TLS an Pebble-Lab — `TLS_DNS_RESOLVERS`, getrennte acme-dns-URLs, Pebble-Root nur für lokale Checks, Caddy-Bereitschaft pollend, `npm run smoke:tls-managed` bis `applyReady=true`; Smoke erkennt auch gestoppte Namenskollisionen und räumt partielle Starts auf (kein `apply`, kein `TLS_RUNTIME_FAKE`)
- Arbeitspaket 2/4: TLS-Lab-Infra opt-in — `docker-compose.tls-lab.yml` (Pebble 2.10.1, acme-dns v1.0, CoreDNS 1.14.7), Proxy-Minica-Overlay, `docs/tls-lab.md`, `npm run smoke:tls-lab`; kein Setup-obtain
- TLS-Lab Review: Challenge-CNAME nach `/register` schreiben + Kette prüfen; Start/Smoke als Alternativen; curl-Hilfsimage per Digest
- Arbeitspaket 1/4: lokales Custom-Caddy-Image `praxis-flow-proxy:2.11.4-acmedns` (`proxy/Dockerfile`, xcaddy + `acmedns@v0.7.0`); Compose weiter über `PRAXIS_FLOW_PROXY_IMAGE`, Default bleibt Stock `caddy:2.11.4`
- LAN-TLS Backend Schicht 1–3: Shared-Vertrag, persistenter Setup-State und TLS-Routen (Fake-/DNS-/Custom-PEM-Gates), opt-in Caddy-443-Overlay + generierte Caddyfile; Manager/Backup-Sidecar/Pilot weiter separat
- LAN-TLS UI-Vorbereitung: CSS-Reuse — `notice`/`lan-warning`, `hint`+`code`, `wizard-input is-monospace`, `status-grid`, `network-config-block > details`; nur Dots + `wizard-nested` + `hint--preview` neu
- Mock: Schritte 1–3 + Sprungmarken aus UI; `styles.css` mock-* vs Manager-Port getrennt (`mock-shell`, scoped Preview-Nav)

## Heute (2026-08-28)

- TLS Backend: Network-Save während Vorbereitung — Proxy abschalten/Erreichbarkeit-Override blockiert; `TLS_LAN_IP` sync bei LAN-Wechsel (`tls-env.ts`, `proxy.ts`, `host-state.ts`)
- Manager Netzwerk-Tab an TLS-Status gebunden: während Vorbereitung Port 80/Erreichbarkeit gesperrt, LAN-Save ohne Proxy/Canonical, Status-Refresh abgewartet; Payload-Tests für Vorbereitung, Cutover und HTTP-only


## Heute (2026-08-27)

- Review LAN-TLS: Port-Plan ok; Kontext nachgezogen — State-ASCII=`applyReady`, `prepare` nach Hostname/spätestens Mail-PEM, `can*` nur Status-Abbildung
- Restore: kein Wizard im Mock — Anknüpfung `tlsInBackup` / Inspect-Zeile / Gate; JSDoc an BackupPanel, inspect, restore-flow, RestoreInput
- Rebind-Kasten: wenn Server aus dem WLAN nicht erreichbar — Router auf WLAN↔LAN bzw. Geräte-im-WLAN prüfen
- Gast-WLAN / privates DNS: gehört unter Netzwerk → „Adresse für Terminal, TV und MFA“ (auch ohne TLS). Mock-Copy da; Manager nur JSDoc — nächste KI erinnern
- Rebind-Hinweis: Erklärung + 4 Schritte, herstellerneutral (nicht nur Fritzbox)
- Cutover-Hinweis: „Außerhalb der Öffnungszeiten wäre besser“ statt Mittagssprechstunde
- Namenswahl ist die Zertifikats-Fork: notaus / Label = Let's Encrypt; eigene Domain = PEM. Kein zweites Radioset
- Mock: leere Seite (nur „Einrichtung“ + leere Sprungmarken) — Scripts ohne ES-Module, damit `file://` lädt
- TLS-Backup: Sidecar `praxis-flow-tls-<timestamp>.tgz` entschieden; „bald abgelaufen“ = 21 Tage
- Wunsch-Label = DNS-Label; eigenes Zertifikat = PEM-Inhalt via Manager/Setup; mailto `cert@notaus.de`
- ACME-DNS PoC: `auth.acme-dns.io`; Produkt später `auth.acme.praxis-flow.de`. `notaus.de` nur Testdomain
- Cutover / Zertifikat / Backup als eine Strecke in den TLS-Plänen: `obtain-certificate` vor `apply`, Sidecar neben `.pfbackup` v1
- Mock: DNS-grün → Zertifikat holen → lokale Checks → Cutover; Status mit Ablauf; Wartung mit Sidecar-Hinweis
- Mock-Wizard an heutige App angeglichen: 1–5 wie bisher, 6 HTTPS (neu), 7 Vorschau, 8 Abschluss (Apply)
- Mock: HTTPS-Unterschritte in der Nummernleiste als 4 Punkte (x von 4)
- Mock als Manager-Vorlage: `tls-model.js`; README listet Plan-Lücken (Cert-Schritt, Token, Fehlerklassen, …)

## 2026-08-26

- Mock: Eigene Domain — nur DNS-Records + Haken „angelegt“, keine Mail/Fritzbox-Mischung

## 2026-08-25

- UX-Review LAN-TLS-Mock: Mail ist die Aufgabe (An + Mail öffnen + Haken); Auftragskarte unter Netzwerk; Cutover warnt vor toten HTTP-Lesezeichen; kein nacktes „Betreiber“
- TLS-Plan: Mailtext an Praxis Flow (manuell, zeitversetzt); 6-Steller-Default oder eigenes Label; ID intern für ACME
- Statischer Wizard-Mock: Port 80 ist Voraussetzung für TLS; ohne Proxy Namensschritt überspringen; „Später“ startet unter Netzwerk; Port 80 speichern ≠ Auf HTTPS umstellen
- Diagnose: `verify-dns` nur vom Praxisserver (A/CNAME); zweites Gerät und Rebind erst nach dem Umstellen

## 2026-08-24

- Audit-Inventur nach `docs/archive/audit-dopplungen-altlasten.md` (Welle abgeschlossen)
- Netzwerk-Tab: Stale-IP-Hinweis ohne „unten“ (Prüfungen → „Adresse dieses Rechners“)
- Manager-TLS-Anforderungen nach `docs/plan-proxy-tls-manager.md` getrennt
- Audit DUP-003/004/013: behalten bzw. Stack-Version-Arg gemeinsam
- Doku: Kunden-Test-Pfad; Historie in `docs/archive/`; TLS-Zielbild getrennt
- `todo.md`: Chronik archiviert, hier nur aktuelle Liste
- Tote Dateien entfernt: `save-env-backup.ts`, `lucide-icons.ts`, Referenz-HTML Anamnese; Assist-Stub bleibt
- `smoke:auth-session` in `package.json` nachgezogen (`smoke:all` war tot)
- TLS-Plan: öffentlicher A-Record auf LAN-IP; Manager-Mail + `verify-dns`; `portal.<praxis>` mitbestellen; `apply` erst nach DNS, HTTP-Redirect statt Cutover ohne Port 80; 443 auf 0.0.0.0
