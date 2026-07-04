export function mergeFormAnswersWithSessionPhone(
  answers: Record<string, unknown>,
  sessionPhone: string | null,
): Record<string, unknown> {
  if (!sessionPhone) {
    return answers;
  }
  const current = answers.contactPhone;
  if (current == null || (typeof current === 'string' && current.trim().length === 0)) {
    return { ...answers, contactPhone: sessionPhone };
  }
  return answers;
}
