import type { CoreDatabase } from '../../shared/db/database.js';
import type { PatchOpsSettingsBody } from '../../api/ops-openapi-types.js';
export type { PatchOpsOnboardingBody, PatchOpsSettingsBody } from '../../api/ops-openapi-types.js';
import {
  parseContactLookupMappingJsonStrict,
  parseCsvContactLookupMappingOrThrow,
  type CsvContactLookupMapping,
} from '../../shared/contacts/contact-lookup-config.js';
import { validateCsvContactLookupSettings } from '../../shared/contacts/contact-lookup-preview.js';
import { validateTopicSettings, type TopicSetting } from '../../shared/checkin-topic-settings.js';
import { ensureSingleDefaultCallTarget } from '../../shared/db/database-ops-settings.js';
import { normalizeMaxOccupancy } from '../../shared/ops/room-capacity.js';
import { defaultAccentForLane, normalizeTopicAccentColor } from '@praxis-flow/domain';
import {
  mergePracticeProfile,
  parsePracticeProfileJson,
  resolvePracticeProfile,
  serializePracticeProfile,
} from '../../shared/practice/practice-profile.js';
import type { RoomPanelSettings } from '../../shared/db/db-types.js';
import {
  normalizeJourneySettings,
  type JourneySettings,
} from '../../shared/journey-settings.js';

export function toPracticeProfileResponse(practiceProfileJson: string) {
  return resolvePracticeProfile(parsePracticeProfileJson(practiceProfileJson));
}

export function toOpsSettingsResponse(settings: ReturnType<CoreDatabase['getOpsSettings']>) {
  return {
    routingMode: settings.routingMode,
    returnWindowMinutes: settings.returnWindowMinutes,
    practiceOpenFrom: settings.practiceOpenFrom,
    practiceOpenTo: settings.practiceOpenTo,
    topics: settings.topics,
    journeySettings: settings.journeySettings,
    rooms: settings.rooms,
    contactLookupFolderPath: settings.contactLookupFolderPath,
    contactLookupDelimiterMode: settings.contactLookupDelimiterMode,
    contactLookupHasHeader: settings.contactLookupHasHeader,
    contactLookupMapping: parseContactLookupMappingJsonStrict(settings.contactLookupMappingJson),
    emergencyEnabled: settings.emergencyEnabled,
    terminalWlanPromoEnabled: settings.terminalWlanPromoEnabled,
    terminalAuthPhoneEnabled: settings.terminalAuthPhoneEnabled,
    terminalAuthNameDobEnabled: settings.terminalAuthNameDobEnabled,
    terminalAuthEgkEnabled: settings.terminalAuthEgkEnabled,
    terminalPatientLocales: settings.terminalPatientLocales,
    smsProvider: settings.smsProvider,
    exportBasePath: settings.exportBasePath,
    practiceProfile: toPracticeProfileResponse(settings.practiceProfileJson),
    updatedAt: settings.updatedAt,
  };
}

type SettingsPatchError = {
  code: 'INVALID_ARGUMENT';
  message: string;
};

type RoomPatch = NonNullable<PatchOpsSettingsBody['rooms']>[number];

const DEFAULT_ROOM_PANEL_SETTINGS: RoomPanelSettings = {
  enabled: false,
  placement: 'outside',
  mode: 'display_only',
  showPatientNames: false,
  calledTextPreset: 'please_enter',
  calledTextCustom: null,
  arrivedTextPreset: 'please_wait_here',
  arrivedTextCustom: null,
};

function normalizeRoomPanelText(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed.length > 0 ? trimmed.slice(0, 80) : null;
}

function mergeRoomPanelPatch(
  current: RoomPanelSettings | undefined,
  patch: RoomPatch['panel'],
): RoomPanelSettings {
  const base = current ?? DEFAULT_ROOM_PANEL_SETTINGS;
  if (!patch) {
    return base;
  }

  const next: RoomPanelSettings = {
    enabled: patch.enabled ?? base.enabled,
    placement: patch.placement ?? base.placement,
    mode: patch.mode ?? base.mode,
    showPatientNames: patch.showPatientNames ?? base.showPatientNames,
    calledTextPreset: patch.calledTextPreset ?? base.calledTextPreset,
    calledTextCustom:
      patch.calledTextCustom !== undefined
        ? normalizeRoomPanelText(patch.calledTextCustom)
        : base.calledTextCustom,
    arrivedTextPreset: patch.arrivedTextPreset ?? base.arrivedTextPreset,
    arrivedTextCustom:
      patch.arrivedTextCustom !== undefined
        ? normalizeRoomPanelText(patch.arrivedTextCustom)
        : base.arrivedTextCustom,
  };

  if (next.placement === 'outside') {
    return {
      ...next,
      mode: next.mode === 'staff_full' ? 'arrival' : next.mode,
      showPatientNames: false,
    };
  }

  return next;
}

