import type { DatabaseSync } from 'node:sqlite';
import { validateCatalogIntegrity } from '@praxis-flow/flow-core';
import { loadCatalog } from '@praxis-flow/flow-core/server';
import {
  normalizeRoomPanelsSettings,
  normalizeTerminalPatientLocales,
  type RoomPanelPlacementConfig,
} from '@praxis-flow/domain';
import { validateTopicSettings, normalizeTopicSettingsList, type TopicSetting } from '../checkin-topic-settings.js';
import { ensureSingleDefaultCallTarget } from '../db/database-ops-settings.js';
import { OpsSettingsValidationError } from '../db/ops-settings-errors.js';
import { prepareCoreDatabaseStatements } from '../db/database-statements.js';
import { syncFlowCoreCatalog } from '../flow-core/flow-core-runtime.js';
import {
  parseJourneySettingsJson,
  validateTopicJourneyAssignments,
} from '../journey-settings.js';
import { SETUP_CONTACT_MODES, type SetupContactMode } from '../ops/setup-types.js';
import { isRecord } from '../type-guards.js';
import type { OpsSettings, RoutingMode } from '../db/db-types.js';
import {
  SETTINGS_FORMAT_VERSION,
  SettingsSnapshotError,
  type AuthSettingsSnapshotV1,
  type MessagingProviderConfigSnapshotV1,
  type OpsSettingsSnapshotV1,
  type SettingsSnapshotDbV1,
  type SettingsSnapshotImportOptions,
  type SettingsSnapshotImportReport,
  type SettingsSnapshotV1,
} from './settings-snapshot-types.js';

const MOCK_MESSAGING_PROVIDER_ID = 'mock';

const ROUTING_MODES = new Set<RoutingMode>(['simple', 'complex']);
const DELIMITER_MODES = new Set<OpsSettingsSnapshotV1['contactLookupDelimiterMode']>([
  'auto',
  'semicolon',
  'comma',
  'tab',
]);

function assertString(value: unknown, field: string): string {
  if (typeof value !== 'string') {
    throw new SettingsSnapshotError('INVALID_SNAPSHOT', `${field} must be a string`);
  }
  return value;
}

function assertBoolean(value: unknown, field: string): boolean {
  if (typeof value !== 'boolean') {
    throw new SettingsSnapshotError('INVALID_SNAPSHOT', `${field} must be a boolean`);
  }
  return value;
}

function assertNumber(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new SettingsSnapshotError('INVALID_SNAPSHOT', `${field} must be a number`);
  }
  return value;
}

function parseAuthSettingsSnapshot(raw: unknown): AuthSettingsSnapshotV1 {
  if (!isRecord(raw)) {
    throw new SettingsSnapshotError('INVALID_SNAPSHOT', 'authSettings must be an object');
  }
  return {
    staffPinHashMfa: assertString(raw.staffPinHashMfa, 'authSettings.staffPinHashMfa'),
    staffPinHashOps: assertString(raw.staffPinHashOps, 'authSettings.staffPinHashOps'),
    roomPanelPinHash: assertString(raw.roomPanelPinHash, 'authSettings.roomPanelPinHash'),
  };
}

function parseMessagingProviderSnapshots(raw: unknown): MessagingProviderConfigSnapshotV1[] {
  if (!Array.isArray(raw)) {
    throw new SettingsSnapshotError('INVALID_SNAPSHOT', 'messagingProviderConfigs must be an array');
  }

  return raw.map((entry, index) => {
    if (!isRecord(entry)) {
      throw new SettingsSnapshotError(
        'INVALID_SNAPSHOT',
        `messagingProviderConfigs[${index}] must be an object`,
      );
    }
    const channel = assertString(entry.channel, `messagingProviderConfigs[${index}].channel`);
    if (channel !== 'sms' && channel !== 'messenger') {
      throw new SettingsSnapshotError(
        'INVALID_SNAPSHOT',
        `messagingProviderConfigs[${index}].channel is invalid`,
      );
    }
    return {
      providerId: assertString(entry.providerId, `messagingProviderConfigs[${index}].providerId`),
      channel,
      enabled: assertBoolean(entry.enabled, `messagingProviderConfigs[${index}].enabled`),
      credentialsJson: assertString(
        entry.credentialsJson ?? '{}',
        `messagingProviderConfigs[${index}].credentialsJson`,
      ),
    };
  });
}

