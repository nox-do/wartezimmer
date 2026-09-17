import type { SandboxScannerStatus } from '../shared/host-status.js';

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

export function sandboxSignatureAgeNotice(
  scanner: SandboxScannerStatus | null | undefined,
): string | null {
  if (
    !scanner?.enabled ||
    !scanner.engineVersion ||
    scanner.freshclamLastAttemptOk === false ||
    scanner.signaturesFreshEnough ||
    scanner.definitionsAgeHours == null ||
    !Number.isFinite(scanner.definitionsAgeHours)
  )
    return null;

  const hours = (value: number) => value.toLocaleString('de-DE', { maximumFractionDigits: 1 });
  const message = `Virensignaturen älter als vorgesehen: ${hours(scanner.definitionsAgeHours)} Stunden (Grenzwert: ${hours(scanner.maxSignatureAgeHours)} Stunden).`;
  const attempt = scanner.freshclamLastAttemptAt ? new Date(scanner.freshclamLastAttemptAt) : null;
  if (!attempt || !Number.isFinite(attempt.getTime())) return message;
  const timestamp = attempt.toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' });
  return `${message} Letzter Updatecheck: ${timestamp} Uhr${scanner.freshclamLastAttemptOk === true ? ' – erfolgreich' : ''}.`;
}
