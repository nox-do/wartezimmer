/**
 * Canonical phone form for storage, CSV lookup, and SMS: E.164-like `+<country><national>`.
 * Not DE-only — `+49` is a common input heuristic (leading `0`), not a hard rule.
 */
export function canonicalizePhone(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) {
    return null;
  }

  if (trimmed.startsWith('+')) {
    const digits = trimmed.slice(1).replace(/\D/g, '');
    return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
  }

  let digits = trimmed.replace(/\D/g, '');
  if (!digits) {
    return null;
  }

  if (digits.startsWith('00')) {
    digits = digits.slice(2);
  } else if (digits.startsWith('0')) {
    digits = `49${digits.slice(1)}`;
  }

  return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
}

export function phonesMatch(left: string, right: string): boolean {
  const a = canonicalizePhone(left);
  const b = canonicalizePhone(right);
  return a != null && b != null && a === b;
}
