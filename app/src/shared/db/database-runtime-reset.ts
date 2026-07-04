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

type MessagingSnapshotRow = {
  providerId: string;
  enabled: boolean;
  credentials: Record<string, string>;
};

type RuntimeResetStatements = {
  countAllTicketsStmt: StatementSync;
  countAllOutboxEventsStmt: StatementSync;
  deleteAllTicketsStmt: StatementSync;
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
  resetTicketCount: number;
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
    ticketCount: countFromStmt(deps.countAllTicketsStmt),
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
  const emergencyBefore = getEmergencyStateFromDb(deps);

  const resetTicketCount = countFromStmt(deps.countAllTicketsStmt);
  const clearedOutboxCount = countFromStmt(deps.countAllOutboxEventsStmt);
  const updatedAt = deps.nowIso();
  const lastResetBusinessDay = deps.getBusinessDay();

  deps.deleteAllTicketsStmt.run();
  deps.deleteAllOutboxEventsStmt.run();
  if (emergencyBefore.active) {
    deps.clearEmergencyStateStmt.run(updatedAt);
  }

  deps.updateCheckinLockStmt.run(1, updatedAt);
  deps.updateDayClosePhaseStmt.run('open', updatedAt);
  deps.updateLastResetBusinessDayStmt.run(lastResetBusinessDay, updatedAt);

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
    updatedAt,
    resetTicketCount,
    clearedOutboxCount,
    emergencyCleared: emergencyBefore.active,
    preservedTopicCount: settings.topics.length,
    preservedRoomCount: settings.rooms.length,
    lastResetBusinessDay,
  });

  return {
    resetTicketCount,
    clearedOutboxCount,
    emergencyCleared: emergencyBefore.active,
    preservedTopicCount: settings.topics.length,
    preservedRoomCount: settings.rooms.length,
    checkinLocked: true,
    dayClosePhase: 'open',
    lastResetBusinessDay,
    updatedAt,
    sandboxRestartRequired: true,
  };
}
