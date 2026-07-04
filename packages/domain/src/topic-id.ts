export const MFA_ASSIST_TOPIC_ID = 'mfa';

export const TOPIC_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const MAX_TOPIC_ID_LENGTH = 64;

export function isValidConfigurableTopicId(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > MAX_TOPIC_ID_LENGTH) {
    return false;
  }
  if (trimmed === MFA_ASSIST_TOPIC_ID) {
    return false;
  }
  return TOPIC_ID_PATTERN.test(trimmed);
}

export function slugifyTopicId(label: string, taken: ReadonlySet<string> = new Set()): string {
  const base = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  let candidate = (base.length > 0 ? base : 'thema').slice(0, 48);
  if (!isValidConfigurableTopicId(candidate)) {
    candidate = 'thema';
  }
  if (!taken.has(candidate)) {
    return candidate;
  }
  for (let i = 2; i < 100; i += 1) {
    const next = `${candidate.slice(0, 44)}-${i}`;
    if (!taken.has(next)) {
      return next;
    }
  }
  return `thema-${Date.now()}`;
}
