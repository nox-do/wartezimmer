import type { PracticeProfile } from '@praxis-flow/domain';

export type { PracticeProfile } from '@praxis-flow/domain';

export const EMPTY_PRACTICE_PROFILE: PracticeProfile = {
  displayName: '',
  street: '',
  postalCode: '',
  city: '',
  phone: '',
  email: '',
  dataProtectionOfficer: '',
  website: '',
};

const PROFILE_STRING_FIELDS: Array<keyof PracticeProfile> = [
  'displayName',
  'street',
  'postalCode',
  'city',
  'phone',
  'email',
  'dataProtectionOfficer',
  'website',
];

function readEnv(name: string): string {
  return process.env[name]?.trim() ?? '';
}

function trimField(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

export function normalizePracticeProfile(input: unknown): PracticeProfile {
  const source = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
  return {
    displayName: trimField(source.displayName),
    street: trimField(source.street),
    postalCode: trimField(source.postalCode),
    city: trimField(source.city),
    phone: trimField(source.phone),
    email: trimField(source.email),
    dataProtectionOfficer: trimField(source.dataProtectionOfficer),
    website: trimField(source.website),
  };
}

export function mergePracticeProfile(
  current: PracticeProfile,
  patch: Partial<PracticeProfile>,
): PracticeProfile {
  const next = { ...current };
  for (const field of PROFILE_STRING_FIELDS) {
    if (patch[field] !== undefined) {
      next[field] = trimField(patch[field]);
    }
  }
  return next;
}

export function parsePracticeProfileJson(raw: string | null | undefined): PracticeProfile {
  if (!raw?.trim()) {
    return { ...EMPTY_PRACTICE_PROFILE };
  }
  try {
    return normalizePracticeProfile(JSON.parse(raw));
  } catch {
    return { ...EMPTY_PRACTICE_PROFILE };
  }
}

export function serializePracticeProfile(profile: PracticeProfile): string {
  return JSON.stringify(normalizePracticeProfile(profile));
}

export function practiceProfileFromEnv(): PracticeProfile {
  return normalizePracticeProfile({
    displayName: readEnv('PRACTICE_DISPLAY_NAME') || readEnv('VITE_PRACTICE_DISPLAY_NAME'),
    street: readEnv('PRACTICE_ADDRESS') || readEnv('VITE_PRACTICE_ADDRESS'),
    postalCode: readEnv('PRACTICE_POSTAL_CODE'),
    city: readEnv('PRACTICE_CITY'),
    phone: readEnv('PRACTICE_PHONE') || readEnv('VITE_PRACTICE_PHONE'),
    email: readEnv('PRACTICE_EMAIL') || readEnv('VITE_PRACTICE_EMAIL'),
    dataProtectionOfficer: readEnv('PRACTICE_DPO') || readEnv('VITE_PRACTICE_DPO'),
    website: readEnv('PRACTICE_WEBSITE'),
  });
}

export function resolvePracticeProfile(stored: PracticeProfile): PracticeProfile {
  return normalizePracticeProfile(stored);
}
