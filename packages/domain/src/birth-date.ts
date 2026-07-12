/** Canonical birth date for CSV lookup and API: `YYYYMMDD`. */
export type BirthDateIssue = 'incomplete' | 'invalid' | 'future';

/** Parts classification: `null` means plausible/accepted. */
type BirthDatePartsIssue = 'invalid' | 'future';

function formatYmd(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, '0')}${String(month).padStart(2, '0')}${String(day).padStart(2, '0')}`;
}

function classifyBirthDateParts(
  year: number,
  month: number,
  day: number,
): BirthDatePartsIssue | null {
  if (month < 1 || month > 12 || day < 1 || day > 31 || year < 1900) {
    return 'invalid';
  }

  const parsed = new Date(year, month - 1, day);
  if (
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month - 1 ||
    parsed.getDate() !== day
  ) {
    return 'invalid';
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (parsed > today) {
    return 'future';
  }

  const oldest = new Date(today);
  oldest.setFullYear(today.getFullYear() - 120);
  if (parsed < oldest) {
    return 'invalid';
  }

  return null;
}

/**
 * Normalize birth-date input to `YYYYMMDD`.
 * Accepts ISO (`YYYY-MM-DD`), digit-only day-first (`DDMMYYYY`) / year-first (`YYYYMMDD`),
 * and punctuated German forms (`DD.MM.YYYY`).
 */
export function canonicalizeBirthDate(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) {
    return null;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const year = Number(trimmed.slice(0, 4));
    const month = Number(trimmed.slice(5, 7));
    const day = Number(trimmed.slice(8, 10));
    return classifyBirthDateParts(year, month, day) === null ? formatYmd(year, month, day) : null;
  }

  const digits = trimmed.replaceAll(/\D/g, '');
  if (digits.length !== 8) {
    return null;
  }

  const yearFirst = Number(digits.slice(0, 4));
  const monthFromYearFirst = Number(digits.slice(4, 6));
  const dayFromYearFirst = Number(digits.slice(6, 8));
  if (
    yearFirst >= 1900 &&
    classifyBirthDateParts(yearFirst, monthFromYearFirst, dayFromYearFirst) === null
  ) {
    return formatYmd(yearFirst, monthFromYearFirst, dayFromYearFirst);
  }

  const dayFirst = Number(digits.slice(0, 2));
  const monthFromDayFirst = Number(digits.slice(2, 4));
  const yearFromDayFirst = Number(digits.slice(4, 8));
  if (classifyBirthDateParts(yearFromDayFirst, monthFromDayFirst, dayFirst) === null) {
    return formatYmd(yearFromDayFirst, monthFromDayFirst, dayFirst);
  }

  return null;
}

export function birthDatesMatch(left: string, right: string): boolean {
  const a = canonicalizeBirthDate(left);
  const b = canonicalizeBirthDate(right);
  return a != null && b != null && a === b;
}

/**
 * Structured birth-date issue for UX mapping.
 * Empty input → `null` (no error while typing). Valid input → `null`.
 */
export function getBirthDateIssue(input: string): BirthDateIssue | null {
  const trimmed = input.trim();
  if (!trimmed) {
    return null;
  }

  if (canonicalizeBirthDate(trimmed)) {
    return null;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const year = Number(trimmed.slice(0, 4));
    const month = Number(trimmed.slice(5, 7));
    const day = Number(trimmed.slice(8, 10));
    return classifyBirthDateParts(year, month, day) ?? 'invalid';
  }

  const digits = trimmed.replaceAll(/\D/g, '');
  if (digits.length === 0) {
    return null;
  }
  if (digits.length < 8) {
    return 'incomplete';
  }

  let sawFuture = false;

  if (digits.length === 8) {
    const yearFirst = Number(digits.slice(0, 4));
    const monthFromYearFirst = Number(digits.slice(4, 6));
    const dayFromYearFirst = Number(digits.slice(6, 8));
    if (yearFirst >= 1900) {
      const yearFirstIssue = classifyBirthDateParts(
        yearFirst,
        monthFromYearFirst,
        dayFromYearFirst,
      );
      if (yearFirstIssue === null) {
        return null;
      }
      if (yearFirstIssue === 'future') {
        sawFuture = true;
      }
    }

    const dayFirst = Number(digits.slice(0, 2));
    const monthFromDayFirst = Number(digits.slice(2, 4));
    const yearFromDayFirst = Number(digits.slice(4, 8));
    const dayFirstIssue = classifyBirthDateParts(yearFromDayFirst, monthFromDayFirst, dayFirst);
    if (dayFirstIssue === null) {
      return null;
    }
    if (dayFirstIssue === 'future') {
      sawFuture = true;
    }
  }

  return sawFuture ? 'future' : 'invalid';
}

export function isValidBirthDate(input: string): boolean {
  return canonicalizeBirthDate(input) != null;
}
