export const TRIAGE_LEVELS = ['red', 'yellow', 'green'] as const;

export type TriageLevel = (typeof TRIAGE_LEVELS)[number];

export function isTriageLevel(value: string | null | undefined): value is TriageLevel {
  return value === 'red' || value === 'yellow' || value === 'green';
}

export function normalizeTriageLevel(value: string | null | undefined): TriageLevel | null {
  return isTriageLevel(value) ? value : null;
}

/** none → green → yellow → red → none */
export function cycleTriageLevel(current: string | null | undefined): TriageLevel | null {
  const level = normalizeTriageLevel(current);
  if (level === null) {
    return 'green';
  }
  if (level === 'green') {
    return 'yellow';
  }
  if (level === 'yellow') {
    return 'red';
  }
  return null;
}
