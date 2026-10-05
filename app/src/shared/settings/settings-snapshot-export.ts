import type { DatabaseSync, StatementSync } from 'node:sqlite';
import { getOpsSettingsFromDb } from '../db/database-ops-settings.js';
import { getAuthSettingsFromDb } from '../db/database-auth-settings.js';
import { prepareOpsDatabaseStatements } from '../db/database-ops-statements.js';
import { SETUP_CONTACT_MODES, type SetupContactMode } from '../ops/setup-types.js';
import {
  SETTINGS_FORMAT_VERSION,
  type AuthSettingsSnapshotV1,
  type MessagingProviderConfigSnapshotV1,
  type OpsSettingsSnapshotV1,
  type SettingsSnapshotDbV1,
  type SettingsSnapshotV1,
} from './settings-snapshot-types.js';

export function exportSettingsDbSnapshotFromDb(
  db: DatabaseSync,
  exportedAt: string = new Date().toISOString(),
): SettingsSnapshotDbV1 {
  const stmts = prepareOpsDatabaseStatements(db);
  const auth = getAuthSettingsFromDb({ getAuthSettingsStmt: stmts.getAuthSettingsStmt });

  const authSettings: AuthSettingsSnapshotV1 = {
    staffPinHashMfa: auth.staffPinHashMfa,
    staffPinHashOps: auth.staffPinHashOps,
    roomPanelPinHash: auth.roomPanelPinHash,
  };

  return {
    settingsFormatVersion: SETTINGS_FORMAT_VERSION,
    exportedAt,
    opsSettings: buildOpsSettingsSnapshotV1(db, stmts.getOpsSettingsStmt),
    authSettings,
    messagingProviderConfigs: readMessagingProviderSnapshots(
      stmts.listMessagingProviderConfigsStmt,
    ),
  };
}

export function exportSettingsSnapshotFromDb(
  db: DatabaseSync,
  env: Record<string, string>,
  exportedAt: string = new Date().toISOString(),
): SettingsSnapshotV1 {
  return {
    ...exportSettingsDbSnapshotFromDb(db, exportedAt),
    env: { ...env },
  };
}

function readOpsSettingsExtras(db: DatabaseSync): {
  exportBasePath: string;
  portalEnabled: boolean;
  setupCompletedAt: string | null;
  setupContactMode: SetupContactMode;
} {
  const row = db
    .prepare(
      `
      SELECT
        export_base_path AS exportBasePath,
        portal_enabled AS portalEnabled,
        setup_completed_at AS setupCompletedAt,
        setup_contact_mode AS setupContactMode
      FROM ops_settings
      WHERE id = 'singleton'
      LIMIT 1
    `,
    )
    .get() as
    | {
        exportBasePath?: string;
        portalEnabled?: number;
        setupCompletedAt?: string | null;
        setupContactMode?: string;
      }
    | undefined;

  if (!row?.exportBasePath) {
    throw new Error('OPS_SETTINGS_NOT_INITIALIZED');
  }

  const setupContactMode = row.setupContactMode?.trim() ?? 'unset';
  return {
    exportBasePath: row.exportBasePath,
    portalEnabled: row.portalEnabled === 1,
    setupCompletedAt: row.setupCompletedAt ?? null,
    setupContactMode: SETUP_CONTACT_MODES.includes(setupContactMode as SetupContactMode)
      ? (setupContactMode as SetupContactMode)
      : 'unset',
  };
}

function readMessagingProviderSnapshots(
  listMessagingProviderConfigsStmt: StatementSync,
): MessagingProviderConfigSnapshotV1[] {
  const rows = listMessagingProviderConfigsStmt.all() as Array<{
    providerId?: string;
    channel?: string;
    enabled?: number;
    credentialsJson?: string;
  }>;

  return rows
    .filter((row) => row.providerId && (row.channel === 'sms' || row.channel === 'messenger'))
    .map((row) => ({
      providerId: row.providerId!,
      channel: row.channel as 'sms' | 'messenger',
      enabled: row.enabled === 1,
      credentialsJson: row.credentialsJson ?? '{}',
    }));
}

export function buildOpsSettingsSnapshotV1(
  db: DatabaseSync,
  getOpsSettingsStmt: StatementSync,
): OpsSettingsSnapshotV1 {
  const settings = getOpsSettingsFromDb({
    getOpsSettingsStmt,
    configuredExportBasePath: null,
  });
  const extras = readOpsSettingsExtras(db);

  return {
    routingMode: settings.routingMode,
    postWaitingCallTargetId: settings.postWaitingCallTargetId,
    returnWindowMinutes: settings.returnWindowMinutes,
    longWaitThresholdMinutes: settings.longWaitThresholdMinutes,
    practiceOpenFrom: settings.practiceOpenFrom,
    practiceOpenTo: settings.practiceOpenTo,
    practiceProfileJson: settings.practiceProfileJson,
    topics: settings.topics,
    journeySettings: settings.journeySettings,
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
    terminalPatientLocales: settings.terminalPatientLocales,
    smsProvider: settings.smsProvider,
    exportBasePath: extras.exportBasePath,
    portalEnabled: extras.portalEnabled,
    setupCompletedAt: extras.setupCompletedAt,
    setupContactMode: extras.setupContactMode,
  };
}
