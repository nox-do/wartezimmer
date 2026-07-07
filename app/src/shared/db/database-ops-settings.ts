import type { StatementSync } from 'node:sqlite';
import { normalizeTerminalPatientLocales } from '@praxis-flow/domain';
import { isValidConfigurableTopicId } from '../checkin-topics.js';
import {
  normalizeTopicSettingsList,
  validateTopicSettings,
  type TopicSetting,
} from '../checkin-topic-settings.js';
import { isRecord } from '../type-guards.js';
import { OpsSettingsValidationError } from './ops-settings-errors.js';
import type {
  OpsSettings,
  RoutingMode,
  RoomPanelMode,
  RoomPanelPlacement,
  RoomPanelTextPreset,
} from './db-types.js';
import { domainError } from '../errors/domain-error.js';
import { ensureSingleDefaultCallTarget } from '@praxis-flow/domain';
import { parseMaxOccupancy } from '../ops/room-capacity.js';

export { ensureSingleDefaultCallTarget };

function isStringSetMember<T extends string>(values: ReadonlySet<T>, value: unknown): value is T {
  return typeof value === 'string' && [...values].some((candidate) => candidate === value);
}

type OpsSettingsRow = {
  routingMode?: string;
  returnWindowMinutes?: number;
  practiceOpenFrom?: string;
  practiceOpenTo?: string;
  practiceProfileJson?: string;
  topicSettingsJson?: string;
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
      iconId:
        typeof entry.iconId === 'string' ? entry.iconId : entry.iconId === null ? null : undefined,
      accentColor: typeof entry.accentColor === 'string' ? entry.accentColor : undefined,
      enabled: typeof entry.enabled === 'boolean' ? entry.enabled : undefined,
      availableFrom:
        typeof entry.availableFrom === 'string'
          ? entry.availableFrom
          : entry.availableFrom === null
            ? null
            : undefined,
      availableTo:
        typeof entry.availableTo === 'string'
          ? entry.availableTo
          : entry.availableTo === null
            ? null
            : undefined,
      sortOrder: typeof entry.sortOrder === 'number' ? entry.sortOrder : undefined,
    });
  }

  return normalizeTopicSettingsList(parsedPartial);
}

export function resolveDefaultCallRoom(
  settings: Pick<OpsSettings, 'rooms'>,
): OpsSettings['rooms'][number] | undefined {
  const enabled = settings.rooms.filter(
    (room) => room.enabled && room.roomId.trim().length > 0 && room.roomLabel.trim().length > 0,
  );
  if (enabled.length === 0) {
    return undefined;
  }
  return enabled.find((room) => room.defaultCallTarget) ?? enabled[0];
}

const ROOM_PANEL_PLACEMENTS = new Set<RoomPanelPlacement>(['outside', 'inside']);
const ROOM_PANEL_MODES = new Set<RoomPanelMode>(['display_only', 'arrival', 'staff_full']);
const ROOM_PANEL_TEXT_PRESETS = new Set<RoomPanelTextPreset>([
  'you_are_right',
  'please_wait_here',
  'please_enter',
  'go_to_reception',
  'custom',
]);
const ROOM_PANEL_CUSTOM_TEXT_MAX_LENGTH = 80;

function normalizeRoomPanelCustomText(
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

function normalizeRoomPanelSettings(
  raw: unknown,
  index: number,
): OpsSettings['rooms'][number]['panel'] {
  if (raw == null) {
    return {
      enabled: false,
      placement: 'outside',
      mode: 'display_only',
      showPatientNames: false,
      calledTextPreset: 'please_enter',
      calledTextCustom: null,
      arrivedTextPreset: 'please_wait_here',
      arrivedTextCustom: null,
    };
  }

  if (!isRecord(raw)) {
    throw new OpsSettingsValidationError(`rooms_json entry at index ${index} has invalid panel.`);
  }

  const legacyMode = raw.mode === 'patient_arrival' ? 'arrival' : raw.mode;
  const mode = isStringSetMember(ROOM_PANEL_MODES, legacyMode) ? legacyMode : 'display_only';
  const inferredPlacement: RoomPanelPlacement =
    mode !== 'display_only' || raw.showPatientNames === true ? 'inside' : 'outside';
  const placement = isStringSetMember(ROOM_PANEL_PLACEMENTS, raw.placement)
    ? raw.placement
    : inferredPlacement;
  const normalizedMode: RoomPanelMode =
    placement === 'outside' && mode === 'staff_full' ? 'arrival' : mode;
  const calledTextPresetRaw = raw.calledTextPreset ?? raw.arrivalTextPreset;
  const calledTextPreset = isStringSetMember(ROOM_PANEL_TEXT_PRESETS, calledTextPresetRaw)
    ? calledTextPresetRaw
    : 'please_enter';
  const arrivedTextPresetRaw = raw.arrivedTextPreset ?? raw.waitingTextPreset;
  const arrivedTextPreset = isStringSetMember(ROOM_PANEL_TEXT_PRESETS, arrivedTextPresetRaw)
    ? arrivedTextPresetRaw
    : 'please_wait_here';

  return {
    enabled: raw.enabled === true,
    placement,
    mode: normalizedMode,
    showPatientNames: placement === 'inside' && raw.showPatientNames === true,
    calledTextPreset,
    calledTextCustom: normalizeRoomPanelCustomText(
      raw.calledTextCustom ?? raw.arrivalTextCustom,
      'panel.calledTextCustom',
      index,
    ),
    arrivedTextPreset,
    arrivedTextCustom: normalizeRoomPanelCustomText(
      raw.arrivedTextCustom ?? raw.waitingTextCustom,
      'panel.arrivedTextCustom',
      index,
    ),
  };
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
      panel: normalizeRoomPanelSettings(entry.panel, index),
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

  return {
    routingMode: normalizeRoutingMode(row.routingMode),
    returnWindowMinutes: row.returnWindowMinutes ?? 15,
    practiceOpenFrom: row.practiceOpenFrom,
    practiceOpenTo: row.practiceOpenTo,
    practiceProfileJson: row.practiceProfileJson ?? '{}',
    topics,
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
  const rooms = ensureSingleDefaultCallTarget(patch.rooms ?? current.rooms);
  const topicValidation = validateTopicSettings(topics, rooms);
  if (!topicValidation.ok) {
    throw new OpsSettingsValidationError(topicValidation.message);
  }

  const next: OpsSettings = {
    routingMode: patch.routingMode ?? current.routingMode,
    returnWindowMinutes: patch.returnWindowMinutes ?? current.returnWindowMinutes,
    practiceOpenFrom: patch.practiceOpenFrom ?? current.practiceOpenFrom,
    practiceOpenTo: patch.practiceOpenTo ?? current.practiceOpenTo,
    practiceProfileJson: patch.practiceProfileJson ?? current.practiceProfileJson,
    topics,
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
    0,
    next.routingMode,
    next.returnWindowMinutes,
    next.practiceOpenFrom,
    next.practiceOpenTo,
    next.practiceProfileJson,
    JSON.stringify(next.topics),
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
