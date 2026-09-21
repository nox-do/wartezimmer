import {
  FRESHCLAM_LOG_PATH,
  resolveMaxSignatureAgeHours as resolveMaxSignatureAgeHoursFromRaw,
  type SandboxScannerStatus,
} from '@praxis-flow/server-shared';
import { runDockerCommand } from './docker-cli.js';

const FRESHCLAM_STATE_PATH = '/var/lib/clamav/freshclam-last-attempt.json';
const EMPTY_FRESHCLAM_LOG = '(keine ClamAV-Logs)';
export const SANDBOX_CLAMAV_LOG_HEADER = '--- ClamAV (Signaturen) ---';

export type { SandboxScannerStatus };

type ReadyHealthBody = {
  status?: string;
  scanner?: {
    enabled?: boolean;
    ready?: boolean;
    signaturesFreshEnough?: boolean;
    definitionsUpdatedAt?: string | null;
    definitionsAgeHours?: number | null;
    engineVersion?: string | null;
    freshclamLastAttemptAt?: string | null;
    freshclamLastAttemptOk?: boolean | null;
    freshclamLastAttemptMessage?: string | null;
    freshclamLastAttemptSource?: string | null;
    freshclamLogTail?: string | null;
  };
};

export function resolveMaxSignatureAgeHours(envMap: Map<string, string>): number {
  return resolveMaxSignatureAgeHoursFromRaw(envMap.get('CLAMAV_MAX_SIGNATURE_AGE_HOURS'));
}

export function parseSandboxScannerStatus(
  body: unknown,
  maxSignatureAgeHours: number,
): SandboxScannerStatus | null {
  if (!body || typeof body !== 'object') {
    return null;
  }
  const scanner = (body as ReadyHealthBody).scanner;
  if (!scanner || typeof scanner !== 'object') {
    return null;
  }

  const definitionsAgeHours =
    typeof scanner.definitionsAgeHours === 'number' && Number.isFinite(scanner.definitionsAgeHours)
      ? scanner.definitionsAgeHours
      : null;

  const healthStatus =
    (body as ReadyHealthBody).status === 'ready'
      ? 'ready'
      : (body as ReadyHealthBody).status === 'degraded'
        ? 'degraded'
        : null;

  return {
    enabled: Boolean(scanner.enabled),
    ready: Boolean(scanner.ready),
    signaturesFreshEnough: Boolean(scanner.signaturesFreshEnough),
    definitionsUpdatedAt:
      typeof scanner.definitionsUpdatedAt === 'string' ? scanner.definitionsUpdatedAt : null,
    definitionsAgeHours,
    maxSignatureAgeHours,
    engineVersion: typeof scanner.engineVersion === 'string' ? scanner.engineVersion : null,
    healthStatus,
    freshclamLastAttemptAt:
      typeof scanner.freshclamLastAttemptAt === 'string' ? scanner.freshclamLastAttemptAt : null,
    freshclamLastAttemptOk:
      typeof scanner.freshclamLastAttemptOk === 'boolean' ? scanner.freshclamLastAttemptOk : null,
    freshclamLastAttemptMessage:
      typeof scanner.freshclamLastAttemptMessage === 'string'
        ? scanner.freshclamLastAttemptMessage
        : null,
    freshclamLastAttemptSource:
      scanner.freshclamLastAttemptSource === 'manual'
        ? 'manual'
        : scanner.freshclamLastAttemptSource === 'startup'
          ? 'startup'
          : null,
    freshclamLogTail:
      typeof scanner.freshclamLogTail === 'string' ? scanner.freshclamLogTail : null,
  };
}

type FreshclamAttemptPayload = {
  attemptedAt?: string;
  ok?: boolean;
  exitCode?: number | null;
  source?: string;
  message?: string | null;
};

function isEmptyFreshclamLog(text: string): boolean {
  const trimmed = text.trim();
  return trimmed.length === 0 || trimmed === EMPTY_FRESHCLAM_LOG;
}

export function formatFreshclamAttemptLog(raw: string): string | null {
  try {
    const parsed = JSON.parse(raw) as FreshclamAttemptPayload;
    const lines: string[] = [];
    if (typeof parsed.attemptedAt === 'string') {
      lines.push(`Letzter Versuch: ${parsed.attemptedAt}`);
    }
    if (parsed.source === 'manual' || parsed.source === 'startup') {
      lines.push(`Quelle: ${parsed.source === 'manual' ? 'manuell' : 'beim Start'}`);
    }
    if (typeof parsed.exitCode === 'number') {
      lines.push(`Exit-Code: ${parsed.exitCode}`);
    }
    if (typeof parsed.ok === 'boolean') {
      lines.push(`Ergebnis: ${parsed.ok ? 'erfolgreich' : 'fehlgeschlagen'}`);
    }
    if (typeof parsed.message === 'string' && parsed.message.trim().length > 0) {
      if (lines.length > 0) {
        lines.push('');
      }
      lines.push(parsed.message.trim());
    }
    return lines.length > 0 ? lines.join('\n') : null;
  } catch {
    return null;
  }
}

export function mergeSandboxWithClamAvLogs(composeLog: string, clamavLog: string): string {
  const base = composeLog.trimEnd();
  const section = `${SANDBOX_CLAMAV_LOG_HEADER}\n${clamavLog.trim()}`;
  return base ? `${base}\n\n${section}` : section;
}

export async function appendSandboxClamAvLogSection(
  composeLog: string,
  containerName: string,
  tail = 200,
): Promise<string> {
  const clamav = await fetchSandboxFreshclamLog(containerName, tail);
  const section = clamav.ok ? clamav.log : `(ClamAV-Log nicht lesbar: ${clamav.log})`;
  return mergeSandboxWithClamAvLogs(composeLog, section);
}

export async function fetchSandboxFreshclamLog(
  containerName: string,
  tail = 200,
): Promise<{ ok: boolean; log: string }> {
  const result = await runDockerCommand([
    'exec',
    containerName,
    'sh',
    '-c',
    `tail -n ${Math.max(1, Math.min(tail, 2000))} ${FRESHCLAM_LOG_PATH} 2>/dev/null || echo '${EMPTY_FRESHCLAM_LOG}'`,
  ]);
  if (result.code !== 0) {
    return { ok: false, log: result.stderr || result.stdout || 'freshclam-Log nicht lesbar' };
  }
  if (!isEmptyFreshclamLog(result.stdout)) {
    return { ok: true, log: result.stdout };
  }

  const attempt = await runDockerCommand(['exec', containerName, 'cat', FRESHCLAM_STATE_PATH]);
  if (attempt.code === 0 && attempt.stdout) {
    const formatted = formatFreshclamAttemptLog(attempt.stdout);
    if (formatted) {
      return { ok: true, log: formatted };
    }
  }

  return { ok: true, log: EMPTY_FRESHCLAM_LOG };
}

export async function fetchSandboxScannerStatus(
  maxSignatureAgeHours: number,
  containerName: string,
): Promise<SandboxScannerStatus | null> {
  const result = await runDockerCommand([
    'exec',
    containerName,
    'wget',
    '-qO-',
    'http://127.0.0.1:8081/internal/health/ready',
  ]);
  if (result.code !== 0) {
    return null;
  }

  try {
    return parseSandboxScannerStatus(JSON.parse(result.stdout), maxSignatureAgeHours);
  } catch {
    return null;
  }
}