function parseEnvSnapshot(raw: unknown): Record<string, string> {
  if (!isRecord(raw)) {
    throw new SettingsSnapshotError('INVALID_SNAPSHOT', 'env must be an object');
  }
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value !== 'string') {
      throw new SettingsSnapshotError('INVALID_SNAPSHOT', `env.${key} must be a string`);
    }
    env[key] = value;
  }
  return env;
}

function parseRoomPanelsFromSnapshot(
  raw: unknown,
  index: number,
): OpsSettings['rooms'][number]['panels'] {
  if (raw == null) {
    return normalizeRoomPanelsSettings(null);
  }
  if (!isRecord(raw)) {
    throw new SettingsSnapshotError(
      'INVALID_SNAPSHOT',
      `opsSettings.rooms[${index}].panels must be an object`,
    );
  }

  const outside = raw.outside;
  const inside = raw.inside;
  if (outside != null && !isRecord(outside)) {
    throw new SettingsSnapshotError(
      'INVALID_SNAPSHOT',
      `opsSettings.rooms[${index}].panels.outside must be an object`,
    );
  }
  if (inside != null && !isRecord(inside)) {
    throw new SettingsSnapshotError(
      'INVALID_SNAPSHOT',
      `opsSettings.rooms[${index}].panels.inside must be an object`,
    );
  }

  return normalizeRoomPanelsSettings({
    outside: outside as Partial<RoomPanelPlacementConfig> | undefined,
    inside: inside as Partial<RoomPanelPlacementConfig> | undefined,
  });
}

function parseRoomSettingsFromSnapshot(raw: unknown): OpsSettings['rooms'] {
  if (!Array.isArray(raw)) {
    throw new SettingsSnapshotError('INVALID_SNAPSHOT', 'opsSettings.rooms must be an array');
  }

  const rooms = raw.map((entry, index) => {
    if (!isRecord(entry)) {
      throw new SettingsSnapshotError('INVALID_SNAPSHOT', `opsSettings.rooms[${index}] must be an object`);
    }
    const roomId = assertString(entry.roomId, `opsSettings.rooms[${index}].roomId`);
    const roomLabel = assertString(entry.roomLabel, `opsSettings.rooms[${index}].roomLabel`);
    return {
      roomId,
      roomLabel,
      enabled: entry.enabled !== false,
      defaultCallTarget: entry.defaultCallTarget === true,
      maxOccupancy:
        typeof entry.maxOccupancy === 'number' && Number.isFinite(entry.maxOccupancy)
          ? entry.maxOccupancy
          : null,
      panels: parseRoomPanelsFromSnapshot(entry.panels, index),
    };
  });

  return ensureSingleDefaultCallTarget(rooms);
}

