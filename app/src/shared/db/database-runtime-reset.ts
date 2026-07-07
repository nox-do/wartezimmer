import type { StatementSync } from 'node:sqlite';
import { isMessagingProviderId } from '../messaging/provider-registry.js';
import type { DayClosePhase, OpsSettings } from './db-types.js';
import { getEmergencyStateFromDb, type EmergencyDeps } from './database-emergency.js';
import {
  getOpsSettingsFromDb,
  updateOpsSettingsInDb,
  type OpsSettingsPatch,
} from './database-ops-settings.js';
import { updateMessagingProviderConfigInDb, type MessagingDeps } from './database-messaging.js';
import { executeResetKernel } from './database-reset-kernel.js';

type MessagingSnapshotRow = {
  providerId: string;
  enabled: boolean;
  credentials: Record<string, string>;
};

type RuntimeResetStatements = {
  countAllVisitsStmt: StatementSync;
  countAllOutboxEventsStmt: StatementSync;
  deleteAllOutboxEventsStmt: StatementSync;
  clearEmergencyStateStmt: StatementSync;
  updateCheckinLockStmt: StatementSync;
  updateDayClosePhaseStmt: StatementSync;
  updateLastResetBusinessDayStmt: StatementSync;
  getOpsSettingsStmt: StatementSync;
  updateOpsSettingsStmt: StatementSync;
  listMessagingProviderConfigsStmt: StatementSync;
  getMessagingProviderConfigByIdStmt: StatementSync;
  upsertMessagingProviderConfigStmt: StatementSync;
};

type RuntimeResetHelpers = {
  nowIso: () => string;
  getBusinessDay: () => string;
  configuredExportBasePath: string | null;
  emitOutboxEvent: (
    eventType: string,
    aggregateId: string,
    payload: Record<string, unknown>,
  ) => void;
};

export type RuntimeResetDeps = RuntimeResetStatements &
  Pick<EmergencyDeps, 'emergencyStateStmt'> &
  MessagingDeps &
  RuntimeResetHelpers;

export type RuntimeResetPreview = {
  ticketCount: number;
  outboxEventCount: number;
  emergencyActive: boolean;
  preservedTopicCount: number;
  preservedRoomCount: number;
  confirmPhrase: string;
};

export type RuntimeResetResult = {
  resetVisitCount: number;
  clearedOutboxCount: number;
  emergencyCleared: boolean;
  preservedTopicCount: number;
  preservedRoomCount: number;
  checkinLocked: true;
  dayClosePhase: DayClosePhase;
  lastResetBusinessDay: string;
  updatedAt: string;
  sandboxRestartRequired: true;
};

function countFromStmt(stmt: StatementSync): number {
  const row = stmt.get() as { count?: number } | undefined;
  return row?.count ?? 0;
}

function parseCredentialMap(raw: string | undefined): Record<string, string> {
  if (!raw) {
    return {};
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== 'object' || parsed == null || Array.isArray(parsed)) {
      return {};
    }
    const result: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === 'string' && value.trim().length > 0) {
        result[key] = value.trim();
      }
    }
    return result;
  } catch {
    return {};
  }
}

function snapshotMessagingProviders(deps: RuntimeResetDeps): MessagingSnapshotRow[] {
  const rows = deps.listMessagingProviderConfigsStmt.all() as Array<{
    providerId?: string;
    enabled?: number;
    credentialsJson?: string;
  }>;

  const snapshots: MessagingSnapshotRow[] = [];
  for (const row of rows) {
    if (!row.providerId || !isMessagingProviderId(row.providerId)) {
      continue;
    }
    snapshots.push({
      providerId: row.providerId,
      enabled: row.enabled === 1,
      credentials: parseCredentialMap(row.credentialsJson),
    });
  }
  return snapshots;
}

