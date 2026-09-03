import type { StatementSync } from 'node:sqlite';
import {
  ensureSingleDefaultCallTarget,
  normalizeRoomPanelPlacementConfig,
  normalizeRoomPanelsSettings,
  normalizeTerminalPatientLocales,
  ROOM_PANEL_CUSTOM_TEXT_MAX_LENGTH,
  ROOM_PANEL_MODES,
  ROOM_PANEL_TEXT_PRESETS,
  type RoomPanelPlacement,
  type RoomPanelPlacementConfig,
  type RoomPanelTextPreset,
} from '@praxis-flow/domain';
import { isValidConfigurableTopicId } from '../checkin-topics.js';
import {
  normalizeTopicSettingsList,
  readPartialNullableId,
  readPartialNullableTimeField,
  validateTopicSettings,
  type TopicSetting,
} from '../checkin-topic-settings.js';
import { isRecord } from '../type-guards.js';
import { OpsSettingsValidationError } from './ops-settings-errors.js';
import type { OpsSettings, RoutingMode } from './db-types.js';
import { domainError } from '../errors/domain-error.js';
import { parseMaxOccupancy } from '../ops/room-capacity.js';
import { parseJourneySettingsJson, validateTopicJourneyAssignments } from '../journey-settings.js';

export { ensureSingleDefaultCallTarget };

function isStringSetMember<T extends string>(values: ReadonlySet<T>, value: unknown): value is T {
  return typeof value === 'string' && values.has(value as T);
}

type OpsSettingsRow = {
  routingMode?: string;
  returnWindowMinutes?: number;
  practiceOpenFrom?: string;
  practiceOpenTo?: string;
  practiceProfileJson?: string;
  topicSettingsJson?: string;
  journeySettingsJson?: string;
  roomsJson?: string;
  contactLookupFolderPath?: string | null;
  contactLookupDelimiterMode?: 'auto' | 'semicolon' | 'comma' | 'tab';
  contactLookupHasHeader?: number;
  contactLookupMappingJson?: string;
  emergencyEnabled?: number;
  terminalWlanPromoEnabled?: number;
  terminalAuthPhoneEnabled?: number;
  terminalAuthNameDobEnabled?: number;
  terminalAuthEgkEnabled?: number;
  terminalPatientLocales?: string;
  smsProvider?: string;
  exportBasePath?: string;
  updatedAt?: string;
};

export type OpsSettingsPatch = Partial<
  Pick<
    OpsSettings,
    | 'routingMode'
    | 'returnWindowMinutes'
    | 'practiceOpenFrom'
    | 'practiceOpenTo'
    | 'practiceProfileJson'
    | 'topics'
    | 'journeySettings'
    | 'rooms'
    | 'contactLookupFolderPath'
    | 'contactLookupDelimiterMode'
    | 'contactLookupHasHeader'
    | 'contactLookupMappingJson'
    | 'emergencyEnabled'
    | 'terminalWlanPromoEnabled'
    | 'terminalAuthPhoneEnabled'
    | 'terminalAuthNameDobEnabled'
    | 'terminalAuthEgkEnabled'
    | 'terminalPatientLocales'
    | 'smsProvider'
  >
>;

const ROUTING_MODES = new Set<RoutingMode>(['simple', 'complex']);

function normalizeRoutingMode(raw: unknown): RoutingMode {
  return isStringSetMember(ROUTING_MODES, raw) ? raw : 'simple';
}

function parseTerminalPatientLocalesRaw(
  raw: string | undefined,
): OpsSettings['terminalPatientLocales'] {
  if (raw == null || raw.trim().length === 0) {
    return normalizeTerminalPatientLocales(undefined);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new OpsSettingsValidationError('terminal_patient_locales is invalid JSON.');
  }

  return normalizeTerminalPatientLocales(parsed);
}

