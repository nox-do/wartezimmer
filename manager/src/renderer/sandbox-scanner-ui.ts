import type { SandboxScannerStatus } from '../shared/host-status.js';

export type SandboxScannerLevel = 'ok' | 'warn' | 'bad' | 'neutral' | 'unknown';

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
  if (scanner.definitionsAgeHours == null) {
    return 'bad';
  }
  if (!scanner.signaturesFreshEnough) {
    return 'warn';
  }
  return 'ok';
}

export function sandboxClamAvChip(
  scanner: SandboxScannerStatus | null | undefined,
): { label: string; ok: boolean | null; neutral?: boolean; warn?: boolean } | null {
  const level = sandboxScannerLevel(scanner);
  if (level === 'unknown') {
    return { label: 'ClamAV', ok: null };
  }
  if (level === 'neutral') {
    return { label: 'Scanner aus', ok: null, neutral: true };
  }
  if (level === 'warn') {
    // Outdated definitions: still operational, but not fully healthy.
    return { label: 'ClamAV', ok: false, warn: true };
  }
  return { label: 'ClamAV', ok: level === 'ok' };
}