function parseOpsSettingsSnapshot(raw: unknown): OpsSettingsSnapshotV1 {
  if (!isRecord(raw)) {
    throw new SettingsSnapshotError('INVALID_SNAPSHOT', 'opsSettings must be an object');
  }

  const routingMode = assertString(raw.routingMode, 'opsSettings.routingMode');
  if (!ROUTING_MODES.has(routingMode as RoutingMode)) {
    throw new SettingsSnapshotError('INVALID_SNAPSHOT', 'opsSettings.routingMode is invalid');
  }

  const contactLookupDelimiterMode = assertString(
    raw.contactLookupDelimiterMode,
    'opsSettings.contactLookupDelimiterMode',
  );
  if (!DELIMITER_MODES.has(contactLookupDelimiterMode as OpsSettingsSnapshotV1['contactLookupDelimiterMode'])) {
    throw new SettingsSnapshotError(
      'INVALID_SNAPSHOT',
      'opsSettings.contactLookupDelimiterMode is invalid',
    );
  }

  const setupContactMode = assertString(raw.setupContactMode, 'opsSettings.setupContactMode');
  if (!SETUP_CONTACT_MODES.includes(setupContactMode as SetupContactMode)) {
    throw new SettingsSnapshotError('INVALID_SNAPSHOT', 'opsSettings.setupContactMode is invalid');
  }

  const setupCompletedAt =
    raw.setupCompletedAt == null ? null : assertString(raw.setupCompletedAt, 'opsSettings.setupCompletedAt');

  return {
    routingMode: routingMode as RoutingMode,
    returnWindowMinutes: assertNumber(raw.returnWindowMinutes, 'opsSettings.returnWindowMinutes'),
    practiceOpenFrom: assertString(raw.practiceOpenFrom, 'opsSettings.practiceOpenFrom'),
    practiceOpenTo: assertString(raw.practiceOpenTo, 'opsSettings.practiceOpenTo'),
    practiceProfileJson: assertString(raw.practiceProfileJson, 'opsSettings.practiceProfileJson'),
    topics: raw.topics,
    journeySettings: raw.journeySettings,
    rooms: raw.rooms,
    contactLookupFolderPath:
      raw.contactLookupFolderPath == null
        ? null
        : assertString(raw.contactLookupFolderPath, 'opsSettings.contactLookupFolderPath'),
    contactLookupDelimiterMode:
      contactLookupDelimiterMode as OpsSettingsSnapshotV1['contactLookupDelimiterMode'],
    contactLookupHasHeader: assertBoolean(
      raw.contactLookupHasHeader,
      'opsSettings.contactLookupHasHeader',
    ),
    contactLookupMappingJson: assertString(
      raw.contactLookupMappingJson,
      'opsSettings.contactLookupMappingJson',
    ),
    emergencyEnabled: assertBoolean(raw.emergencyEnabled, 'opsSettings.emergencyEnabled'),
    terminalWlanPromoEnabled: assertBoolean(
      raw.terminalWlanPromoEnabled,
      'opsSettings.terminalWlanPromoEnabled',
    ),
    terminalAuthPhoneEnabled: assertBoolean(
      raw.terminalAuthPhoneEnabled,
      'opsSettings.terminalAuthPhoneEnabled',
    ),
    terminalAuthNameDobEnabled: assertBoolean(
      raw.terminalAuthNameDobEnabled,
      'opsSettings.terminalAuthNameDobEnabled',
    ),
    terminalAuthEgkEnabled: assertBoolean(
      raw.terminalAuthEgkEnabled,
      'opsSettings.terminalAuthEgkEnabled',
    ),
    terminalPatientLocales: raw.terminalPatientLocales,
    smsProvider: assertString(raw.smsProvider, 'opsSettings.smsProvider'),
    exportBasePath: assertString(raw.exportBasePath, 'opsSettings.exportBasePath'),
    portalEnabled: assertBoolean(raw.portalEnabled, 'opsSettings.portalEnabled'),
    setupCompletedAt,
    setupContactMode: setupContactMode as SetupContactMode,
  };
}

function parseTopicsFromSnapshot(raw: unknown): OpsSettings['topics'] {
  if (!Array.isArray(raw)) {
    throw new SettingsSnapshotError('INVALID_SNAPSHOT', 'opsSettings.topics must be an array');
  }
  try {
    return normalizeTopicSettingsList(raw as Partial<TopicSetting>[]);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'opsSettings.topics is invalid';
    throw new SettingsSnapshotError('OPS_SETTINGS_INVALID', message);
  }
}

