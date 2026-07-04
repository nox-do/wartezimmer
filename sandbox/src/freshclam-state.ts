import { FRESHCLAM_LOG_PATH } from '@praxis-flow/server-shared';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { truncateLogTail } from './sandbox-log.js';

export const FRESHCLAM_STATE_FILE = 'freshclam-last-attempt.json';
export { FRESHCLAM_LOG_PATH };

export type FreshclamAttemptRecord = {
  attemptedAt: string;
  ok: boolean;
  exitCode: number | null;
  source: 'startup' | 'manual';
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
      ok: Boolean(parsed.ok),
      exitCode: typeof parsed.exitCode === 'number' ? parsed.exitCode : null,
      source: parsed.source === 'manual' ? 'manual' : 'startup',
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
  await fs.writeFile(stateFilePath(scannerDbPath), `${JSON.stringify(record)}\n`, 'utf8');
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
