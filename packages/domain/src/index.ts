export { formatTicketCode } from './ticket-code.js';
export type { PracticeProfile } from './practice-profile-types.js';
export {
  formatConsentWithdrawalParagraph,
  formatControllerParagraph,
  formatDeviceStorageParagraph,
  formatLegalBasisAnamnese,
  formatLegalBasisCheckin,
  formatLegalBasisPortal,
  formatLegalBasisUpload,
  formatPracticeAddress,
  formatPrivacyObjectionParagraph,
  formatPrivacyRightsContactRef,
  formatPrivacyRightsParagraph,
  PRIVACY_LOCAL_PROCESSING,
  PRIVACY_RETENTION_DAY,
  PRIVACY_SCOPE_INTRO,
} from './practice-privacy-copy.js';
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
