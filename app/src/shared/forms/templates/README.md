# Form templates

Siehe **`docs/anamnese-templates.md`** für die Projekt-Konvention.

- **Definitionen (Runtime):** `definitions/*.v1.ts` → aggregiert in `template-registry.ts`
- **Abschnitte (eine Quelle):** `sections/<template-id>.sections.ts` — Portal (`titleKey`) + MFA-PDF (`pdfTitle`) + `fieldIds`
- **Referenz-HTML (Wireframe):** `reference/html/` (nicht Runtime)

Dokument-Lifecycle (`documents`, Sandbox-Intake) kennt nur `source=upload|form` — keine Anamnese-Sonderpfade.
