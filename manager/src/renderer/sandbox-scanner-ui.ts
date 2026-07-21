import type { SandboxScannerStatus } from '../shared/host-status.js';

export type SandboxScannerLevel = 'ok' | 'warn' | 'bad' | 'neutral' | 'unknown';

export type SandboxClamAvChip = {
  label: string;
  ok: boolean | null;
  neutral?: boolean;
  warn?: boolean;
};

/**
 * ClamAV chip for the Sandbox health tile.
 *
 * Red only when the engine does not run (`not started`). Update/signature
 * problems are yellow — the binary is always in our sandbox image.
 *
 * Priority: not started → update failed → Signatures missing → outdated → ok.
 * "Signatures missing" is usually the result of a failed update; prefer
 * "update failed" when freshclamLastAttemptOk is false.
 */
export function sandboxScannerLevel(
  scanner: SandboxScannerStatus | null | undefined,
): SandboxScannerLevel {
  if (!scanner) {
    return 'unknown';
  }
  if (!scanner.enabled) {
    return 'neutral';
  }
  if (!scanner.engineVersion) {
    return 'bad';
  }
  if (scanner.freshclamLastAttemptOk === false) {
    return 'warn';
  }
  if (scanner.definitionsAgeHours == null) {
    return 'warn';
  }
  if (!scanner.signaturesFreshEnough) {
    return 'warn';
  }
  return 'ok';
}

export function sandboxClamAvChip(
  scanner: SandboxScannerStatus | null | undefined,
): SandboxClamAvChip | null {
  if (!scanner) {
    return { label: 'ClamAV', ok: null };
  }
  if (!scanner.enabled) {
    return { label: 'Scanner aus', ok: null, neutral: true };
  }
  if (!scanner.engineVersion) {
    return { label: 'not started', ok: false };
  }
  if (scanner.freshclamLastAttemptOk === false) {
    return { label: 'update failed', ok: false, warn: true };
  }
  if (scanner.definitionsAgeHours == null) {
    return { label: 'Signatures missing', ok: false, warn: true };
  }
  if (!scanner.signaturesFreshEnough) {
    return { label: 'outdated', ok: false, warn: true };
  }
  return { label: 'ClamAV', ok: true };
}