function validateOpsSettingsSnapshot(snapshot: OpsSettingsSnapshotV1): OpsSettings {
  const topics = parseTopicsFromSnapshot(snapshot.topics);
  const rooms = parseRoomSettingsFromSnapshot(snapshot.rooms);
  const topicValidation = validateTopicSettings(topics, rooms);
  if (!topicValidation.ok) {
    throw new SettingsSnapshotError('OPS_SETTINGS_INVALID', topicValidation.message);
  }

  let journeySettings;
  try {
    journeySettings = parseJourneySettingsJson(JSON.stringify(snapshot.journeySettings));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'opsSettings.journeySettings is invalid';
    throw new SettingsSnapshotError('OPS_SETTINGS_INVALID', message);
  }

  if (snapshot.routingMode === 'complex') {
    const journeyAssignmentValidation = validateTopicJourneyAssignments(topics, journeySettings);
    if (!journeyAssignmentValidation.ok) {
      throw new SettingsSnapshotError('OPS_SETTINGS_INVALID', journeyAssignmentValidation.message);
    }
  }

  let terminalPatientLocales;
  try {
    terminalPatientLocales = normalizeTerminalPatientLocales(snapshot.terminalPatientLocales);
  } catch {
    throw new SettingsSnapshotError('OPS_SETTINGS_INVALID', 'opsSettings.terminalPatientLocales is invalid');
  }

  return {
    routingMode: snapshot.routingMode,
    returnWindowMinutes: snapshot.returnWindowMinutes,
    practiceOpenFrom: snapshot.practiceOpenFrom,
    practiceOpenTo: snapshot.practiceOpenTo,
    practiceProfileJson: snapshot.practiceProfileJson,
    topics,
    journeySettings,
    rooms,
    contactLookupFolderPath: snapshot.contactLookupFolderPath,
    contactLookupDelimiterMode: snapshot.contactLookupDelimiterMode,
    contactLookupHasHeader: snapshot.contactLookupHasHeader,
    contactLookupMappingJson: snapshot.contactLookupMappingJson,
    emergencyEnabled: snapshot.emergencyEnabled,
    terminalWlanPromoEnabled: snapshot.terminalWlanPromoEnabled,
    terminalAuthPhoneEnabled: snapshot.terminalAuthPhoneEnabled,
    terminalAuthNameDobEnabled: snapshot.terminalAuthNameDobEnabled,
    terminalAuthEgkEnabled: snapshot.terminalAuthEgkEnabled,
    terminalPatientLocales,
    smsProvider: snapshot.smsProvider,
    exportBasePath: snapshot.exportBasePath,
    updatedAt: new Date().toISOString(),
  };
}

export function parseSettingsSnapshotV1(raw: unknown): SettingsSnapshotV1 {
  if (!isRecord(raw)) {
    throw new SettingsSnapshotError('INVALID_SNAPSHOT', 'Snapshot must be an object');
  }

  if (raw.settingsFormatVersion !== SETTINGS_FORMAT_VERSION) {
    throw new SettingsSnapshotError(
      'UNKNOWN_FORMAT_VERSION',
      `Unsupported settingsFormatVersion ${String(raw.settingsFormatVersion)}`,
    );
  }

  return {
    settingsFormatVersion: SETTINGS_FORMAT_VERSION,
    exportedAt: assertString(raw.exportedAt, 'exportedAt'),
    opsSettings: parseOpsSettingsSnapshot(raw.opsSettings),
    authSettings: parseAuthSettingsSnapshot(raw.authSettings),
    messagingProviderConfigs: parseMessagingProviderSnapshots(raw.messagingProviderConfigs),
    env: parseEnvSnapshot(raw.env),
  };
}

function writeOpsSettingsSnapshot(
  db: DatabaseSync,
  snapshot: OpsSettingsSnapshotV1,
  opsSettings: OpsSettings,
  updatedAt: string,
): void {
  db.prepare(
    `
    UPDATE ops_settings
    SET
      waiting_room_full = 0,
      routing_mode = ?,
      return_window_minutes = ?,
      practice_open_from = ?,
      practice_open_to = ?,
      practice_profile_json = ?,
      topic_settings_json = ?,
      journey_settings_json = ?,
      rooms_json = ?,
      contact_lookup_folder_path = ?,
      contact_lookup_delimiter_mode = ?,
      contact_lookup_has_header = ?,
      contact_lookup_mapping_json = ?,
      emergency_enabled = ?,
      terminal_wlan_promo_enabled = ?,
      terminal_auth_phone_enabled = ?,
      terminal_auth_name_dob_enabled = ?,
      terminal_auth_egk_enabled = ?,
      terminal_patient_locales = ?,
      sms_provider = ?,
      export_base_path = ?,
      portal_enabled = ?,
      setup_completed_at = ?,
      setup_contact_mode = ?,
      updated_at = ?
    WHERE id = 'singleton'
  `,
  ).run(
    opsSettings.routingMode,
    opsSettings.returnWindowMinutes,
    opsSettings.practiceOpenFrom,
    opsSettings.practiceOpenTo,
    opsSettings.practiceProfileJson,
    JSON.stringify(opsSettings.topics),
    JSON.stringify(opsSettings.journeySettings),
    JSON.stringify(opsSettings.rooms),
    opsSettings.contactLookupFolderPath,
    opsSettings.contactLookupDelimiterMode,
    opsSettings.contactLookupHasHeader ? 1 : 0,
    opsSettings.contactLookupMappingJson,
    opsSettings.emergencyEnabled ? 1 : 0,
    opsSettings.terminalWlanPromoEnabled ? 1 : 0,
    opsSettings.terminalAuthPhoneEnabled ? 1 : 0,
    opsSettings.terminalAuthNameDobEnabled ? 1 : 0,
    opsSettings.terminalAuthEgkEnabled ? 1 : 0,
    JSON.stringify(opsSettings.terminalPatientLocales),
    opsSettings.smsProvider,
    snapshot.exportBasePath,
    snapshot.portalEnabled ? 1 : 0,
    snapshot.setupCompletedAt,
    snapshot.setupContactMode,
    updatedAt,
  );
}

