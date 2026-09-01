export type {
  AuthSession,
  DeviceSession,
  DeviceSessionRole,
  RoomPanelSession,
  RoomPanelSessionRole,
  StaffPinHashConfig,
  StaffRole,
  StaffSession,
  StaffSessionAuthConfig,
  StaffSessionManager,
} from './staff-session-types.js';
export {
  assertStaffPinHashConfigSafeForStartup,
  DEFAULT_ROOM_PANEL_PIN_HASH,
  DEFAULT_STAFF_PIN,
  DEFAULT_STAFF_PIN_HASH,
  DEFAULT_STAFF_PIN_HASH_MFA,
  DEFAULT_STAFF_PIN_HASH_OPS,
  getAuthSettingsSeedConfig,
  getStaffSessionAuthConfig,
  hashStaffPinForConfig,
  verifyStaffPin,
} from './staff-pin-auth.js';
export type { CookieSlotRole } from './cookie-slot-role.js';
export { readRequestedCookieSlotRole } from './cookie-slot-role.js';
export {
  DEVICE_AUTHORIZATION_COOKIE_TTL_MS,
  clearDeviceSessionCookie,
  clearRoomPanelSessionCookie,
  clearSessionCookieForSlot,
  clearStaffSessionCookie,
  formatDeviceSessionCookie,
  formatRoomPanelSessionCookie,
  getDeviceSessionCookieName,
  getRoomPanelSessionCookieName,
  getSessionCookieNameForSlot,
  getStaffSessionCookieName,
  readCookieValue,
  readSessionTokenForSlot,
  setDeviceSessionCookie,
  setRoomPanelSessionCookie,
  setStaffSessionCookie,
  withDeviceGrantSetCookie,
} from './staff-session-cookies.js';
export { createStaffSessionManager } from './staff-session-manager.js';
