export type FormatTicketCodeInputOptions = {
  /** When true, inserts `-` right after the lane letter (e.g. `A` → `A-`). */
  appendDashAfterLetter?: boolean;
};

/** Formats in-progress portal ticket input to `PREFIX-NNN` while typing. */
export function formatTicketCodeInput(
  raw: string,
  options: FormatTicketCodeInputOptions = {},
): string {
  const cleaned = raw.toUpperCase().replace(/[^A-Z0-9-]/g, '');
  const letter = cleaned.match(/^[A-Z]/)?.[0] ?? '';
  if (!letter) {
    return '';
  }

  const digits = cleaned.slice(1).replace(/-/g, '').replace(/\D/g, '').slice(0, 4);
  if (digits.length > 0) {
    return `${letter}-${digits}`;
  }

  const hasDash = cleaned.length > 1 && cleaned.startsWith(`${letter}-`);
  if (hasDash || options.appendDashAfterLetter) {
    return `${letter}-`;
  }

  return letter;
}

/** Normalizes patient ticket codes to `PREFIX-NNN` (backend expects e.g. `O-001`). */
export function normalizeTicketCode(raw: string): string | null {
  const trimmed = raw.trim().toUpperCase();
  if (!trimmed) {
    return null;
  }

  const dashed = trimmed.match(/^([A-Z])-([0-9]{1,4})$/);
  if (dashed) {
    return `${dashed[1]}-${dashed[2].padStart(3, '0')}`;
  }

  const compact = trimmed.match(/^([A-Z])([0-9]{1,4})$/);
  if (compact) {
    return `${compact[1]}-${compact[2].padStart(3, '0')}`;
  }

  return null;
}