function parseTopicSettingsRaw(raw: string | undefined): OpsSettings['topics'] {
  if (raw == null || raw.trim().length === 0) {
    throw new OpsSettingsValidationError('topic_settings_json is missing.');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new OpsSettingsValidationError('topic_settings_json is invalid JSON.');
  }

  if (!Array.isArray(parsed)) {
    throw new OpsSettingsValidationError('topic_settings_json must be an array.');
  }

  if (parsed.length === 0) {
    throw new OpsSettingsValidationError('topic_settings_json must contain at least one topic.');
  }

  const parsedPartial: Partial<TopicSetting>[] = [];
  for (let index = 0; index < parsed.length; index += 1) {
    const entry = parsed[index];
    if (!isRecord(entry)) {
      throw new OpsSettingsValidationError(
        `topic_settings_json entry at index ${index} is not an object.`,
      );
    }

    const topicId = typeof entry.topicId === 'string' ? entry.topicId.trim() : '';
    if (!isValidConfigurableTopicId(topicId)) {
      throw new OpsSettingsValidationError(
        `topic_settings_json entry at index ${index} has an invalid topicId.`,
      );
    }

    parsedPartial.push({
      topicId,
      label: typeof entry.label === 'string' ? entry.label : undefined,
      laneCode:
        typeof entry.laneCode === 'string'
          ? entry.laneCode
          : typeof entry.prefix === 'string'
            ? entry.prefix
            : undefined,
      defaultRoomId: typeof entry.defaultRoomId === 'string' ? entry.defaultRoomId : undefined,
      iconId: readPartialNullableId(entry.iconId),
      accentColor: typeof entry.accentColor === 'string' ? entry.accentColor : undefined,
      enabled: typeof entry.enabled === 'boolean' ? entry.enabled : undefined,
      availableFrom: readPartialNullableTimeField(entry.availableFrom),
      availableTo: readPartialNullableTimeField(entry.availableTo),
      sortOrder: typeof entry.sortOrder === 'number' ? entry.sortOrder : undefined,
      journeyTemplateId: readPartialNullableId(entry.journeyTemplateId),
    });
  }

  return normalizeTopicSettingsList(parsedPartial);
}

function normalizeRoomPanelCustomTextStrict(
  value: unknown,
  fieldName: string,
  index: number,
): string | null {
  if (value == null) {
    return null;
  }
  if (typeof value !== 'string') {
    throw new OpsSettingsValidationError(
      `rooms_json entry at index ${index} has invalid ${fieldName}.`,
    );
  }
  const trimmed = value.trim();
  if (trimmed.length > ROOM_PANEL_CUSTOM_TEXT_MAX_LENGTH) {
    throw new OpsSettingsValidationError(
      `rooms_json entry at index ${index} has invalid ${fieldName}.`,
    );
  }
  return trimmed.length > 0 ? trimmed : null;
}

const ROOM_PANEL_MODE_SET = new Set(ROOM_PANEL_MODES);
const ROOM_PANEL_TEXT_PRESET_SET = new Set<RoomPanelTextPreset>(ROOM_PANEL_TEXT_PRESETS);

function normalizeRoomPanelPlacementConfigFromDb(
  raw: unknown,
  placement: RoomPanelPlacement,
  index: number,
): RoomPanelPlacementConfig {
  if (raw == null) {
    return normalizeRoomPanelPlacementConfig(placement, null);
  }
  if (!isRecord(raw)) {
    throw new OpsSettingsValidationError(
      `rooms_json entry at index ${index} has invalid panels.${placement}.`,
    );
  }

  return normalizeRoomPanelPlacementConfig(placement, {
    enabled: raw.enabled === true,
    mode: isStringSetMember(ROOM_PANEL_MODE_SET, raw.mode) ? raw.mode : undefined,
    showPatientNames: raw.showPatientNames === true,
    allowCalling: raw.allowCalling === true,
    calledTextPreset: isStringSetMember(ROOM_PANEL_TEXT_PRESET_SET, raw.calledTextPreset)
      ? raw.calledTextPreset
      : undefined,
    calledTextCustom: normalizeRoomPanelCustomTextStrict(
      raw.calledTextCustom,
      `panels.${placement}.calledTextCustom`,
      index,
    ),
    arrivedTextPreset: isStringSetMember(ROOM_PANEL_TEXT_PRESET_SET, raw.arrivedTextPreset)
      ? raw.arrivedTextPreset
      : undefined,
    arrivedTextCustom: normalizeRoomPanelCustomTextStrict(
      raw.arrivedTextCustom,
      `panels.${placement}.arrivedTextCustom`,
      index,
    ),
  });
}

function normalizeRoomPanelsSettingsFromDb(
  raw: unknown,
  index: number,
): OpsSettings['rooms'][number]['panels'] {
  if (raw == null) {
    return normalizeRoomPanelsSettings(null);
  }
  if (!isRecord(raw)) {
    throw new OpsSettingsValidationError(`rooms_json entry at index ${index} has invalid panels.`);
  }

  return normalizeRoomPanelsSettings({
    outside: normalizeRoomPanelPlacementConfigFromDb(raw.outside, 'outside', index),
    inside: normalizeRoomPanelPlacementConfigFromDb(raw.inside, 'inside', index),
  });
}

