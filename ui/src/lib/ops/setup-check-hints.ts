/** German-only hint text for Ops setup checks (staff UI; not part of patient i18n). */
const SETUP_CHECK_HINTS: Record<string, string> = {
  PRACTICE_PROFILE_DISPLAY_NAME_MISSING:
    'Praxisname fehlt — im Schritt „Praxis“ eintragen oder unter System → Praxis & Datenschutz.',
  SETUP_CONTACT_MODE_UNSET: 'Bitte im Schritt „CSV“ Beispieldatei oder eigene CSV wählen.',
  CONTACT_LOOKUP_FOLDER_NOT_SET:
    'Kein Import-Ordner ausgewählt — Ordner unter Imports anlegen und zuordnen.',
  CONTACT_LOOKUP_MAPPING_INVALID: 'Spaltenzuordnung ist ungültig — Mapping prüfen.',
  CONTACT_LOOKUP_VALIDATION_FAILED:
    'Kontakt-CSV konnte nicht gelesen werden — Ordner, Trennzeichen und Spalten prüfen.',
  CONTACT_LOOKUP_INVALID_PATH:
    'Import-Ordner ist ungültig oder liegt außerhalb des erlaubten Bereichs.',
  CONTACT_LOOKUP_INVALID_MAPPING: 'Spaltenzuordnung ist unvollständig oder ungültig.',
  CONTACT_LOOKUP_INVALID_MAPPING_FIELD: 'Eine Spaltenzuordnung verweist auf eine ungültige Spalte.',
  CONTACT_LOOKUP_UNKNOWN_COLUMN: 'Unbekannte Spalte „{column}“ in der Zuordnung.',
  CONTACT_LOOKUP_EMPTY_FILE: 'CSV-Datei ist leer oder enthält keine Datenzeilen.',
  CONTACT_LOOKUP_INVALID_MAPPING_MOBILE: 'Mobilnummer-Spalte fehlt oder ist ungültig.',
  CONTACT_LOOKUP_MOBILE_COLUMN_UNREADABLE: 'Mobilnummer-Spalte ist nicht lesbar — Format prüfen.',
  CONTACT_LOOKUP_BIRTH_DATE_COLUMN_UNREADABLE:
    'Geburtsdatum-Spalte ist nicht lesbar — Format prüfen (z. B. TT.MM.JJJJ).',
  MESSAGING_REAL_PROVIDER_REQUIRED:
    'Für SMS-Rückrufe einen echten Provider (nicht Mock) konfigurieren — optional überspringbar.',
  MESSAGING_PROVIDER_NOT_SELECTED: 'Kein SMS-Provider gewählt.',
  MESSAGING_PROVIDER_NOT_CONFIGURED: 'SMS-Provider gewählt, aber Zugangsdaten fehlen noch.',
  SETUP_VERIFY_PENDING:
    'Noch nicht geprüft — „Prüfen“ ausführen oder Schritt mit Verifikation öffnen.',
};

const MACHINE_CODE_PATTERN = /^[A-Z][A-Z0-9_]*$/;

/** Server hint code when expensive setup checks have not run yet. */
export const SETUP_VERIFY_PENDING_HINT = 'SETUP_VERIFY_PENDING';

export function isSetupCheckPending(hint: string | null | undefined): boolean {
  return hint === SETUP_VERIFY_PENDING_HINT;
}

function formatHint(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => vars[key] ?? `{${key}}`);
}

function lookupHintKey(code: string): string | null {
  return SETUP_CHECK_HINTS[code] ?? null;
}

/** Maps server setup-check hint codes to German UI text; prose hints pass through unchanged. */
export function mapSetupCheckHint(hint: string): string {
  if (!MACHINE_CODE_PATTERN.test(hint)) {
    return hint;
  }

  const exact = lookupHintKey(hint);
  if (exact) {
    return exact;
  }

  if (hint.startsWith('CONTACT_LOOKUP_UNKNOWN_COLUMN_')) {
    const column = hint.slice('CONTACT_LOOKUP_UNKNOWN_COLUMN_'.length);
    return formatHint(SETUP_CHECK_HINTS.CONTACT_LOOKUP_UNKNOWN_COLUMN, { column });
  }

  if (hint.startsWith('CONTACT_LOOKUP_INVALID_MAPPING_')) {
    return SETUP_CHECK_HINTS.CONTACT_LOOKUP_INVALID_MAPPING_FIELD;
  }

  if (hint.startsWith('CONTACT_LOOKUP_')) {
    return SETUP_CHECK_HINTS.CONTACT_LOOKUP_VALIDATION_FAILED;
  }

  return hint;
}
