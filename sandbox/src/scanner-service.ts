import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import type { SandboxConfig } from './sandbox-config.js';
import {
  buildFreshclamAttemptMessage,
  readFreshclamAttempt,
  readFreshclamLogTail,
  writeFreshclamAttempt,
  type FreshclamAttemptRecord,
} from './freshclam-state.js';
import { isExecFileFailure } from './type-guards.js';

const execFileAsync = promisify(execFile);

export type ScannerStatus = {
  enabled: boolean;
  engineVersion: string | null;
  definitionsUpdatedAt: string | null;
  definitionsAgeHours: number | null;
  signaturesFreshEnough: boolean;
  ready: boolean;
  freshclamLastAttemptAt: string | null;
  freshclamLastAttemptOk: boolean | null;
  freshclamLastAttemptMessage: string | null;
  freshclamLastAttemptSource: 'startup' | 'manual' | null;
  freshclamLogTail: string | null;
};

export type ScanResult = {
  status: 'clean' | 'blocked_malware' | 'scan_error' | 'source_unavailable';
  scannedAt: string;
};

export type ScannerService = {
  readStatus: () => Promise<ScannerStatus>;
  scanDocumentAtPath: (sourcePath: string) => Promise<ScanResult>;
  updateSignatures: () => Promise<{ stdout: string; stderr: string }>;
};

function emptyFreshclamFields(): Pick<
  ScannerStatus,
  | 'freshclamLastAttemptAt'
  | 'freshclamLastAttemptOk'
  | 'freshclamLastAttemptMessage'
  | 'freshclamLastAttemptSource'
  | 'freshclamLogTail'
> {
  return {
    freshclamLastAttemptAt: null,
    freshclamLastAttemptOk: null,
    freshclamLastAttemptMessage: null,
    freshclamLastAttemptSource: null,
    freshclamLogTail: null,
  };
}

async function freshclamTelemetry(
  scannerDbPath: string,
): Promise<Pick<
  ScannerStatus,
  | 'freshclamLastAttemptAt'
  | 'freshclamLastAttemptOk'
  | 'freshclamLastAttemptMessage'
  | 'freshclamLastAttemptSource'
  | 'freshclamLogTail'
>> {
  const attempt = await readFreshclamAttempt(scannerDbPath);
  const freshclamLogTail = await readFreshclamLogTail();
  if (!attempt) {
    return { ...emptyFreshclamFields(), freshclamLogTail };
  }
  return {
    freshclamLastAttemptAt: attempt.attemptedAt,
    freshclamLastAttemptOk: attempt.ok,
    freshclamLastAttemptMessage: attempt.message,
    freshclamLastAttemptSource: attempt.source,
    freshclamLogTail,
  };
}

export function createScannerService(
  config: Pick<
    SandboxConfig,
    'scanEnabled' | 'scannerDbPath' | 'scanTimeoutMs' | 'maxSignatureAgeHours'
  >,
): ScannerService {
  async function recordAttempt(
    source: FreshclamAttemptRecord['source'],
    exitCode: number | null,
    stdout: string,
    stderr: string,
  ): Promise<void> {
    await writeFreshclamAttempt(config.scannerDbPath, {
      attemptedAt: new Date().toISOString(),
      ok: exitCode === 0,
      exitCode,
      source,
      message: buildFreshclamAttemptMessage(stdout, stderr, exitCode),
    });
  }

  async function readStatus(): Promise<ScannerStatus> {
    const telemetry = await freshclamTelemetry(config.scannerDbPath);

    if (!config.scanEnabled) {
      return {
        enabled: false,
        engineVersion: null,
        definitionsUpdatedAt: null,
        definitionsAgeHours: null,
        signaturesFreshEnough: true,
        ready: true,
        ...telemetry,
      };
    }

    let engineVersion: string;
    try {
      const { stdout } = await execFileAsync('clamscan', ['--version']);
      engineVersion = stdout.trim().split('\n')[0]?.trim() || 'unknown';
    } catch {
      return {
        enabled: true,
        engineVersion: null,
        definitionsUpdatedAt: null,
        definitionsAgeHours: null,
        signaturesFreshEnough: false,
        ready: false,
        ...telemetry,
      };
    }

    const definitionCandidates = [
      'daily.cld',
      'daily.cvd',
      'main.cld',
      'main.cvd',
      'bytecode.cld',
      'bytecode.cvd',
    ];
    const mtimes: number[] = [];
    for (const fileName of definitionCandidates) {
      try {
        const stats = await fs.stat(path.join(config.scannerDbPath, fileName));
        mtimes.push(stats.mtimeMs);
      } catch {
        // ignore missing file; check others
      }
    }

    if (mtimes.length === 0) {
      return {
        enabled: true,
        engineVersion,
        definitionsUpdatedAt: null,
        definitionsAgeHours: null,
        signaturesFreshEnough: false,
        ready: false,
        ...telemetry,
      };
    }

    const newest = Math.max(...mtimes);
    const definitionsUpdatedAt = new Date(newest).toISOString();
    const definitionsAgeHours = Math.max(0, (Date.now() - newest) / (1000 * 60 * 60));
    const signaturesFreshEnough = definitionsAgeHours <= config.maxSignatureAgeHours;
    return {
      enabled: true,
      engineVersion,
      definitionsUpdatedAt,
      definitionsAgeHours,
      signaturesFreshEnough,
      ready: signaturesFreshEnough,
      ...telemetry,
    };
  }

  async function scanDocumentAtPath(sourcePath: string): Promise<ScanResult> {
    const scannedAt = new Date().toISOString();
    if (!config.scanEnabled) {
      return { status: 'clean', scannedAt };
    }

    try {
      await execFileAsync('clamscan', ['--no-summary', '--infected', sourcePath], {
        timeout: config.scanTimeoutMs,
      });
      return { status: 'clean', scannedAt };
    } catch (error) {
      if (isExecFileFailure(error) && error.code === 1) {
        return { status: 'blocked_malware', scannedAt };
      }
      return { status: 'scan_error', scannedAt };
    }
  }

  async function updateSignatures(): Promise<{ stdout: string; stderr: string }> {
    try {
      const result = await execFileAsync('freshclam', []);
      await recordAttempt('manual', 0, result.stdout, result.stderr);
      return result;
    } catch (error) {
      if (isExecFileFailure(error)) {
        const exitCode = typeof error.code === 'number' ? error.code : 1;
        await recordAttempt('manual', exitCode, error.stdout ?? '', error.stderr ?? '');
      } else {
        await recordAttempt('manual', 1, '', error instanceof Error ? error.message : '');
      }
      throw error;
    }
  }

  return {
    readStatus,
    scanDocumentAtPath,
    updateSignatures,
  };
}
