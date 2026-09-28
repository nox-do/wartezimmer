import { cleanSignatureUpdateResidue } from './signature-cache.js';
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
  freshclamLastAttemptSource: 'startup' | 'manual' | 'scheduled' | null;
  lastSuccessfulCheckAt?: string | null;
  checkAgeHours?: number | null;
  updateWarning?: boolean;
  freshclamLogTail: string | null;
};

export type ScanResult = {
  status: 'clean' | 'blocked_malware' | 'scan_error' | 'source_unavailable';
  scannedAt: string;
};

export type ScannerService = {
  readStatus: () => Promise<ScannerStatus>;
  scanDocumentAtPath: (sourcePath: string) => Promise<ScanResult>;
  updateSignatures: (
    source?: FreshclamAttemptRecord['source'],
  ) => Promise<{ stdout: string; stderr: string }>;
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
): Promise<
  Pick<
    ScannerStatus,
    | 'freshclamLastAttemptAt'
    | 'freshclamLastAttemptOk'
    | 'freshclamLastAttemptMessage'
    | 'freshclamLastAttemptSource'
    | 'freshclamLogTail'
  >
> {
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
  run: typeof execFileAsync = execFileAsync,
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
      const { stdout } = await run('clamscan', ['--database', config.scannerDbPath, '--version'], {
        timeout: config.scanTimeoutMs,
        maxBuffer: 64 * 1024,
      });
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

    const attempt = await readFreshclamAttempt(config.scannerDbPath);
    const lastSuccessfulCheckAt = attempt?.lastSuccessfulCheckAt ?? null;
    const checkedAt = lastSuccessfulCheckAt ? Date.parse(lastSuccessfulCheckAt) : NaN;
    const checkAgeHours =
      Number.isFinite(checkedAt) && checkedAt <= Date.now()
        ? (Date.now() - checkedAt) / 3_600_000
        : null;
    // A recent successful check is not enough if the databases have disappeared.
    const hasDatabase = async (name: string) => {
      for (const extension of ['cld', 'cvd']) {
        try {
          const stat = await fs.stat(path.join(config.scannerDbPath, `${name}.${extension}`));
          if (stat.isFile() && stat.size > 0) return true;
        } catch {
          /* Missing database is handled by the readiness gate. */
        }
      }
      return false;
    };
    const databasesPresent = (await hasDatabase('daily')) && (await hasDatabase('main'));
    const signaturesFreshEnough =
      databasesPresent && checkAgeHours !== null && checkAgeHours < config.maxSignatureAgeHours;
    return {
      enabled: true,
      engineVersion,
      // Kept for older clients; these now describe the confirmed currency, not file mtime.
      definitionsUpdatedAt: lastSuccessfulCheckAt,
      definitionsAgeHours: checkAgeHours,
      lastSuccessfulCheckAt,
      checkAgeHours,
      updateWarning: checkAgeHours === null || checkAgeHours >= 24,
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
      if (!(await readStatus()).ready) return { status: 'scan_error', scannedAt };
      await run(
        'clamscan',
        ['--database', config.scannerDbPath, '--no-summary', '--infected', sourcePath],
        {
          timeout: config.scanTimeoutMs,
        },
      );
      return { status: 'clean', scannedAt };
    } catch (error) {
      if (isExecFileFailure(error) && error.code === 1) {
        return { status: 'blocked_malware', scannedAt };
      }
      return { status: 'scan_error', scannedAt };
    }
  }

  let updating: Promise<{ stdout: string; stderr: string }> | null = null;
  async function performUpdate(
    source: FreshclamAttemptRecord['source'],
  ): Promise<{ stdout: string; stderr: string }> {
    try {
      await cleanSignatureUpdateResidue(config.scannerDbPath);
      const result = await run('freshclam', ['--datadir', config.scannerDbPath], {
        timeout: 300_000,
        maxBuffer: 256 * 1024,
      });
      await recordAttempt(source, 0, result.stdout, result.stderr);
      return result;
    } catch (error) {
      if (isExecFileFailure(error)) {
        const exitCode = typeof error.code === 'number' ? error.code : 1;
        await recordAttempt(source, exitCode, error.stdout ?? '', error.stderr ?? '');
      } else {
        await recordAttempt(source, 1, '', error instanceof Error ? error.message : '');
      }
      throw error;
    }
  }

  function updateSignatures(source: FreshclamAttemptRecord['source'] = 'manual') {
    updating ??= performUpdate(source).finally(() => {
      updating = null;
    });
    return updating;
  }

  return {
    readStatus,
    scanDocumentAtPath,
    updateSignatures,
  };
}
