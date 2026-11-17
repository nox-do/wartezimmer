import { createModuleLogger } from './logger.js';
import { SetupApiValidationError } from './setup-api-normalize.js';
import fs from 'node:fs';
import path from 'node:path';
import type { PortCheckReport } from '@wartezimmer/server-shared/setup-api';
import { durableWrite } from './restricted-operation.js';

const logger = createModuleLogger('setup.port-check');
const validId = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
function directory(home: string) {
  return path.join(home, 'state', 'port-checks');
}
export function storePortFailure(home: string, report: PortCheckReport) {
  if (!report.error || !validId.test(report.id)) return;
  durableWrite(path.join(directory(home), report.id + '.json'), JSON.stringify(report), 0o600);
}
export function unreadPortFailures(home: string): PortCheckReport[] {
  const folder = directory(home);
  if (!fs.existsSync(folder)) return [];
  return fs
    .readdirSync(folder)
    .filter((f) => f.endsWith('.json') && validId.test(f.slice(0, -5)))
    .map((f) => JSON.parse(fs.readFileSync(path.join(folder, f), 'utf8')) as PortCheckReport)
    .sort((a, b) => a.at.localeCompare(b.at));
}
export function acknowledgePortFailures(home: string, ids: unknown) {
  if (!Array.isArray(ids) || !ids.every((id) => typeof id === 'string' && validId.test(id)))
    throw new SetupApiValidationError('Ungültige Befund-ID.');
  for (const id of ids) fs.rmSync(path.join(directory(home), id + '.json'), { force: true });
}
export function trackPortRecovery(home: string, errors: string[]): (ok: boolean) => void {
  let report: PortCheckReport | undefined;
  try {
    report = unreadPortFailures(home)
      .reverse()
      .find(
        (r) =>
          !r.recovery &&
          errors.some(
            (error) =>
              (r.error?.detail && error.includes(r.error.detail)) ||
              (r.error?.message && error.includes(r.error.message)),
          ),
      );
  } catch (error) {
    logger.error({ err: error }, 'Portbefund für den Wiederanlauf konnte nicht gelesen werden');
  }
  return (ok) => {
    if (!report) return;
    try {
      if (fs.existsSync(path.join(directory(home), report.id + '.json')))
        storePortFailure(home, { ...report, recovery: ok ? 'restored' : 'failed' });
    } catch (error) {
      logger.error(
        { err: error },
        'Wiederanlaufergebnis konnte nicht im Portbefund gespeichert werden',
      );
    }
  };
}
