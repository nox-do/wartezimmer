import { timingSafeEqual } from 'node:crypto';
import { SETUP_MANAGER_TOKEN_ENV } from '@wartezimmer/server-shared';

export function readSetupManagerTokenFromEnv(): string | null {
  const raw = process.env[SETUP_MANAGER_TOKEN_ENV]?.trim();
  return raw || null;
}

export function setupManagerTokensMatch(
  expected: string | null,
  provided: string | undefined,
): boolean {
  if (!expected) {
    return true;
  }
  if (!provided) {
    return false;
  }
  const expectedBuffer = Buffer.from(expected);
  const providedBuffer = Buffer.from(provided);
  if (expectedBuffer.length !== providedBuffer.length) {
    return false;
  }
  return timingSafeEqual(expectedBuffer, providedBuffer);
}