function parseRoomSettings(raw: string | undefined): OpsSettings['rooms'] {
  if (raw == null || raw.trim().length === 0) {
    throw new OpsSettingsValidationError('rooms_json is missing.');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new OpsSettingsValidationError('rooms_json is invalid JSON.');
  }

  if (!Array.isArray(parsed)) {
    throw new OpsSettingsValidationError('rooms_json must be an array.');
  }

  if (parsed.length === 0) {
    throw new OpsSettingsValidationError('rooms_json must contain at least one room.');
  }

  const normalized: OpsSettings['rooms'] = [];
  const seenIds = new Set<string>();
  for (let index = 0; index < parsed.length; index += 1) {
    const entry = parsed[index];
    if (!isRecord(entry)) {
      throw new OpsSettingsValidationError(`rooms_json entry at index ${index} is not an object.`);
    }

    const roomId = typeof entry.roomId === 'string' ? entry.roomId.trim() : '';
    const roomLabel = typeof entry.roomLabel === 'string' ? entry.roomLabel.trim() : '';
    if (roomId.length === 0 || roomLabel.length === 0) {
      throw new OpsSettingsValidationError(
        `rooms_json entry at index ${index} is missing roomId or roomLabel.`,
      );
    }
    if (seenIds.has(roomId)) {
      throw new OpsSettingsValidationError(`rooms_json contains duplicate roomId "${roomId}".`);
    }

    seenIds.add(roomId);
    const maxOccupancyRaw = entry.maxOccupancy;
    if (maxOccupancyRaw != null && parseMaxOccupancy(maxOccupancyRaw) == null) {
      throw new OpsSettingsValidationError(
        `rooms_json entry at index ${index} has invalid maxOccupancy.`,
      );
    }
    normalized.push({
      roomId,
      roomLabel,
      enabled: typeof entry.enabled === 'boolean' ? entry.enabled : true,
      defaultCallTarget: entry.defaultCallTarget === true,
      maxOccupancy: parseMaxOccupancy(maxOccupancyRaw),
      panels: normalizeRoomPanelsSettingsFromDb(entry.panels, index),
    });
  }

  if (normalized.length === 0) {
    throw new OpsSettingsValidationError('rooms_json must contain at least one valid room.');
  }

  return ensureSingleDefaultCallTarget(normalized);
}

export function getOpsSettingsFromDb(params: {
  getOpsSettingsStmt: StatementSync;
  configuredExportBasePath: string | null;
}): OpsSettings {
  const row = params.getOpsSettingsStmt.get() as OpsSettingsRow | undefined;

  if (
    !row?.updatedAt ||
    row.smsProvider == null ||
    row.exportBasePath == null ||
    row.practiceOpenFrom == null ||
    row.practiceOpenTo == null ||
    row.topicSettingsJson == null ||
    row.roomsJson == null ||
    row.contactLookupDelimiterMode == null ||
    row.contactLookupHasHeader == null ||
    row.contactLookupMappingJson == null
  ) {
    throw domainError('OPS_SETTINGS_NOT_INITIALIZED');
  }

  const rooms = parseRoomSettings(row.roomsJson);
  const topics = parseTopicSettingsRaw(row.topicSettingsJson);
  const journeySettings = parseJourneySettingsJson(row.journeySettingsJson);

  return {
    routingMode: normalizeRoutingMode(row.routingMode),
    returnWindowMinutes: row.returnWindowMinutes ?? 15,
    practiceOpenFrom: row.practiceOpenFrom,
    practiceOpenTo: row.practiceOpenTo,
    practiceProfileJson: row.practiceProfileJson ?? '{}',
    topics,
    journeySettings,
    rooms,
    contactLookupFolderPath: row.contactLookupFolderPath ?? null,
    contactLookupDelimiterMode: row.contactLookupDelimiterMode,
    contactLookupHasHeader: row.contactLookupHasHeader === 1,
    contactLookupMappingJson: row.contactLookupMappingJson,
    emergencyEnabled: row.emergencyEnabled === 1,
    terminalWlanPromoEnabled: row.terminalWlanPromoEnabled === 1,
    terminalAuthPhoneEnabled: row.terminalAuthPhoneEnabled === 1,
    terminalAuthNameDobEnabled: row.terminalAuthNameDobEnabled === 1,
    terminalAuthEgkEnabled: row.terminalAuthEgkEnabled === 1,
    terminalPatientLocales: parseTerminalPatientLocalesRaw(row.terminalPatientLocales),
    smsProvider: row.smsProvider,
    exportBasePath: params.configuredExportBasePath ?? row.exportBasePath,
    updatedAt: row.updatedAt,
  };
}

