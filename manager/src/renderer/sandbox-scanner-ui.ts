import type { ComposeServiceStatus, SandboxScannerStatus } from '../shared/host-status.js';

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

export function sandboxScannerReachability(
  scanner: SandboxScannerStatus | null | undefined,
): 'ok' | 'warn' | 'bad' | null {
  const level = sandboxScannerLevel(scanner);
  if (level === 'unknown' || level === 'neutral' || level === 'ok') {
    return null;
  }
  return level;
}

export function sandboxComposeHealthLabel(
  composeHealth: string | null,
  scanner: SandboxScannerStatus | null | undefined,
): string | null {
  if (!composeHealth) {
    return null;
  }
  const level = sandboxScannerLevel(scanner);
  if (level === 'bad') {
    return 'unhealthy';
  }
  if (level === 'warn') {
    return 'degraded';
  }
  return composeHealth;
}

export function aggregatedServiceStateLabel(
  service: ComposeServiceStatus,
  scanner: SandboxScannerStatus | null | undefined,
): string {
  const parts = [service.state];
  const serviceName = service.service || service.name;
  const health =
    serviceName === 'sandbox' ? sandboxComposeHealthLabel(service.health, scanner) : service.health;
  if (health) {
    parts.push(health);
  }
  return parts.join(' — ');
}

function formatSignatureAge(hours: number): string {
  if (hours < 1) {
    return `vor ${Math.max(1, Math.round(hours * 60))} Min.`;
  }
  if (hours < 48) {
    return `vor ${Math.round(hours)} Std.`;
  }
  return `vor ${Math.round(hours / 24)} Tagen`;
}

function formatAttemptAge(iso: string): string {
  const ms = Date.now() - Date.parse(iso);
  if (!Number.isFinite(ms) || ms < 0) {
    return 'unbekannt';
  }
  const hours = ms / (1000 * 60 * 60);
  if (hours < 1) {
    return `vor ${Math.max(1, Math.round(hours * 60))} Min.`;
  }
  if (hours < 48) {
    return `vor ${Math.round(hours)} Std.`;
  }
  return `vor ${Math.round(hours / 24)} Tagen`;
}

function summarizeFreshclamAttempt(scanner: SandboxScannerStatus): string | null {
  if (!scanner.freshclamLastAttemptAt) {
    return null;
  }
  const when = formatAttemptAge(scanner.freshclamLastAttemptAt);
  const source = scanner.freshclamLastAttemptSource === 'manual' ? 'manuell' : 'beim Start';
  if (scanner.freshclamLastAttemptOk) {
    return `Letzter freshclam-Versuch ${when} (${source})`;
  }
  return `Letzter freshclam-Versuch ${when} (${source}) fehlgeschlagen`;
}

export function formatSandboxScannerDetail(
  scanner: SandboxScannerStatus | null | undefined,
): string | null {
  if (!scanner) {
    return null;
  }
  if (!scanner.enabled) {
    return 'Scanner deaktiviert';
  }

  let base: string;
  if (scanner.definitionsAgeHours == null) {
    base = scanner.engineVersion ? 'Virendefinitionen fehlen' : 'ClamAV nicht verfügbar';
  } else {
    const age = formatSignatureAge(scanner.definitionsAgeHours);
    base = scanner.signaturesFreshEnough
      ? `ClamAV aktuell (${age})`
      : `ClamAV veraltet (${age}, max. ${scanner.maxSignatureAgeHours} Std.)`;
  }

  const attempt = summarizeFreshclamAttempt(scanner);
  return attempt ? `${base} · ${attempt}` : base;
}

export function sandboxClamAvChip(
  scanner: SandboxScannerStatus | null | undefined,
): { label: string; ok: boolean | null; neutral?: boolean } | null {
  const level = sandboxScannerLevel(scanner);
  if (level === 'unknown') {
    return { label: 'ClamAV', ok: null };
  }
  if (level === 'neutral') {
    return { label: 'Scanner aus', ok: null, neutral: true };
  }
  return { label: 'ClamAV', ok: level === 'ok' };
}
