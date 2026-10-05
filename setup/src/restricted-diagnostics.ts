import { resolveSetupBuildId } from './setup-build-id.js';
import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const context = new AsyncLocalStorage<{ home: string; id: string }>();
const MAX_BYTES = 2 * 1024 * 1024;

/** Callers supply selected technical fields only, never env, credentials or HTTP bodies. */
export function restrictedDiagnostic(event: string, data: Record<string, unknown>): void {
  const current = context.getStore();
  if (!current) return;
  try {
    const directory = path.join(current.home, 'logs');
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    const file = path.join(directory, 'restricted-beta.jsonl');
    const line = JSON.stringify({ time: new Date().toISOString(), id: current.id, event, ...data });
    if (Buffer.byteLength(line) > MAX_BYTES) return;
    if (fs.existsSync(file) && fs.statSync(file).size + Buffer.byteLength(line) + 1 > MAX_BYTES) {
      fs.rmSync(`${file}.1`, { force: true });
      fs.renameSync(file, `${file}.1`);
    }
    fs.appendFileSync(file, `${line}\n`, { mode: 0o600 });
  } catch {
    // Diagnostics must never change apply/rollback behavior, including on full disks.
    console.error('Restricted-Beta: Diagnoseprotokoll konnte nicht geschrieben werden.');
  }
}

export function withRestrictedDiagnostics<T>(
  home: string,
  action: string,
  run: () => Promise<T>,
): Promise<T> {
  if (context.getStore()?.home === home) return run();
  return context.run({ home, id: randomUUID() }, async () => {
    const started = Date.now();
    restrictedDiagnostic('operation.begin', {
      action,
      buildId: resolveSetupBuildId(),
      platform: process.platform,
      arch: process.arch,
      osRelease: os.release(),
      node: process.versions.node,
      electron: process.versions.electron ?? null,
    });
    try {
      const result = await run();
      restrictedDiagnostic('operation.end', {
        action,
        completion: 'returned',
        ok:
          result !== null &&
          typeof result === 'object' &&
          'ok' in result &&
          typeof result.ok === 'boolean'
            ? result.ok
            : null,
        durationMs: Date.now() - started,
      });
      return result;
    } catch (error) {
      restrictedDiagnostic('operation.end', {
        action,
        completion: 'threw',
        ok: false,
        durationMs: Date.now() - started,
        errorName: error instanceof Error ? error.name : 'UnknownError',
        code: error && typeof error === 'object' && 'code' in error ? error.code : null,
      });
      throw error;
    }
  });
}
