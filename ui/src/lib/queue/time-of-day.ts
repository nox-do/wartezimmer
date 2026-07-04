const TIME_OF_DAY_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function isValidTimeOfDay(value: string): boolean {
  return TIME_OF_DAY_PATTERN.test(value.trim());
}

export type TopicTimeWindowValidationResult =
  | { ok: true }
  | { ok: false; code: 'incomplete' }
  | { ok: false; code: 'invalid'; field: 'from' | 'to'; value: string };

export function validateTopicTimeWindow(
  availableFrom: string | null | undefined,
  availableTo: string | null | undefined,
): TopicTimeWindowValidationResult {
  const from = availableFrom?.trim() || null;
  const to = availableTo?.trim() || null;

  if (from === null && to === null) {
    return { ok: true };
  }

  if (from === null || to === null) {
    return { ok: false, code: 'incomplete' };
  }

  if (!isValidTimeOfDay(from)) {
    return { ok: false, code: 'invalid', field: 'from', value: from };
  }

  if (!isValidTimeOfDay(to)) {
    return { ok: false, code: 'invalid', field: 'to', value: to };
  }

  return { ok: true };
}
