# Arbeitsstand (intern)

Stand: 2026-08-31

## 2026-08-31 — TLS-Placeholder Seidel → Muster

- TLS-UI-Placeholders, Tests, Docs/Mock: `seidel` → `muster` (kein Praxis-Seed betroffen)

## 2026-09-01 — nachfragen

MFA über Nacht/Standby: Hat der Banner „Neuen Tag starten“ ohne Refresh gegriffen? (Rechner geschlafen, Tab blieb offen und im Fokus.)

## 2026-08-31 — Beta-Review SMS/WhatsApp Rückholen

- Kontext + Review-Prompt für E2E-Feature „Abwesend / Rückholen / SMS & WhatsApp“ zusammengestellt
- Findings 2–12 geprüft: 2–7,9–10,12 bestätigt; 8 optional (kein Fix); 11 Dev-only (kein Fix)
- Fixes umgesetzt: WA-Parser (#2), fallbackFrom OpenAPI (#3), BUSINESS_TZ SMS-Zeit (#4), callbackPhone behalten (#5), 2. Recall → 409 (#6), 8s Timeout (#7), Ops-UI (#9/#10), Smoke-Telefon (#12)
- Nachzug: #6 Guard auf aktives returnUntil (nicht nur Status); WA-Sprache Draft leer (#10); TimeoutError+Body → SEVEN_*_TIMEOUT (#7)

## 2026-08-31 — Re-Review E2E Kern (Defect-only)

- Canvas: recall-messaging-beta-review
- **Blocker B1:** SMS-Text nutzt visitId (UUID) statt formatTicketCode(lane, number)
- Major: WA ohne Template-Parameter; Smoke unzureichend für Live-Beta
- Minor: hasMobilePhone+identityRef; WA-Fallback maskiert SMS-Fehler
- Info: Klartext-Credentials bewusst; MFA ohne notifyChannel whatsapp (bekannt)
- Verdict: SMS-Kern nach B1-Fix beta-fähig; WA weiter API-only
- Nachzug umgesetzt: B1 Ticket-Code in SMS/WA; WA components {{1}} Zeit {{2}} Ticket; Smoke +409/no-phone/retry; hasMobilePhone ohne identityRef; SMS-error bei Dual-Fail