function mergeTopicPatch(
  current: TopicSetting,
  patch: NonNullable<PatchOpsSettingsBody['topics']>[number],
  index: number,
): TopicSetting {
  const laneCode = (patch.laneCode ?? current.laneCode).trim().toUpperCase().slice(0, 1) || 'A';
  return {
    topicId: patch.topicId.trim(),
    label: patch.label?.trim() ?? current.label,
    laneCode,
    defaultRoomId: patch.defaultRoomId?.trim() ?? current.defaultRoomId,
    iconId: patch.iconId === null ? null : (patch.iconId?.trim() ?? current.iconId),
    accentColor: normalizeTopicAccentColor(
      patch.accentColor ?? current.accentColor,
      defaultAccentForLane(laneCode),
    ),
    enabled: patch.enabled ?? current.enabled,
    availableFrom: patch.availableFrom !== undefined ? patch.availableFrom : current.availableFrom,
    availableTo: patch.availableTo !== undefined ? patch.availableTo : current.availableTo,
    sortOrder: patch.sortOrder ?? index + 1,
    journeyTemplateId:
      patch.journeyTemplateId !== undefined ? patch.journeyTemplateId : current.journeyTemplateId,
  };
}

function buildNextTopics(
  currentTopics: TopicSetting[],
  bodyTopics: NonNullable<PatchOpsSettingsBody['topics']>,
): TopicSetting[] | SettingsPatchError {
  const nextTopics: TopicSetting[] = [];

  for (let index = 0; index < bodyTopics.length; index += 1) {
    const topic = bodyTopics[index]!;
    const topicId = topic.topicId.trim();
    const currentTopic = currentTopics.find((entry) => entry.topicId === topicId);
    if (currentTopic) {
      nextTopics.push(mergeTopicPatch(currentTopic, topic, index));
      continue;
    }

    const laneCode = topic.laneCode?.trim().toUpperCase().slice(0, 1) ?? 'A';
    const label = topic.label?.trim() ?? '';
    const defaultRoomId = topic.defaultRoomId?.trim() ?? '';
    if (!label || !defaultRoomId) {
      return {
        code: 'INVALID_ARGUMENT',
        message: `Topic "${topicId}" requires label and defaultRoomId when creating a new topic.`,
      };
    }

    nextTopics.push({
      topicId,
      label,
      laneCode,
      defaultRoomId,
      iconId: topic.iconId === null ? null : topic.iconId?.trim() || null,
      accentColor: normalizeTopicAccentColor(topic.accentColor, defaultAccentForLane(laneCode)),
      enabled: topic.enabled ?? true,
      availableFrom: topic.availableFrom ?? null,
      availableTo: topic.availableTo ?? null,
      sortOrder: topic.sortOrder ?? index + 1,
      journeyTemplateId: topic.journeyTemplateId ?? null,
    });
  }

  return nextTopics;
}

