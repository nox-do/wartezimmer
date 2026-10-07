import { FRESHCLAM_LOG_PATH } from '@wartezimmer/server-shared';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { truncateLogTail } from './sandbox-log.js';

export const FRESHCLAM_STATE_FILE = 'freshclam-last-attempt.json';
export { FRESHCLAM_LOG_PATH };

export type FreshclamAttemptRecord = {
  attemptedAt: string;
  ok: boolean;
  exitCode: number | null;
  source: 'startup' | 'manual' | 'scheduled';
  lastSuccessfulCheckAt?: string | null;
  message: string | null;
};

function stateFilePath(scannerDbPath: string): string {
  return path.join(scannerDbPath, FRESHCLAM_STATE_FILE);
}

export function buildFreshclamAttemptMessage(
  stdout: string,
  stderr: string,
  exitCode: number | null,
): string | null {
  const combined = `${stdout}\n${stderr}`.trim();
  if (combined.length > 0) {
    return truncateLogTail(combined, 800);
  }
  if (exitCode === 0) {
    return 'Update erfolgreich';
  }
  if (exitCode !== null) {
    return `freshclam Exit ${exitCode}`;
  }
  return null;
}

export async function readFreshclamAttempt(
  scannerDbPath: string,
): Promise<FreshclamAttemptRecord | null> {
  try {
    const raw = await fs.readFile(stateFilePath(scannerDbPath), 'utf8');
    const parsed = JSON.parse(raw) as Partial<FreshclamAttemptRecord>;
    if (typeof parsed.attemptedAt !== 'string') {
      return null;
    }
    return {
      attemptedAt: parsed.attemptedAt,
      ok: parsed.ok === true,
      exitCode: typeof parsed.exitCode === 'number' ? parsed.exitCode : null,
      source:
        parsed.source === 'manual' || parsed.source === 'scheduled' ? parsed.source : 'startup',
      lastSuccessfulCheckAt:
        typeof parsed.lastSuccessfulCheckAt === 'string'
          ? parsed.lastSuccessfulCheckAt
          : parsed.ok === true
            ? parsed.attemptedAt
            : null,
      message: typeof parsed.message === 'string' ? parsed.message : null,
    };
  } catch {
    return null;
  }
}

export async function writeFreshclamAttempt(
  scannerDbPath: string,
  record: FreshclamAttemptRecord,
): Promise<void> {
  await fs.mkdir(scannerDbPath, { recursive: true });
  const previous = await readFreshclamAttempt(scannerDbPath);
  const next = {
    ...record,
    lastSuccessfulCheckAt: record.ok
      ? record.attemptedAt
      : (previous?.lastSuccessfulCheckAt ?? null),
  };
  const target = stateFilePath(scannerDbPath);
  await fs.writeFile(`${target}.tmp`, `${JSON.stringify(next)}\n`, 'utf8');
  await fs.rename(`${target}.tmp`, target);
}

export async function readFreshclamLogTail(
  logPath = FRESHCLAM_LOG_PATH,
  maxLength = 800,
): Promise<string | null> {
  try {
    const raw = await fs.readFile(logPath, 'utf8');
    const trimmed = raw.trim();
    if (trimmed.length === 0) {
      return null;
    }
    return truncateLogTail(trimmed, maxLength);
  } catch {
    return null;
  }
}
