# Arbeitsstand (intern)

Stand: 2026-08-24

Kein Kunden-Dokument. Einstieg für Beta/IT: [`docs/README.md`](docs/README.md) · Scope: [`docs/roadmap.md`](docs/roadmap.md).  
Chronik bis 2026-08-24: [`docs/archive/todo-history.md`](docs/archive/todo-history.md).

## Jetzt — Kunden-Test

- Release-Artefakte bauen und in einer Praxis prüfen: `release:pfupdate` + optional `release:images` ([`docs/delivery.md`](docs/delivery.md))
- Test-Scope und Nicht-Ziele: [`docs/roadmap.md`](docs/roadmap.md)

## Zurückgestellt (nicht Test-Blocker)

- Terminal: Assist-Press UX verdrahten (Stub bleibt)
- MFA: Connection-Budget / hängendes „Starten“ bei vielen SSE-Tabs
- Optional: `SSE_INVALID_DATA`-Semantik
- TLS / Internet-Portal: [`docs/plan-proxy-tls.md`](docs/plan-proxy-tls.md)
- Captive-Vendor-Adapter (WLAN bleibt Praxis-IT)

## Heute (2026-08-24)

- Audit DUP-003/004/013: behalten bzw. Stack-Version-Arg gemeinsam
- Doku: Kunden-Test-Pfad; Historie in `docs/archive/`; TLS-Zielbild getrennt
- `todo.md`: Chronik archiviert, hier nur aktuelle Liste
- Tote Dateien entfernt: `save-env-backup.ts`, `lucide-icons.ts`, Referenz-HTML Anamnese; Assist-Stub bleibt
- `smoke:auth-session` in `package.json` nachgezogen (`smoke:all` war tot)
