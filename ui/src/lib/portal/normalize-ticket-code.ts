import { formatTicketCode, parseTicketCode } from '@wartezimmer/domain';

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

/** Normalizes patient ticket codes via domain parse/format (backend uses the same rules). */
export function normalizeTicketCode(raw: string): string | null {
  const parsed = parseTicketCode(raw.trim());
  return parsed ? formatTicketCode(parsed.laneCode, parsed.number) : null;
}
