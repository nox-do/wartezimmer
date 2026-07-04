/** Readable display for pre-filled German mobile numbers (e.g. check-in). */
export function formatStoredPhoneForDisplay(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) {
    return '';
  }

  let digits = trimmed.replace(/\D/g, '');
  if (!digits) {
    return trimmed;
  }

  if (digits.startsWith('00')) {
    digits = digits.slice(2);
  } else if (digits.startsWith('0')) {
    digits = `49${digits.slice(1)}`;
  }

  if (digits.startsWith('49')) {
    const suffix = digits.slice(2);
    return suffix.length > 0 ? `+49 ${suffix}` : '+49';
  }

  if (trimmed.startsWith('+')) {
    const plusDigits = trimmed.replace(/[^\d+]/g, '');
    const match = plusDigits.match(/^(\+\d{1,3})(\d+)$/);
    if (match) {
      return `${match[1]} ${match[2]}`;
    }
  }

  return trimmed;
}

/** Strip spacing before API submit — keeps + prefix. */
export function compactPhoneForApi(input: string): string {
  return input.replace(/\s+/g, '').trim();
}
