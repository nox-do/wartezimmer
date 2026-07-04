import { pbkdf2Sync, randomBytes, timingSafeEqual } from 'node:crypto';
import { DEFAULT_ROOM_PANEL_PIN_HASH, DEFAULT_STAFF_PIN_HASH } from '@praxis-flow/server-shared';
import type {
  StaffPinHashConfig,
  StaffRole,
  StaffSessionAuthConfig,
} from './staff-session-types.js';

export {
  DEFAULT_ROOM_PANEL_PIN_HASH,
  DEFAULT_STAFF_PIN,
  DEFAULT_STAFF_PIN_HASH,
} from '@praxis-flow/server-shared';

export const DEFAULT_STAFF_PIN_HASH_MFA = DEFAULT_STAFF_PIN_HASH;
export const DEFAULT_STAFF_PIN_HASH_OPS = DEFAULT_STAFF_PIN_HASH;

const DEFAULT_STAFF_SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const DEFAULT_STAFF_SESSION_IDLE_TTL_MS = 2 * 60 * 60 * 1000;
const PIN_HASH_PARTS = 4;

type ParsedPinHash = {
  algorithm: 'pbkdf2-sha256';
  iterations: number;
  salt: Buffer;
  digest: Buffer;
};

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function parsePinHash(value: string): ParsedPinHash {
  const parts = value.split('$');
  if (parts.length !== PIN_HASH_PARTS || parts[0] !== 'pbkdf2-sha256') {
    throw new Error('STAFF_PIN_HASH_INVALID');
  }

  const iterations = Number.parseInt(parts[1], 10);
  if (!Number.isInteger(iterations) || iterations < 100_000) {
    throw new Error('STAFF_PIN_HASH_INVALID');
  }

  const salt = Buffer.from(parts[2], 'base64url');
  const digest = Buffer.from(parts[3], 'base64url');
  if (salt.length < 16 || digest.length < 32) {
    throw new Error('STAFF_PIN_HASH_INVALID');
  }

  return {
    algorithm: 'pbkdf2-sha256',
    iterations,
    salt,
    digest,
  };
}

/** Initial auth_settings row when the app database is created (PINs live in DB only). */
export function getAuthSettingsSeedConfig(): StaffPinHashConfig {
  const config = {
    pinHashesByRole: {
      mfa: DEFAULT_STAFF_PIN_HASH,
      ops: DEFAULT_STAFF_PIN_HASH,
    } satisfies Record<StaffRole, string>,
    roomPanelPinHash: DEFAULT_ROOM_PANEL_PIN_HASH,
  };
  assertStaffPinHashConfigSafeForStartup(config);
  return config;
}

export function usesDefaultStaffPinHash(hash: string): boolean {
  return hash === DEFAULT_STAFF_PIN_HASH;
}

export function pinConfigUsesDefaultStaffPins(config: StaffPinHashConfig): boolean {
  return (
    usesDefaultStaffPinHash(config.pinHashesByRole.mfa) &&
    usesDefaultStaffPinHash(config.pinHashesByRole.ops)
  );
}

export function assertStaffPinHashConfigSafeForStartup(config: StaffPinHashConfig): void {
  parsePinHash(config.pinHashesByRole.mfa);
  parsePinHash(config.pinHashesByRole.ops);
  parsePinHash(config.roomPanelPinHash);
}

export function getStaffSessionAuthConfig(pinConfig: StaffPinHashConfig): StaffSessionAuthConfig {
  assertStaffPinHashConfigSafeForStartup(pinConfig);
  return {
    ...pinConfig,
    sessionTtlMs: parsePositiveInt(process.env.STAFF_SESSION_TTL_MS, DEFAULT_STAFF_SESSION_TTL_MS),
    sessionIdleTtlMs: parsePositiveInt(
      process.env.STAFF_SESSION_IDLE_TTL_MS,
      DEFAULT_STAFF_SESSION_IDLE_TTL_MS,
    ),
  };
}

export function hashStaffPinForConfig(
  pin: string,
  options?: { iterations?: number; salt?: Buffer },
): string {
  const iterations = options?.iterations ?? 100_000;
  const salt = options?.salt ?? randomBytes(24);
  const digest = pbkdf2Sync(pin, salt, iterations, 32, 'sha256');
  return `pbkdf2-sha256$${iterations}$${salt.toString('base64url')}$${digest.toString('base64url')}`;
}

export function verifyStaffPin(pin: string, storedHash: string): boolean {
  const parsed = parsePinHash(storedHash);
  const candidate = pbkdf2Sync(pin, parsed.salt, parsed.iterations, parsed.digest.length, 'sha256');
  if (candidate.length !== parsed.digest.length) {
    return false;
  }

  return timingSafeEqual(candidate, parsed.digest);
}
