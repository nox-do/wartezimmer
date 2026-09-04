export type ConsentPatientSnapshot = {
  patientFullName: string | null;
  patientBirthDate: string | null;
  patientPhone: string | null;
};

function readString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function buildConsentPatientSnapshot(
  answers: Record<string, unknown>,
): ConsentPatientSnapshot {
  return {
    patientFullName: readString(answers.fullName),
    patientBirthDate: readString(answers.birthDate),
    patientPhone: readString(answers.contactPhone),
  };
}
