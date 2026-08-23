# Anamnese-Formularvorlagen — Ablage im Projekt

Ziel: viele Templates (Erstanamnese, Kurzform, später ggf. Unfall/D-Arzt) ohne Chaos. **Eine Vorlage = ein Ordner**, klare Trennung von Code, UI-Layout und Referenz-HTML.

## Verzeichnisbaum (Konvention)

```
app/src/shared/forms/
  template-registry.ts          # Aggregator: listet alle Definitionen, validateAnswers
  consent/
    privacy-notice-v1.ts        # Textversion fürs Popup (Version = Speicherfeld in DB)
  templates/
    definitions/
      index.ts                  # export const allTemplates = [...]
      allgemeinmedizin-erstanamnese.v1.ts
      datenschutz-einwilligung.v1.ts
    sections/
      <template-id>.sections.ts # Eine Quelle: titleKey (Portal) + pdfTitle (MFA-PDF) + fieldIds
    reference/
      html/                     # Nur Wireframe/Druckvorlage, nicht Runtime
        allgemeinmedizin-erstanamnese-v1.html

ui/src/lib/portal/
  anamnese-api.ts               # lädt Template inkl. sections von GET form-templates/{id}
  anamnese-field-control.ts     # Feld-Widgets pro fieldId (optional pro Template erweitern)
```

## Metadaten pro Template (`definitions/*.v1.ts`)

Jede Datei exportiert eine `FormTemplateDefinition`:

| Feld       | Bedeutung                                                                      |
| ---------- | ------------------------------------------------------------------------------ |
| `id`       | Stabile API-ID (`kebab-case`), z. B. `allgemeinmedizin-erstanamnese`           |
| `name`     | Anzeige MFA/PDF                                                                |
| `version`  | Integer, inkrement bei Felder-Änderung                                         |
| `category` | `erstanamnese` \| `kurz` \| `stammdaten` \| `spezial` (für spätere Menüfilter) |
| `fields`   | Feldliste (API-Contract)                                                       |

Neues Template: neue Datei `definitions/<id>.v1.ts` + Eintrag in `definitions/index.ts` + optional `reference/html/<id>-v1.html`.

## Portal-UI vs. Backend

| Schicht                          | Verantwortung                                                                                                             |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| **Backend `templates/sections`** | Abschnitte (titleKey + pdfTitle + fieldIds) — Portal via API, PDF via `form-pdf-display`                                  |
| **Portal**                       | Rendert `sections` aus Template-API; Sichtbarkeit (z. B. Telefon nur ohne Terminal-Nummer) in `anamnese-form-sections.ts` |
| **`anamnese-field-control`**     | Rendert `portalControl` aus der Template-API; lokal bleiben Zahlen-Attribute und Input-Typ                                |

Menü `/portal/menu` wählt aktuell **fest** ein Default-Template; später: MFA-Setting oder Query `?form=…`.

## Datenschutz (Einwilligung)

- Text: `app/src/shared/forms/consent/privacy-notice-v1.ts` (Version `privacy-v1`)
- Patient: Checkbox + Popup vor Absenden
- Speicherung: zweites PDF über dieselbe **form2pdf**-Pipeline (`datenschutz-einwilligung` v1) → normales Dokument `source=form` wie der Bogen; MFA-Vorschau/Export wie bei Upload
- Consent-Template: `definitions/datenschutz-einwilligung.v1.ts` (`formKind: consent`)

## Was bewusst nicht in `templates/` liegt

- Sandbox form2pdf-Rendering (interner Service)
- OpenAPI (bleibt `openapi/` + `docs/apis.md`)
- MFA-Dokumentenliste (normale `documents` mit `source=form`)

## Nächste sinnvolle Templates (Praxisleben, noch nicht umgesetzt)

| Template          | category     | Anmerkung                                |
| ----------------- | ------------ | ---------------------------------------- |
| Kurzanamnese      | `kurz`       | Wiedervorstellung                        |
| Stammdaten-Update | `stammdaten` | Adresse/Versicherung                     |
| Unfall/D-Arzt     | `spezial`    | eigene Pflichtfelder, nicht Erstanamnese |
