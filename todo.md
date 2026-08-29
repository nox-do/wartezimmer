# Arbeitsstand (intern)

Stand: 2026-08-29

Kein Kunden-Dokument. Einstieg für Beta/IT: [`docs/README.md`](docs/README.md) · Scope: [`docs/roadmap.md`](docs/roadmap.md).
Chronik bis 2026-08-24: [`docs/archive/todo-history.md`](docs/archive/todo-history.md).

## Jetzt — Kunden-Test

- Release-Artefakte bauen und in einer Praxis prüfen: `release:pfupdate` + optional `release:images` ([`docs/delivery.md`](docs/delivery.md))
- Test-Scope und Nicht-Ziele: [`docs/roadmap.md`](docs/roadmap.md)

## Zurückgestellt (nicht Test-Blocker)

- Terminal: Assist-Press UX verdrahten (Stub bleibt)
- MFA: Connection-Budget / hängendes „Starten“ bei vielen SSE-Tabs
- Optional: `SSE_INVALID_DATA`-Semantik
- TLS / Internet-Portal: [`docs/plan-proxy-tls.md`](docs/plan-proxy-tls.md), Manager: [`docs/plan-proxy-tls-manager.md`](docs/plan-proxy-tls-manager.md) — Mailtext an Praxis Flow, DNS manuell/zeitversetzt, 6-Steller oder Wunsch-Label
- Captive-Vendor-Adapter (WLAN bleibt Praxis-IT)

## Als Nächstes — Wizard-Schritt 6 HTTPS (Manager)

Fehlerklassen extra.

## Heute (2026-08-29)

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
