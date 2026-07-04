import { spawn } from 'node:child_process';
import {
  buildFreshclamAttemptMessage,
  writeFreshclamAttempt,
} from './freshclam-state.js';
import { logSandboxInfo, logSandboxWarn, truncateLogTail } from './sandbox-log.js';

function isEnabled(name: string, fallback: boolean): boolean {
  const raw = process.env[name]?.trim();
  if (raw == null || raw.length === 0) {
    return fallback;
  }
  return raw === 'true';
}

const scanEnabled = isEnabled('SANDBOX_SCAN_ENABLED', true);
const autoUpdateOnStart = isEnabled('CLAMAV_AUTO_UPDATE_ON_START', true);
const scannerDbPath = process.env.CLAMAV_DB_PATH?.trim() || '/var/lib/clamav';

if (scanEnabled && autoUpdateOnStart) {
  const attemptedAt = new Date().toISOString();
  logSandboxInfo('running freshclam update on start');
  const updater = spawn('freshclam', [], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let stdoutTail = '';
  let stderrTail = '';
  updater.stdout?.on('data', (chunk: Buffer | string) => {
    stdoutTail = `${stdoutTail}${chunk.toString()}`.slice(-4000);
  });
  updater.stderr?.on('data', (chunk: Buffer | string) => {
    stderrTail = `${stderrTail}${chunk.toString()}`.slice(-4000);
  });
  updater.on('error', () => {
    logSandboxWarn('freshclam update failed to start; scanner may be degraded');
    void writeFreshclamAttempt(scannerDbPath, {
      attemptedAt,
      ok: false,
      exitCode: null,
      source: 'startup',
      message: 'freshclam konnte nicht gestartet werden',
    }).catch(() => {
      // best effort before server boot
    });
  });
  updater.on('exit', (code) => {
    const exitCode = code ?? 1;
    const message = buildFreshclamAttemptMessage(stdoutTail, stderrTail, exitCode);
    void writeFreshclamAttempt(scannerDbPath, {
      attemptedAt,
      ok: exitCode === 0,
      exitCode,
      source: 'startup',
      message,
    }).catch(() => {
      // best effort
    });
    if (code !== 0) {
      logSandboxWarn('freshclam update exited with error; scanner may be degraded', {
        exitCode,
        stderrTail: truncateLogTail(stderrTail),
      });
    }
  });
}

await import('./server.js');