export async function buildOpsSettingsUpdate(
  db: CoreDatabase,
  body: PatchOpsSettingsBody,
): Promise<Parameters<CoreDatabase['updateOpsSettings']>[0] | SettingsPatchError> {
  const current = db.getOpsSettings();
  let nextTopics: TopicSetting[] | undefined;
  if (body.topics) {
    const builtTopics = buildNextTopics(current.topics, body.topics);
    if ('code' in builtTopics) {
      return builtTopics;
    }
    nextTopics = builtTopics;
  }
  const nextRooms = body.rooms
    ? ensureSingleDefaultCallTarget(
        body.rooms.map((room: RoomPatch) => {
          const roomId = room.roomId.trim();
          const currentRoom = current.rooms.find((entry) => entry.roomId === roomId);
          return {
            roomId,
            roomLabel: room.roomLabel.trim(),
            enabled: room.enabled ?? true,
            defaultCallTarget: room.defaultCallTarget === true,
            maxOccupancy: normalizeMaxOccupancy(room.maxOccupancy ?? null),
            panel: mergeRoomPanelPatch(currentRoom?.panel, room.panel),
          };
        }),
        body.rooms.find((room) => room.defaultCallTarget === true)?.roomId?.trim(),
      )
    : undefined;

  const invalidPanel = nextRooms?.find(
    (room) =>
      room.panel?.placement === 'outside' &&
      (room.panel.mode === 'staff_full' || room.panel.showPatientNames),
  );
  if (invalidPanel) {
    return {
      code: 'INVALID_ARGUMENT',
      message: `Room "${invalidPanel.roomId}" has invalid outside panel settings.`,
    };
  }

  let currentMapping: CsvContactLookupMapping;
  try {
    currentMapping = parseContactLookupMappingJsonStrict(current.contactLookupMappingJson);
  } catch {
    return {
      code: 'INVALID_ARGUMENT',
      message: 'CSV contact lookup mapping in database is invalid.',
    };
  }
  const nextFolderPath = body.contactLookupFolderPath ?? current.contactLookupFolderPath;
  const nextDelimiterMode = body.contactLookupDelimiterMode ?? current.contactLookupDelimiterMode;
  const nextHasHeader = body.contactLookupHasHeader ?? current.contactLookupHasHeader;
  let nextMapping: CsvContactLookupMapping;
  try {
    nextMapping = body.contactLookupMapping
      ? parseCsvContactLookupMappingOrThrow(body.contactLookupMapping)
      : currentMapping;
  } catch {
    return {
      code: 'INVALID_ARGUMENT',
      message: 'CSV contact lookup mapping is invalid.',
    };
  }

  if (nextFolderPath) {
    try {
      await validateCsvContactLookupSettings({
        folderPath: nextFolderPath,
        delimiterMode: nextDelimiterMode,
        hasHeader: nextHasHeader,
        mapping: nextMapping,
      });
    } catch {
      return {
        code: 'INVALID_ARGUMENT',
        message:
          'CSV contact lookup settings are invalid or import folder is not readable with the selected mapping.',
      };
    }
  }

  if (nextTopics) {
    const roomsForValidation = nextRooms ?? current.rooms;
    const topicValidation = validateTopicSettings(nextTopics, roomsForValidation);
    if (!topicValidation.ok) {
      return {
        code: 'INVALID_ARGUMENT',
        message: topicValidation.message,
      };
    }
  }

  let practiceProfileJson: string | undefined;
  if (body.practiceProfile) {
    const currentProfile = parsePracticeProfileJson(current.practiceProfileJson);
    const mergedProfile = mergePracticeProfile(currentProfile, body.practiceProfile);
    if (!mergedProfile.displayName.trim()) {
      return {
        code: 'INVALID_ARGUMENT',
        message: 'Practice profile requires displayName.',
      };
    }
    practiceProfileJson = serializePracticeProfile(mergedProfile);
  }

  if (body.returnWindowMinutes != null) {
    const value = body.returnWindowMinutes;
    if (!Number.isInteger(value) || value < 1 || value > 240) {
      return {
        code: 'INVALID_ARGUMENT',
        message: 'returnWindowMinutes must be between 1 and 240.',
      };
    }
  }

  if (body.routingMode != null && body.routingMode !== 'simple' && body.routingMode !== 'complex') {
    return {
      code: 'INVALID_ARGUMENT',
      message: 'routingMode must be simple or complex.',
    };
  }

  let journeySettings: JourneySettings | undefined;
  if (body.journeySettings != null) {
    try {
      journeySettings = normalizeJourneySettings(body.journeySettings);
    } catch {
      return {
        code: 'INVALID_ARGUMENT',
        message: 'journeySettings is invalid.',
      };
    }
  }

  return {
    routingMode: body.routingMode,
    returnWindowMinutes: body.returnWindowMinutes,
    practiceOpenFrom: body.practiceOpenFrom,
    practiceOpenTo: body.practiceOpenTo,
    practiceProfileJson,
    topics: nextTopics,
    journeySettings,
    rooms: nextRooms,
    contactLookupFolderPath: body.contactLookupFolderPath,
    contactLookupDelimiterMode: body.contactLookupDelimiterMode,
    contactLookupHasHeader: body.contactLookupHasHeader,
    contactLookupMappingJson: body.contactLookupMapping ? JSON.stringify(nextMapping) : undefined,
    emergencyEnabled: body.emergencyEnabled,
    terminalWlanPromoEnabled: body.terminalWlanPromoEnabled,
    terminalAuthPhoneEnabled: body.terminalAuthPhoneEnabled,
    terminalAuthNameDobEnabled: body.terminalAuthNameDobEnabled,
    terminalAuthEgkEnabled: body.terminalAuthEgkEnabled,
    terminalPatientLocales: body.terminalPatientLocales,
    smsProvider: body.smsProvider,
  };
}