function writeAuthSettingsSnapshot(db: DatabaseSync, auth: AuthSettingsSnapshotV1, updatedAt: string): void {
  db.prepare(
    `
    UPDATE auth_settings
    SET
      staff_pin_hash_mfa = ?,
      staff_pin_hash_ops = ?,
      room_panel_pin_hash = ?,
      updated_at = ?
    WHERE id = 'singleton'
  `,
  ).run(auth.staffPinHashMfa, auth.staffPinHashOps, auth.roomPanelPinHash, updatedAt);
}

function resolveMessagingProviderImportState(
  provider: MessagingProviderConfigSnapshotV1,
  skipProviderCredentials: boolean,
): { enabled: boolean; credentialsJson: string; disabledOnSkip: boolean } {
  if (!skipProviderCredentials) {
    return {
      enabled: provider.enabled,
      credentialsJson: provider.credentialsJson,
      disabledOnSkip: false,
    };
  }

  if (provider.providerId === MOCK_MESSAGING_PROVIDER_ID) {
    return {
      enabled: provider.enabled,
      credentialsJson: '{}',
      disabledOnSkip: false,
    };
  }

  return {
    enabled: false,
    credentialsJson: '{}',
    disabledOnSkip: true,
  };
}

function writeMessagingProviderSnapshots(
  db: DatabaseSync,
  providers: MessagingProviderConfigSnapshotV1[],
  skipProviderCredentials: boolean,
  updatedAt: string,
): string[] {
  const disabledProviderIds: string[] = [];
  const upsert = db.prepare(
    `
    INSERT INTO messaging_provider_configs (
      provider_id, channel, enabled, credentials_json, updated_at
    ) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(provider_id) DO UPDATE SET
      channel = excluded.channel,
      enabled = excluded.enabled,
      credentials_json = excluded.credentials_json,
      updated_at = excluded.updated_at
  `,
  );

  for (const provider of providers) {
    const importState = resolveMessagingProviderImportState(provider, skipProviderCredentials);
    if (importState.disabledOnSkip) {
      disabledProviderIds.push(provider.providerId);
    }
    upsert.run(
      provider.providerId,
      provider.channel,
      importState.enabled ? 1 : 0,
      importState.credentialsJson,
      updatedAt,
    );
  }

  return disabledProviderIds;
}

export type SettingsSnapshotImportResult = {
  snapshot: SettingsSnapshotV1;
  opsSettings: OpsSettings;
  env: Record<string, string>;
  skipProviderCredentials: boolean;
  disabledProviderIds: string[];
};

export function prepareSettingsSnapshotImport(raw: unknown): {
  snapshot: SettingsSnapshotV1;
  opsSettings: OpsSettings;
} {
  const snapshot = parseSettingsSnapshotV1(raw);
  const opsSettings = validateOpsSettingsSnapshot(snapshot.opsSettings);
  return { snapshot, opsSettings };
}

