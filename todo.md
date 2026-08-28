# Arbeitsstand (intern)

Stand: 2026-08-28

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

## Heute (2026-08-28)

- LAN-TLS UI-Vorbereitung: CSS-Reuse — `notice`/`lan-warning`, `hint`+`code`, `wizard-input is-monospace`, `status-grid`, `network-config-block > details`; nur Dots + `wizard-nested` + `hint--preview` neu
- Mock: Schritte 1–3 aus UI entfernt (Scope 4–8); Sprungmarken-Footer entfernt — Durchklicken über Assistent + Tab-Nav

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
