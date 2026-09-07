/** A free-form lookup value is a manual display name only when it contains a letter. */
export function manualMfaIdentityRef(query: string): string | undefined {
  const trimmed = query.trim();
  return /\p{L}/u.test(trimmed) ? trimmed : undefined;
}
