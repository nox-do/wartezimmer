/** Canonical birth date for CSV lookup and API: `YYYYMMDD`. */
export function canonicalizeBirthDate(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) {
    return null;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const year = Number(trimmed.slice(0, 4));
    const month = Number(trimmed.slice(5, 7));
    const day = Number(trimmed.slice(8, 10));
    return isPlausibleBirthDate(year, month, day) ? formatYmd(year, month, day) : null;
  }

  const digits = trimmed.replaceAll(/\D/g, '');
  if (digits.length !== 8) {
    return null;
  }

  const yearFirst = Number(digits.slice(0, 4));
  const monthFromYearFirst = Number(digits.slice(4, 6));
  const dayFromYearFirst = Number(digits.slice(6, 8));
  if (yearFirst >= 1900 && isPlausibleBirthDate(yearFirst, monthFromYearFirst, dayFromYearFirst)) {
    return formatYmd(yearFirst, monthFromYearFirst, dayFromYearFirst);
  }

  const dayFirst = Number(digits.slice(0, 2));
  const monthFromDayFirst = Number(digits.slice(2, 4));
  const yearFromDayFirst = Number(digits.slice(4, 8));
  if (isPlausibleBirthDate(yearFromDayFirst, monthFromDayFirst, dayFirst)) {
    return formatYmd(yearFromDayFirst, monthFromDayFirst, dayFirst);
  }

  return null;
}

export function birthDatesMatch(left: string, right: string): boolean {
  const a = canonicalizeBirthDate(left);
  const b = canonicalizeBirthDate(right);
  return a != null && b != null && a === b;
}

function formatYmd(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, '0')}${String(month).padStart(2, '0')}${String(day).padStart(2, '0')}`;
}

function isPlausibleBirthDate(year: number, month: number, day: number): boolean {
  if (month < 1 || month > 12 || day < 1 || day > 31 || year < 1900) {
    return false;
  }

  const parsed = new Date(year, month - 1, day);
  if (
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month - 1 ||
    parsed.getDate() !== day
  ) {
    return false;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (parsed > today) {
    return false;
  }

  const oldest = new Date(today);
  oldest.setFullYear(today.getFullYear() - 120);
  return parsed >= oldest;
}
