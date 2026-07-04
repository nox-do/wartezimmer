import type { StatementSync } from 'node:sqlite';
import type { OpsSettings } from './db-types.js';
import { configuredExportBasePath } from './database-config.js';
import { getBusinessDay, nowIso } from './database-time.js';

export type EmitOutboxEventFn = (
  eventType: string,
  aggregateId: string,
  payload: Record<string, unknown>,
) => void;

export type DatabaseCommonHelpers = {
  nowIso: typeof nowIso;
  getBusinessDay: typeof getBusinessDay;
  getOpsSettings: () => OpsSettings;
  emitOutboxEvent: EmitOutboxEventFn;
};

export function buildDatabaseCommonHelpers(ctx: {
  getOpsSettings: () => OpsSettings;
  emitOutboxEvent: EmitOutboxEventFn;
}): DatabaseCommonHelpers {
  return {
    nowIso,
    getBusinessDay,
    getOpsSettings: ctx.getOpsSettings,
    emitOutboxEvent: ctx.emitOutboxEvent,
  };
}

export function buildOpsSettingsReadParams(getOpsSettingsStmt: StatementSync) {
  return {
    getOpsSettingsStmt,
    configuredExportBasePath: configuredExportBasePath(),
  };
}

export function buildOpsSettingsWriteParams(
  getOpsSettingsStmt: StatementSync,
  updateOpsSettingsStmt: StatementSync,
) {
  return {
    ...buildOpsSettingsReadParams(getOpsSettingsStmt),
    updateOpsSettingsStmt,
    nowIso,
  };
}
