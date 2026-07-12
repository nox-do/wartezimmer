export { formatTicketCode } from './ticket-code.js';
export type { PracticeProfile } from './practice-profile-types.js';
export {
  DEFAULT_TOPIC_ACCENT,
  defaultAccentForLane,
  isValidTopicAccentColor,
  normalizeTopicAccentColor,
  textColorOnAccent,
  TOPIC_ACCENT_PRESETS,
} from './topic-accent-colors.js';
export {
  isValidConfigurableTopicId,
  MFA_ASSIST_TOPIC_ID,
  MAX_TOPIC_ID_LENGTH,
  slugifyTopicId,
  TOPIC_ID_PATTERN,
} from './topic-id.js';
export {
  isReservedLaneCode,
  isValidLaneCode,
  LANE_CODE_PATTERN,
  MFA_ASSIST_LANE_CODE,
  normalizeLaneCode,
} from './lane-code.js';
export {
  ensureSingleDefaultCallTarget,
  listEnabledRooms,
  resolveDefaultCallRoomId,
  type RoomDefaultTargetSetting,
  type RoomListing,
} from './room-default-call-target.js';
export {
  ROOM_AT_CAPACITY,
  ROOM_BLOCKED_CAPACITY,
  ROOM_OCCUPYING_STATUSES,
  countRoomOccupants,
  countRoomOccupantsExcluding,
  isRoomOccupyingStatus,
  normalizeMaxOccupancy,
  parseMaxOccupancy,
  resolveRoomMaxOccupancy,
  roomHasCapacity,
  type RoomOccupant,
  type RoomOccupantWithId,
  type RoomOccupyingStatus,
  type RoomWithCapacity,
} from './room-capacity.js';
export {
  DEFAULT_TERMINAL_PATIENT_LOCALES,
  OPTIONAL_TERMINAL_PATIENT_LOCALES,
  TERMINAL_PATIENT_LOCALES,
  isTerminalPatientLocale,
  isTerminalPatientLocaleEnabled,
  normalizeTerminalPatientLocales,
  toggleTerminalPatientLocale,
  type TerminalPatientLocale,
} from './terminal-patient-locales.js';
export {
  birthDatesMatch,
  canonicalizeBirthDate,
  getBirthDateIssue,
  isValidBirthDate,
  type BirthDateIssue,
} from './birth-date.js';
export {
  getTerminalPhoneSuffixIssue,
  isValidTerminalPhoneNumber,
  isValidTerminalPhoneSuffix,
  terminalPhoneSuffixDigits,
  TERMINAL_PHONE_PREFIX,
  TERMINAL_PHONE_SUFFIX_MAX,
  TERMINAL_PHONE_SUFFIX_MIN,
  type TerminalPhoneSuffixIssue,
} from './terminal-phone.js';
export {
  getTerminalLastNameIssue,
  hasValidTerminalLastNameChars,
  isAllowedTerminalLastNameChar,
  isValidTerminalLastName,
  TERMINAL_LAST_NAME_MAX_LENGTH,
  type TerminalLastNameIssue,
} from './terminal-last-name.js';
export {
  isValidTopicIconId,
  normalizeTopicIconId,
  TOPIC_ICON_IDS,
  type TopicIconId,
} from './topic-icon-ids.js';
export {
  applyRoomPanelPlacement,
  DEFAULT_ROOM_PANEL_PLACEMENT_CONFIG,
  DEFAULT_ROOM_PANEL_SETTINGS,
  DEFAULT_ROOM_PANELS_SETTINGS,
  listEnabledRoomPanelPlacements,
  normalizeRoomPanelCustomText,
  normalizeRoomPanelPlacementConfig,
  normalizeRoomPanelsSettings,
  roomHasAnyEnabledPanel,
  roomPanelConfigForPlacement,
  roomPanelsOrDefault,
  ROOM_PANEL_CUSTOM_TEXT_MAX_LENGTH,
  ROOM_PANEL_MODES,
  ROOM_PANEL_PLACEMENTS,
  ROOM_PANEL_TEXT_PRESETS,
  type RoomPanelMode,
  type RoomPanelPlacement,
  type RoomPanelPlacementConfig,
  type PartialRoomPanelsSettings,
  type RoomPanelsSettings,
  type RoomWithPanels,
  type RoomPanelTextPreset,
} from './room-panel-settings.js';
export {
  resolveRoomPanelCapabilities,
  roomPanelCanCall,
  roomPanelCanCheckIn,
  roomPanelCanCheckOut,
  roomPanelMayShowPatientNames,
  roomPanelRequiresPin,
  resolveVisitTargetRoomId,
  visitTargetsRoom,
  type RoomPanelCallVisitInput,
  type RoomPanelCapabilities,
  type RoomPanelPolicyInput,
} from './room-panel-policy.js';
