# Form templates

Siehe **`docs/architecture/documents.md`** für die Projekt-Konvention.

- **Definitionen (Runtime):** `definitions/*.v1.ts` → aggregiert in `template-registry.ts`
- **Abschnitte (eine Quelle):** `sections/<template-id>.sections.ts` — Portal (`titleKey`) + MFA-PDF (`pdfTitle`) + `fieldIds`

Dokument-Lifecycle (`documents`, Sandbox-Intake) kennt nur `source=upload|form` — keine Anamnese-Sonderpfade.