export function importSettingsSnapshotIntoDb(
  db: DatabaseSync,
  rawSnapshot: unknown,
  options: SettingsSnapshotImportOptions = {},
): SettingsSnapshotImportResult {
  const skipProviderCredentials = options.skipProviderCredentials === true;
  const { snapshot, opsSettings } = prepareSettingsSnapshotImport(rawSnapshot);
  const updatedAt = new Date().toISOString();
  let disabledProviderIds: string[] = [];

  db.exec('BEGIN IMMEDIATE');
  try {
    writeOpsSettingsSnapshot(db, snapshot.opsSettings, opsSettings, updatedAt);
    options.testHooks?.afterOpsSettingsWrite?.();
    writeAuthSettingsSnapshot(db, snapshot.authSettings, updatedAt);
    disabledProviderIds = writeMessagingProviderSnapshots(
      db,
      snapshot.messagingProviderConfigs,
      skipProviderCredentials,
      updatedAt,
    );

    options.testHooks?.beforeCatalogSync?.();
    syncFlowCoreCatalog(db, opsSettings);
    try {
      validateCatalogIntegrity(loadCatalog(db));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Catalog integrity check failed';
      throw new SettingsSnapshotError('CATALOG_INTEGRITY_FAILED', message);
    }

    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    if (error instanceof SettingsSnapshotError || error instanceof OpsSettingsValidationError) {
      throw error;
    }
    const message = error instanceof Error ? error.message : 'Settings import failed';
    throw new SettingsSnapshotError('IMPORT_FAILED', message);
  }

  return {
    snapshot,
    opsSettings,
    env: { ...snapshot.env },
    skipProviderCredentials,
    disabledProviderIds,
  };
}

export function snapshotsEquivalentForRestore(left: SettingsSnapshotV1, right: SettingsSnapshotV1): boolean {
  return (
    JSON.stringify(left.opsSettings) === JSON.stringify(right.opsSettings) &&
    JSON.stringify(left.authSettings) === JSON.stringify(right.authSettings) &&
    JSON.stringify(left.messagingProviderConfigs) === JSON.stringify(right.messagingProviderConfigs) &&
    JSON.stringify(left.env) === JSON.stringify(right.env)
  );
}

export function dbSnapshotsEquivalentForRestore(
  left: SettingsSnapshotDbV1,
  right: SettingsSnapshotDbV1,
): boolean {
  return (
    JSON.stringify(left.opsSettings) === JSON.stringify(right.opsSettings) &&
    JSON.stringify(left.authSettings) === JSON.stringify(right.authSettings) &&
    JSON.stringify(left.messagingProviderConfigs) === JSON.stringify(right.messagingProviderConfigs)
  );
}

export function withDefaultEnvForSnapshotParse(raw: unknown): unknown {
  if (!isRecord(raw)) {
    return raw;
  }
  if (raw.env !== undefined) {
    return raw;
  }
  return { ...raw, env: {} };
}

export function parseSkipProviderCredentialsQuery(
  value: string | undefined,
): { ok: true; skipProviderCredentials: boolean } | { ok: false; message: string } {
  if (value === undefined) {
    return { ok: true, skipProviderCredentials: false };
  }
  if (value === 'true') {
    return { ok: true, skipProviderCredentials: true };
  }
  if (value === 'false') {
    return { ok: true, skipProviderCredentials: false };
  }
  return {
    ok: false,
    message: 'Query parameter skipProviderCredentials must be "true" or "false".',
  };
}

export function buildSettingsSnapshotImportReport(
  snapshot: SettingsSnapshotV1,
  options: {
    skipProviderCredentials: boolean;
    disabledProviderIds: string[];
  },
): SettingsSnapshotImportReport {
  return {
    ok: true,
    settingsFormatVersion: snapshot.settingsFormatVersion,
    exportedAt: snapshot.exportedAt,
    routingMode: snapshot.opsSettings.routingMode,
    portalEnabled: snapshot.opsSettings.portalEnabled,
    setupContactMode: snapshot.opsSettings.setupContactMode,
    messagingProviderCount: snapshot.messagingProviderConfigs.length,
    catalogIntegrityOk: true,
    skipProviderCredentials: options.skipProviderCredentials,
    providerCredentialsSkipped: options.skipProviderCredentials,
    disabledProviderIds: options.disabledProviderIds,
  };
}