function settingsToPatch(settings: OpsSettings): OpsSettingsPatch {
  return {
    routingMode: settings.routingMode,
    returnWindowMinutes: settings.returnWindowMinutes,
    practiceOpenFrom: settings.practiceOpenFrom,
    practiceOpenTo: settings.practiceOpenTo,
    practiceProfileJson: settings.practiceProfileJson,
    topics: settings.topics,
    rooms: settings.rooms,
    contactLookupFolderPath: settings.contactLookupFolderPath,
    contactLookupDelimiterMode: settings.contactLookupDelimiterMode,
    contactLookupHasHeader: settings.contactLookupHasHeader,
    contactLookupMappingJson: settings.contactLookupMappingJson,
    emergencyEnabled: settings.emergencyEnabled,
    terminalWlanPromoEnabled: settings.terminalWlanPromoEnabled,
    terminalAuthPhoneEnabled: settings.terminalAuthPhoneEnabled,
    terminalAuthNameDobEnabled: settings.terminalAuthNameDobEnabled,
    terminalAuthEgkEnabled: settings.terminalAuthEgkEnabled,
    smsProvider: settings.smsProvider,
  };
}

function restoreMessagingProviders(
  deps: RuntimeResetDeps,
  snapshots: MessagingSnapshotRow[],
): void {
  for (const row of snapshots) {
    updateMessagingProviderConfigInDb(deps, row.providerId, {
      enabled: row.enabled,
      credentials: row.credentials,
    });
  }
}

export function getRuntimeResetPreviewFromDb(
  deps: RuntimeResetDeps,
  confirmPhrase: string,
): RuntimeResetPreview {
  const settings = getOpsSettingsFromDb({
    getOpsSettingsStmt: deps.getOpsSettingsStmt,
    configuredExportBasePath: deps.configuredExportBasePath,
  });
  const emergency = getEmergencyStateFromDb(deps);

  return {
    ticketCount: countFromStmt(deps.countAllVisitsStmt),
    outboxEventCount: countFromStmt(deps.countAllOutboxEventsStmt),
    emergencyActive: emergency.active,
    preservedTopicCount: settings.topics.length,
    preservedRoomCount: settings.rooms.length,
    confirmPhrase,
  };
}

export function executeRuntimeResetInDb(deps: RuntimeResetDeps): RuntimeResetResult {
  const settings = getOpsSettingsFromDb({
    getOpsSettingsStmt: deps.getOpsSettingsStmt,
    configuredExportBasePath: deps.configuredExportBasePath,
  });
  const settingsPatch = settingsToPatch(settings);
  const messagingSnapshots = snapshotMessagingProviders(deps);

  const resetVisitCount = countFromStmt(deps.countAllVisitsStmt);
  const clearedOutboxCount = countFromStmt(deps.countAllOutboxEventsStmt);
  const resetState = executeResetKernel(deps);

  updateOpsSettingsInDb(
    {
      getOpsSettingsStmt: deps.getOpsSettingsStmt,
      updateOpsSettingsStmt: deps.updateOpsSettingsStmt,
      nowIso: deps.nowIso,
      configuredExportBasePath: deps.configuredExportBasePath,
    },
    settingsPatch,
  );
  restoreMessagingProviders(deps, messagingSnapshots);

  deps.emitOutboxEvent('OpsRuntimeReset', 'ops', {
    updatedAt: resetState.updatedAt,
    resetVisitCount,
    clearedOutboxCount,
    emergencyCleared: resetState.emergencyCleared,
    preservedTopicCount: settings.topics.length,
    preservedRoomCount: settings.rooms.length,
    lastResetBusinessDay: resetState.lastResetBusinessDay,
  });

  return {
    resetVisitCount: resetVisitCount,
    clearedOutboxCount,
    emergencyCleared: resetState.emergencyCleared,
    preservedTopicCount: settings.topics.length,
    preservedRoomCount: settings.rooms.length,
    checkinLocked: resetState.checkinLocked,
    dayClosePhase: resetState.dayClosePhase,
    lastResetBusinessDay: resetState.lastResetBusinessDay,
    updatedAt: resetState.updatedAt,
    sandboxRestartRequired: resetState.sandboxRestartRequired,
  };
}
