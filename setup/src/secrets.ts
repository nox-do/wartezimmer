import { randomBytes } from 'node:crypto';

export function generateToken(byteLength = 24): string {
  return randomBytes(byteLength).toString('base64url');
}

export type GeneratedSecrets = {
  AUTH_KEY_CAPTIVE: string;
  SANDBOX_INTERNAL_TOKEN: string;
  OPENNDS_FAS_KEY: string;
};

export const SECRET_ENV_KEYS = [
  'AUTH_KEY_CAPTIVE',
  'SANDBOX_INTERNAL_TOKEN',
  'OPENNDS_FAS_KEY',
] as const satisfies readonly (keyof GeneratedSecrets)[];

const WEAK_SECRET_VALUES = new Set(['change-me', 'change-me-captive-key']);

function generateOneSecret(key: keyof GeneratedSecrets): string {
  return key === 'OPENNDS_FAS_KEY' ? generateToken(32) : generateToken();
}

export function isWeakGeneratedSecret(key: keyof GeneratedSecrets, value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) {
    return true;
  }
  if (WEAK_SECRET_VALUES.has(trimmed) || trimmed.startsWith('change-me')) {
    return true;
  }
  return key !== 'OPENNDS_FAS_KEY' && trimmed.length < 32;
}

/** Keep existing .env secrets when preserve=true; fill missing keys always. */
export function resolveSecretsForEnv(
  existing: Map<string, string>,
  options: { preserve: boolean },
): {
  secrets: GeneratedSecrets;
  generated: (keyof GeneratedSecrets)[];
  kept: (keyof GeneratedSecrets)[];
} {
  const generated: (keyof GeneratedSecrets)[] = [];
  const kept: (keyof GeneratedSecrets)[] = [];
  const secrets = {} as GeneratedSecrets;

  for (const key of SECRET_ENV_KEYS) {
    const current = existing.get(key)?.trim() ?? '';
    if (options.preserve && !isWeakGeneratedSecret(key, current)) {
      secrets[key] = current;
      kept.push(key);
    } else {
      secrets[key] = generateOneSecret(key);
      generated.push(key);
    }
  }

  return { secrets, generated, kept };
}