export function updateOpsSettingsInDb(
  params: {
    getOpsSettingsStmt: StatementSync;
    updateOpsSettingsStmt: StatementSync;
    nowIso: () => string;
    configuredExportBasePath: string | null;
  },
  patch: OpsSettingsPatch,
): OpsSettings {
  const current = getOpsSettingsFromDb({
    getOpsSettingsStmt: params.getOpsSettingsStmt,
    configuredExportBasePath: params.configuredExportBasePath,
  });

  const topics = patch.topics ?? current.topics;
  const journeySettings = patch.journeySettings ?? current.journeySettings;
  const rooms = ensureSingleDefaultCallTarget(patch.rooms ?? current.rooms);
  const topicValidation = validateTopicSettings(topics, rooms);
  if (!topicValidation.ok) {
    throw new OpsSettingsValidationError(topicValidation.message);
  }

  const nextRoutingMode = patch.routingMode ?? current.routingMode;
  if (nextRoutingMode === 'complex') {
    const journeyAssignmentValidation = validateTopicJourneyAssignments(topics, journeySettings);
    if (!journeyAssignmentValidation.ok) {
      throw new OpsSettingsValidationError(journeyAssignmentValidation.message);
    }
  }

  const next: OpsSettings = {
    routingMode: nextRoutingMode,
    returnWindowMinutes: patch.returnWindowMinutes ?? current.returnWindowMinutes,
    practiceOpenFrom: patch.practiceOpenFrom ?? current.practiceOpenFrom,
    practiceOpenTo: patch.practiceOpenTo ?? current.practiceOpenTo,
    practiceProfileJson: patch.practiceProfileJson ?? current.practiceProfileJson,
    topics,
    journeySettings,
    rooms,
    contactLookupFolderPath: patch.contactLookupFolderPath ?? current.contactLookupFolderPath,
    contactLookupDelimiterMode:
      patch.contactLookupDelimiterMode ?? current.contactLookupDelimiterMode,
    contactLookupHasHeader: patch.contactLookupHasHeader ?? current.contactLookupHasHeader,
    contactLookupMappingJson: patch.contactLookupMappingJson ?? current.contactLookupMappingJson,
    emergencyEnabled: patch.emergencyEnabled ?? current.emergencyEnabled,
    terminalWlanPromoEnabled: patch.terminalWlanPromoEnabled ?? current.terminalWlanPromoEnabled,
    terminalAuthPhoneEnabled: patch.terminalAuthPhoneEnabled ?? current.terminalAuthPhoneEnabled,
    terminalAuthNameDobEnabled:
      patch.terminalAuthNameDobEnabled ?? current.terminalAuthNameDobEnabled,
    terminalAuthEgkEnabled: patch.terminalAuthEgkEnabled ?? current.terminalAuthEgkEnabled,
    terminalPatientLocales: patch.terminalPatientLocales
      ? normalizeTerminalPatientLocales(patch.terminalPatientLocales)
      : current.terminalPatientLocales,
    smsProvider: patch.smsProvider ?? current.smsProvider,
    exportBasePath: current.exportBasePath,
    updatedAt: params.nowIso(),
  };

  params.updateOpsSettingsStmt.run(
    next.routingMode,
    next.returnWindowMinutes,
    next.practiceOpenFrom,
    next.practiceOpenTo,
    next.practiceProfileJson,
    JSON.stringify(next.topics),
    JSON.stringify(next.journeySettings),
    JSON.stringify(next.rooms),
    next.contactLookupFolderPath,
    next.contactLookupDelimiterMode,
    next.contactLookupHasHeader ? 1 : 0,
    next.contactLookupMappingJson,
    next.emergencyEnabled ? 1 : 0,
    next.terminalWlanPromoEnabled ? 1 : 0,
    next.terminalAuthPhoneEnabled ? 1 : 0,
    next.terminalAuthNameDobEnabled ? 1 : 0,
    next.terminalAuthEgkEnabled ? 1 : 0,
    JSON.stringify(next.terminalPatientLocales),
    next.smsProvider,
    next.exportBasePath,
    next.updatedAt,
  );

  return next;
}
