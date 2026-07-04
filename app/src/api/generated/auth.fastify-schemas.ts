/**
 * AUTO-GENERATED from openapi/auth.yaml — do not edit.
 * Run: npm run generate:api-schemas
 */

export const StaffRole = {
  type: 'string',
  enum: ['mfa', 'ops'],
} as const;

export const StaffLoginRequest = {
  type: 'object',
  required: ['pin'],
  additionalProperties: false,
  properties: {
    pin: {
      type: 'string',
      minLength: 1,
      maxLength: 128,
    },
    role: {
      default: 'mfa',
      type: 'string',
      enum: ['mfa', 'ops'],
    },
  },
} as const;

export const StaffSessionResponse = {
  type: 'object',
  required: ['ok', 'sessionId', 'role', 'expiresAt'],
  properties: {
    ok: {
      type: 'boolean',
      const: true,
    },
    sessionId: {
      type: 'string',
    },
    role: {
      type: 'string',
      enum: ['mfa', 'ops'],
    },
    expiresAt: {
      type: 'string',
      format: 'date-time',
    },
  },
} as const;

export const RoomPanelMode = {
  type: 'string',
  enum: ['display_only', 'arrival', 'staff_full'],
} as const;

export const RoomPanelPlacement = {
  type: 'string',
  enum: ['outside', 'inside'],
} as const;

export const RoomPanelRoom = {
  type: 'object',
  additionalProperties: false,
  required: ['roomId', 'roomLabel', 'placement', 'mode', 'requiresPin'],
  properties: {
    roomId: {
      type: 'string',
    },
    roomLabel: {
      type: 'string',
    },
    placement: {
      type: 'string',
      enum: ['outside', 'inside'],
    },
    mode: {
      type: 'string',
      enum: ['display_only', 'arrival', 'staff_full'],
    },
    requiresPin: {
      type: 'boolean',
    },
  },
} as const;

export const RoomPanelRoomsResponse = {
  type: 'object',
  additionalProperties: false,
  required: ['rooms'],
  properties: {
    rooms: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['roomId', 'roomLabel', 'placement', 'mode', 'requiresPin'],
        properties: {
          roomId: {
            type: 'string',
          },
          roomLabel: {
            type: 'string',
          },
          placement: {
            type: 'string',
            enum: ['outside', 'inside'],
          },
          mode: {
            type: 'string',
            enum: ['display_only', 'arrival', 'staff_full'],
          },
          requiresPin: {
            type: 'boolean',
          },
        },
      },
    },
  },
} as const;

export const RoomPanelLoginRequest = {
  type: 'object',
  additionalProperties: false,
  required: ['roomId', 'pin'],
  properties: {
    roomId: {
      type: 'string',
      minLength: 1,
      maxLength: 64,
    },
    pin: {
      type: 'string',
      minLength: 0,
      maxLength: 128,
    },
  },
} as const;

export const RoomPanelSessionResponse = {
  type: 'object',
  additionalProperties: false,
  required: ['ok', 'sessionId', 'role', 'roomId', 'placement', 'expiresAt'],
  properties: {
    ok: {
      type: 'boolean',
      const: true,
    },
    sessionId: {
      type: 'string',
    },
    role: {
      type: 'string',
      const: 'room-panel',
    },
    roomId: {
      type: 'string',
    },
    placement: {
      type: 'string',
      enum: ['outside', 'inside'],
    },
    expiresAt: {
      type: 'string',
      format: 'date-time',
    },
  },
} as const;

export const AuthPinTarget = {
  type: 'string',
  enum: ['mfa', 'ops', 'room-panel'],
} as const;

export const ChangePinRequest = {
  type: 'object',
  additionalProperties: false,
  required: ['currentPin', 'newPin', 'target'],
  properties: {
    currentPin: {
      type: 'string',
      minLength: 1,
      maxLength: 128,
    },
    newPin: {
      type: 'string',
      minLength: 4,
      maxLength: 32,
    },
    target: {
      type: 'string',
      enum: ['mfa', 'ops', 'room-panel'],
    },
  },
} as const;

export const ChangePinResponse = {
  type: 'object',
  additionalProperties: false,
  required: ['ok', 'target', 'updatedAt'],
  properties: {
    ok: {
      type: 'boolean',
      const: true,
    },
    target: {
      type: 'string',
      enum: ['mfa', 'ops', 'room-panel'],
    },
    updatedAt: {
      type: 'string',
      format: 'date-time',
    },
  },
} as const;

export const LogoutResponse = {
  type: 'object',
  required: ['ok'],
  properties: {
    ok: {
      type: 'boolean',
      const: true,
    },
  },
} as const;

export const DevicePairingStartRequest = {
  type: 'object',
  additionalProperties: false,
  properties: {
    displayId: {
      type: 'string',
      minLength: 1,
      maxLength: 80,
    },
  },
} as const;

export const DevicePairingStartResponse = {
  type: 'object',
  required: ['pairingId', 'code', 'expiresAt', 'status'],
  properties: {
    pairingId: {
      type: 'string',
    },
    code: {
      type: 'string',
      pattern: '^[0-9]{4}$',
    },
    expiresAt: {
      type: 'string',
      format: 'date-time',
    },
    status: {
      type: 'string',
      const: 'pending',
    },
  },
} as const;

export const DevicePairingStatusResponse = {
  type: 'object',
  required: ['pairingId', 'status', 'paired'],
  properties: {
    pairingId: {
      type: 'string',
    },
    status: {
      type: 'string',
      enum: ['pending', 'paired', 'expired'],
    },
    paired: {
      type: 'boolean',
    },
    expiresAt: {
      type: 'string',
      format: 'date-time',
    },
    sessionId: {
      type: 'string',
    },
  },
} as const;

export const DevicePairingConfirmRequest = {
  type: 'object',
  required: ['code'],
  additionalProperties: false,
  properties: {
    code: {
      type: 'string',
      pattern: '^[0-9]{4}$',
    },
  },
} as const;

export const DevicePairingConfirmResponse = {
  type: 'object',
  required: ['ok', 'pairingId', 'status'],
  properties: {
    ok: {
      type: 'boolean',
      const: true,
    },
    pairingId: {
      type: 'string',
    },
    status: {
      type: 'string',
      enum: ['paired', 'already_paired'],
    },
  },
} as const;

export const POST_api_v1_auth_loginRequestBody = {
  type: 'object',
  required: ['pin'],
  additionalProperties: false,
  properties: {
    pin: {
      type: 'string',
      minLength: 1,
      maxLength: 128,
    },
    role: {
      default: 'mfa',
      type: 'string',
      enum: ['mfa', 'ops'],
    },
  },
} as const;

export const POST_api_v1_auth_loginResponse200 = {
  type: 'object',
  required: ['ok', 'sessionId', 'role', 'expiresAt'],
  properties: {
    ok: {
      type: 'boolean',
      const: true,
    },
    sessionId: {
      type: 'string',
    },
    role: {
      type: 'string',
      enum: ['mfa', 'ops'],
    },
    expiresAt: {
      type: 'string',
      format: 'date-time',
    },
  },
} as const;

export const POST_api_v1_auth_loginResponse401 = {
  type: 'object',
  required: ['code', 'message'],
  properties: {
    code: {
      type: 'string',
      enum: [
        'INVALID_ARGUMENT',
        'INTERNAL_ERROR',
        'NOT_FOUND',
        'AUTH_UNAUTHORIZED',
        'AUTH_FORBIDDEN',
        'RATE_LIMITED',
        'TICKET_NOT_FOUND',
        'DOCUMENT_NOT_FOUND',
        'DOCUMENT_FORBIDDEN',
        'INVALID_TRANSITION',
        'ROOM_REQUIRED',
        'MISSING_CALLBACK_PHONE',
        'CHECKIN_LOCK_REQUIRED',
        'DAY_CLOSE_IN_PROGRESS',
        'INVALID_DAY_CLOSE_PHASE',
        'DAY_CLOSE_NOT_STARTED',
        'UNKNOWN_MESSAGING_PROVIDER',
        'CHECKIN_LOCKED',
        'CHECKIN_AUTH_PATH_DISABLED',
        'CHECKIN_CLOSED',
        'TOPIC_DISABLED',
        'TOPIC_CLOSED',
        'DOCUMENT_NOT_SCANNED',
        'EXPORT_BLOCKED_MALWARE',
        'OPS_SETTINGS_INVALID',
        'EMERGENCY_DISABLED',
        'EMERGENCY_NOT_FOUND',
        'SETUP_INCOMPLETE',
        'SETUP_ALREADY_COMPLETED',
        'SESSION_INVALID_TICKET',
        'SESSION_TICKET_NOT_ACTIVE',
        'SESSION_ALREADY_ACTIVE',
        'SESSION_UNAUTHORIZED',
        'SESSION_EXPIRED',
        'FORM_TEMPLATE_NOT_FOUND',
        'DOCUMENT_INTAKE_BLOCKED',
        'DOCUMENT_TEMPLATE_METADATA_INVALID',
        'DOCUMENT_SCHEMA_OUTDATED',
        'SANDBOX_UNAVAILABLE',
        'CAPTIVE_CLIENT_MISSING',
        'CAPTIVE_AUTH_FAILED',
        'CALL_ANNOUNCEMENT_OFFLINE',
        'ROOM_AT_CAPACITY',
        'ROOM_BLOCKED_TOPICS',
        'ROOM_BLOCKED_QUEUE',
        'ROOM_BLOCKED_CAPACITY',
        'RECALL_NOTIFY_RETRY_NOT_ALLOWED',
        'RECALL_WINDOW_EXPIRED',
        'UNKNOWN_TOPIC',
        'TERMINAL_OFFLINE',
        'TERMINAL_PHONE_INVALID',
        'TERMINAL_BIRTH_DATE_INVALID',
        'TERMINAL_LAST_NAME_INVALID',
      ],
    },
    message: {
      type: 'string',
    },
    details: {
      type: 'object',
      additionalProperties: true,
    },
  },
} as const;

export const POST_api_v1_auth_loginResponse429 = {
  type: 'object',
  required: ['code', 'message'],
  properties: {
    code: {
      type: 'string',
      enum: [
        'INVALID_ARGUMENT',
        'INTERNAL_ERROR',
        'NOT_FOUND',
        'AUTH_UNAUTHORIZED',
        'AUTH_FORBIDDEN',
        'RATE_LIMITED',
        'TICKET_NOT_FOUND',
        'DOCUMENT_NOT_FOUND',
        'DOCUMENT_FORBIDDEN',
        'INVALID_TRANSITION',
        'ROOM_REQUIRED',
        'MISSING_CALLBACK_PHONE',
        'CHECKIN_LOCK_REQUIRED',
        'DAY_CLOSE_IN_PROGRESS',
        'INVALID_DAY_CLOSE_PHASE',
        'DAY_CLOSE_NOT_STARTED',
        'UNKNOWN_MESSAGING_PROVIDER',
        'CHECKIN_LOCKED',
        'CHECKIN_AUTH_PATH_DISABLED',
        'CHECKIN_CLOSED',
        'TOPIC_DISABLED',
        'TOPIC_CLOSED',
        'DOCUMENT_NOT_SCANNED',
        'EXPORT_BLOCKED_MALWARE',
        'OPS_SETTINGS_INVALID',
        'EMERGENCY_DISABLED',
        'EMERGENCY_NOT_FOUND',
        'SETUP_INCOMPLETE',
        'SETUP_ALREADY_COMPLETED',
        'SESSION_INVALID_TICKET',
        'SESSION_TICKET_NOT_ACTIVE',
        'SESSION_ALREADY_ACTIVE',
        'SESSION_UNAUTHORIZED',
        'SESSION_EXPIRED',
        'FORM_TEMPLATE_NOT_FOUND',
        'DOCUMENT_INTAKE_BLOCKED',
        'DOCUMENT_TEMPLATE_METADATA_INVALID',
        'DOCUMENT_SCHEMA_OUTDATED',
        'SANDBOX_UNAVAILABLE',
        'CAPTIVE_CLIENT_MISSING',
        'CAPTIVE_AUTH_FAILED',
        'CALL_ANNOUNCEMENT_OFFLINE',
        'ROOM_AT_CAPACITY',
        'ROOM_BLOCKED_TOPICS',
        'ROOM_BLOCKED_QUEUE',
        'ROOM_BLOCKED_CAPACITY',
        'RECALL_NOTIFY_RETRY_NOT_ALLOWED',
        'RECALL_WINDOW_EXPIRED',
        'UNKNOWN_TOPIC',
        'TERMINAL_OFFLINE',
        'TERMINAL_PHONE_INVALID',
        'TERMINAL_BIRTH_DATE_INVALID',
        'TERMINAL_LAST_NAME_INVALID',
      ],
    },
    message: {
      type: 'string',
    },
    details: {
      type: 'object',
      additionalProperties: true,
    },
  },
} as const;

export const GET_api_v1_auth_meResponse200 = {
  type: 'object',
  required: ['ok', 'sessionId', 'role', 'expiresAt'],
  properties: {
    ok: {
      type: 'boolean',
      const: true,
    },
    sessionId: {
      type: 'string',
    },
    role: {
      type: 'string',
      enum: ['mfa', 'ops'],
    },
    expiresAt: {
      type: 'string',
      format: 'date-time',
    },
  },
} as const;

export const GET_api_v1_auth_meResponse401 = {
  type: 'object',
  required: ['code', 'message'],
  properties: {
    code: {
      type: 'string',
      enum: [
        'INVALID_ARGUMENT',
        'INTERNAL_ERROR',
        'NOT_FOUND',
        'AUTH_UNAUTHORIZED',
        'AUTH_FORBIDDEN',
        'RATE_LIMITED',
        'TICKET_NOT_FOUND',
        'DOCUMENT_NOT_FOUND',
        'DOCUMENT_FORBIDDEN',
        'INVALID_TRANSITION',
        'ROOM_REQUIRED',
        'MISSING_CALLBACK_PHONE',
        'CHECKIN_LOCK_REQUIRED',
        'DAY_CLOSE_IN_PROGRESS',
        'INVALID_DAY_CLOSE_PHASE',
        'DAY_CLOSE_NOT_STARTED',
        'UNKNOWN_MESSAGING_PROVIDER',
        'CHECKIN_LOCKED',
        'CHECKIN_AUTH_PATH_DISABLED',
        'CHECKIN_CLOSED',
        'TOPIC_DISABLED',
        'TOPIC_CLOSED',
        'DOCUMENT_NOT_SCANNED',
        'EXPORT_BLOCKED_MALWARE',
        'OPS_SETTINGS_INVALID',
        'EMERGENCY_DISABLED',
        'EMERGENCY_NOT_FOUND',
        'SETUP_INCOMPLETE',
        'SETUP_ALREADY_COMPLETED',
        'SESSION_INVALID_TICKET',
        'SESSION_TICKET_NOT_ACTIVE',
        'SESSION_ALREADY_ACTIVE',
        'SESSION_UNAUTHORIZED',
        'SESSION_EXPIRED',
        'FORM_TEMPLATE_NOT_FOUND',
        'DOCUMENT_INTAKE_BLOCKED',
        'DOCUMENT_TEMPLATE_METADATA_INVALID',
        'DOCUMENT_SCHEMA_OUTDATED',
        'SANDBOX_UNAVAILABLE',
        'CAPTIVE_CLIENT_MISSING',
        'CAPTIVE_AUTH_FAILED',
        'CALL_ANNOUNCEMENT_OFFLINE',
        'ROOM_AT_CAPACITY',
        'ROOM_BLOCKED_TOPICS',
        'ROOM_BLOCKED_QUEUE',
        'ROOM_BLOCKED_CAPACITY',
        'RECALL_NOTIFY_RETRY_NOT_ALLOWED',
        'RECALL_WINDOW_EXPIRED',
        'UNKNOWN_TOPIC',
        'TERMINAL_OFFLINE',
        'TERMINAL_PHONE_INVALID',
        'TERMINAL_BIRTH_DATE_INVALID',
        'TERMINAL_LAST_NAME_INVALID',
      ],
    },
    message: {
      type: 'string',
    },
    details: {
      type: 'object',
      additionalProperties: true,
    },
  },
} as const;

export const GET_api_v1_auth_room_panel_roomsResponse200 = {
  type: 'object',
  additionalProperties: false,
  required: ['rooms'],
  properties: {
    rooms: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['roomId', 'roomLabel', 'placement', 'mode', 'requiresPin'],
        properties: {
          roomId: {
            type: 'string',
          },
          roomLabel: {
            type: 'string',
          },
          placement: {
            type: 'string',
            enum: ['outside', 'inside'],
          },
          mode: {
            type: 'string',
            enum: ['display_only', 'arrival', 'staff_full'],
          },
          requiresPin: {
            type: 'boolean',
          },
        },
      },
    },
  },
} as const;

export const POST_api_v1_auth_room_panel_loginRequestBody = {
  type: 'object',
  additionalProperties: false,
  required: ['roomId', 'pin'],
  properties: {
    roomId: {
      type: 'string',
      minLength: 1,
      maxLength: 64,
    },
    pin: {
      type: 'string',
      minLength: 0,
      maxLength: 128,
    },
  },
} as const;

export const POST_api_v1_auth_room_panel_loginResponse200 = {
  type: 'object',
  additionalProperties: false,
  required: ['ok', 'sessionId', 'role', 'roomId', 'placement', 'expiresAt'],
  properties: {
    ok: {
      type: 'boolean',
      const: true,
    },
    sessionId: {
      type: 'string',
    },
    role: {
      type: 'string',
      const: 'room-panel',
    },
    roomId: {
      type: 'string',
    },
    placement: {
      type: 'string',
      enum: ['outside', 'inside'],
    },
    expiresAt: {
      type: 'string',
      format: 'date-time',
    },
  },
} as const;

export const POST_api_v1_auth_room_panel_loginResponse401 = {
  type: 'object',
  required: ['code', 'message'],
  properties: {
    code: {
      type: 'string',
      enum: [
        'INVALID_ARGUMENT',
        'INTERNAL_ERROR',
        'NOT_FOUND',
        'AUTH_UNAUTHORIZED',
        'AUTH_FORBIDDEN',
        'RATE_LIMITED',
        'TICKET_NOT_FOUND',
        'DOCUMENT_NOT_FOUND',
        'DOCUMENT_FORBIDDEN',
        'INVALID_TRANSITION',
        'ROOM_REQUIRED',
        'MISSING_CALLBACK_PHONE',
        'CHECKIN_LOCK_REQUIRED',
        'DAY_CLOSE_IN_PROGRESS',
        'INVALID_DAY_CLOSE_PHASE',
        'DAY_CLOSE_NOT_STARTED',
        'UNKNOWN_MESSAGING_PROVIDER',
        'CHECKIN_LOCKED',
        'CHECKIN_AUTH_PATH_DISABLED',
        'CHECKIN_CLOSED',
        'TOPIC_DISABLED',
        'TOPIC_CLOSED',
        'DOCUMENT_NOT_SCANNED',
        'EXPORT_BLOCKED_MALWARE',
        'OPS_SETTINGS_INVALID',
        'EMERGENCY_DISABLED',
        'EMERGENCY_NOT_FOUND',
        'SETUP_INCOMPLETE',
        'SETUP_ALREADY_COMPLETED',
        'SESSION_INVALID_TICKET',
        'SESSION_TICKET_NOT_ACTIVE',
        'SESSION_ALREADY_ACTIVE',
        'SESSION_UNAUTHORIZED',
        'SESSION_EXPIRED',
        'FORM_TEMPLATE_NOT_FOUND',
        'DOCUMENT_INTAKE_BLOCKED',
        'DOCUMENT_TEMPLATE_METADATA_INVALID',
        'DOCUMENT_SCHEMA_OUTDATED',
        'SANDBOX_UNAVAILABLE',
        'CAPTIVE_CLIENT_MISSING',
        'CAPTIVE_AUTH_FAILED',
        'CALL_ANNOUNCEMENT_OFFLINE',
        'ROOM_AT_CAPACITY',
        'ROOM_BLOCKED_TOPICS',
        'ROOM_BLOCKED_QUEUE',
        'ROOM_BLOCKED_CAPACITY',
        'RECALL_NOTIFY_RETRY_NOT_ALLOWED',
        'RECALL_WINDOW_EXPIRED',
        'UNKNOWN_TOPIC',
        'TERMINAL_OFFLINE',
        'TERMINAL_PHONE_INVALID',
        'TERMINAL_BIRTH_DATE_INVALID',
        'TERMINAL_LAST_NAME_INVALID',
      ],
    },
    message: {
      type: 'string',
    },
    details: {
      type: 'object',
      additionalProperties: true,
    },
  },
} as const;

export const POST_api_v1_auth_room_panel_loginResponse404 = {
  type: 'object',
  required: ['code', 'message'],
  properties: {
    code: {
      type: 'string',
      enum: [
        'INVALID_ARGUMENT',
        'INTERNAL_ERROR',
        'NOT_FOUND',
        'AUTH_UNAUTHORIZED',
        'AUTH_FORBIDDEN',
        'RATE_LIMITED',
        'TICKET_NOT_FOUND',
        'DOCUMENT_NOT_FOUND',
        'DOCUMENT_FORBIDDEN',
        'INVALID_TRANSITION',
        'ROOM_REQUIRED',
        'MISSING_CALLBACK_PHONE',
        'CHECKIN_LOCK_REQUIRED',
        'DAY_CLOSE_IN_PROGRESS',
        'INVALID_DAY_CLOSE_PHASE',
        'DAY_CLOSE_NOT_STARTED',
        'UNKNOWN_MESSAGING_PROVIDER',
        'CHECKIN_LOCKED',
        'CHECKIN_AUTH_PATH_DISABLED',
        'CHECKIN_CLOSED',
        'TOPIC_DISABLED',
        'TOPIC_CLOSED',
        'DOCUMENT_NOT_SCANNED',
        'EXPORT_BLOCKED_MALWARE',
        'OPS_SETTINGS_INVALID',
        'EMERGENCY_DISABLED',
        'EMERGENCY_NOT_FOUND',
        'SETUP_INCOMPLETE',
        'SETUP_ALREADY_COMPLETED',
        'SESSION_INVALID_TICKET',
        'SESSION_TICKET_NOT_ACTIVE',
        'SESSION_ALREADY_ACTIVE',
        'SESSION_UNAUTHORIZED',
        'SESSION_EXPIRED',
        'FORM_TEMPLATE_NOT_FOUND',
        'DOCUMENT_INTAKE_BLOCKED',
        'DOCUMENT_TEMPLATE_METADATA_INVALID',
        'DOCUMENT_SCHEMA_OUTDATED',
        'SANDBOX_UNAVAILABLE',
        'CAPTIVE_CLIENT_MISSING',
        'CAPTIVE_AUTH_FAILED',
        'CALL_ANNOUNCEMENT_OFFLINE',
        'ROOM_AT_CAPACITY',
        'ROOM_BLOCKED_TOPICS',
        'ROOM_BLOCKED_QUEUE',
        'ROOM_BLOCKED_CAPACITY',
        'RECALL_NOTIFY_RETRY_NOT_ALLOWED',
        'RECALL_WINDOW_EXPIRED',
        'UNKNOWN_TOPIC',
        'TERMINAL_OFFLINE',
        'TERMINAL_PHONE_INVALID',
        'TERMINAL_BIRTH_DATE_INVALID',
        'TERMINAL_LAST_NAME_INVALID',
      ],
    },
    message: {
      type: 'string',
    },
    details: {
      type: 'object',
      additionalProperties: true,
    },
  },
} as const;

export const POST_api_v1_auth_room_panel_loginResponse429 = {
  type: 'object',
  required: ['code', 'message'],
  properties: {
    code: {
      type: 'string',
      enum: [
        'INVALID_ARGUMENT',
        'INTERNAL_ERROR',
        'NOT_FOUND',
        'AUTH_UNAUTHORIZED',
        'AUTH_FORBIDDEN',
        'RATE_LIMITED',
        'TICKET_NOT_FOUND',
        'DOCUMENT_NOT_FOUND',
        'DOCUMENT_FORBIDDEN',
        'INVALID_TRANSITION',
        'ROOM_REQUIRED',
        'MISSING_CALLBACK_PHONE',
        'CHECKIN_LOCK_REQUIRED',
        'DAY_CLOSE_IN_PROGRESS',
        'INVALID_DAY_CLOSE_PHASE',
        'DAY_CLOSE_NOT_STARTED',
        'UNKNOWN_MESSAGING_PROVIDER',
        'CHECKIN_LOCKED',
        'CHECKIN_AUTH_PATH_DISABLED',
        'CHECKIN_CLOSED',
        'TOPIC_DISABLED',
        'TOPIC_CLOSED',
        'DOCUMENT_NOT_SCANNED',
        'EXPORT_BLOCKED_MALWARE',
        'OPS_SETTINGS_INVALID',
        'EMERGENCY_DISABLED',
        'EMERGENCY_NOT_FOUND',
        'SETUP_INCOMPLETE',
        'SETUP_ALREADY_COMPLETED',
        'SESSION_INVALID_TICKET',
        'SESSION_TICKET_NOT_ACTIVE',
        'SESSION_ALREADY_ACTIVE',
        'SESSION_UNAUTHORIZED',
        'SESSION_EXPIRED',
        'FORM_TEMPLATE_NOT_FOUND',
        'DOCUMENT_INTAKE_BLOCKED',
        'DOCUMENT_TEMPLATE_METADATA_INVALID',
        'DOCUMENT_SCHEMA_OUTDATED',
        'SANDBOX_UNAVAILABLE',
        'CAPTIVE_CLIENT_MISSING',
        'CAPTIVE_AUTH_FAILED',
        'CALL_ANNOUNCEMENT_OFFLINE',
        'ROOM_AT_CAPACITY',
        'ROOM_BLOCKED_TOPICS',
        'ROOM_BLOCKED_QUEUE',
        'ROOM_BLOCKED_CAPACITY',
        'RECALL_NOTIFY_RETRY_NOT_ALLOWED',
        'RECALL_WINDOW_EXPIRED',
        'UNKNOWN_TOPIC',
        'TERMINAL_OFFLINE',
        'TERMINAL_PHONE_INVALID',
        'TERMINAL_BIRTH_DATE_INVALID',
        'TERMINAL_LAST_NAME_INVALID',
      ],
    },
    message: {
      type: 'string',
    },
    details: {
      type: 'object',
      additionalProperties: true,
    },
  },
} as const;

export const POST_api_v1_auth_pin_changeRequestBody = {
  type: 'object',
  additionalProperties: false,
  required: ['currentPin', 'newPin', 'target'],
  properties: {
    currentPin: {
      type: 'string',
      minLength: 1,
      maxLength: 128,
    },
    newPin: {
      type: 'string',
      minLength: 4,
      maxLength: 32,
    },
    target: {
      type: 'string',
      enum: ['mfa', 'ops', 'room-panel'],
    },
  },
} as const;

export const POST_api_v1_auth_pin_changeResponse200 = {
  type: 'object',
  additionalProperties: false,
  required: ['ok', 'target', 'updatedAt'],
  properties: {
    ok: {
      type: 'boolean',
      const: true,
    },
    target: {
      type: 'string',
      enum: ['mfa', 'ops', 'room-panel'],
    },
    updatedAt: {
      type: 'string',
      format: 'date-time',
    },
  },
} as const;

export const POST_api_v1_auth_pin_changeResponse400 = {
  type: 'object',
  required: ['code', 'message'],
  properties: {
    code: {
      type: 'string',
      enum: [
        'INVALID_ARGUMENT',
        'INTERNAL_ERROR',
        'NOT_FOUND',
        'AUTH_UNAUTHORIZED',
        'AUTH_FORBIDDEN',
        'RATE_LIMITED',
        'TICKET_NOT_FOUND',
        'DOCUMENT_NOT_FOUND',
        'DOCUMENT_FORBIDDEN',
        'INVALID_TRANSITION',
        'ROOM_REQUIRED',
        'MISSING_CALLBACK_PHONE',
        'CHECKIN_LOCK_REQUIRED',
        'DAY_CLOSE_IN_PROGRESS',
        'INVALID_DAY_CLOSE_PHASE',
        'DAY_CLOSE_NOT_STARTED',
        'UNKNOWN_MESSAGING_PROVIDER',
        'CHECKIN_LOCKED',
        'CHECKIN_AUTH_PATH_DISABLED',
        'CHECKIN_CLOSED',
        'TOPIC_DISABLED',
        'TOPIC_CLOSED',
        'DOCUMENT_NOT_SCANNED',
        'EXPORT_BLOCKED_MALWARE',
        'OPS_SETTINGS_INVALID',
        'EMERGENCY_DISABLED',
        'EMERGENCY_NOT_FOUND',
        'SETUP_INCOMPLETE',
        'SETUP_ALREADY_COMPLETED',
        'SESSION_INVALID_TICKET',
        'SESSION_TICKET_NOT_ACTIVE',
        'SESSION_ALREADY_ACTIVE',
        'SESSION_UNAUTHORIZED',
        'SESSION_EXPIRED',
        'FORM_TEMPLATE_NOT_FOUND',
        'DOCUMENT_INTAKE_BLOCKED',
        'DOCUMENT_TEMPLATE_METADATA_INVALID',
        'DOCUMENT_SCHEMA_OUTDATED',
        'SANDBOX_UNAVAILABLE',
        'CAPTIVE_CLIENT_MISSING',
        'CAPTIVE_AUTH_FAILED',
        'CALL_ANNOUNCEMENT_OFFLINE',
        'ROOM_AT_CAPACITY',
        'ROOM_BLOCKED_TOPICS',
        'ROOM_BLOCKED_QUEUE',
        'ROOM_BLOCKED_CAPACITY',
        'RECALL_NOTIFY_RETRY_NOT_ALLOWED',
        'RECALL_WINDOW_EXPIRED',
        'UNKNOWN_TOPIC',
        'TERMINAL_OFFLINE',
        'TERMINAL_PHONE_INVALID',
        'TERMINAL_BIRTH_DATE_INVALID',
        'TERMINAL_LAST_NAME_INVALID',
      ],
    },
    message: {
      type: 'string',
    },
    details: {
      type: 'object',
      additionalProperties: true,
    },
  },
} as const;

export const POST_api_v1_auth_pin_changeResponse401 = {
  type: 'object',
  required: ['code', 'message'],
  properties: {
    code: {
      type: 'string',
      enum: [
        'INVALID_ARGUMENT',
        'INTERNAL_ERROR',
        'NOT_FOUND',
        'AUTH_UNAUTHORIZED',
        'AUTH_FORBIDDEN',
        'RATE_LIMITED',
        'TICKET_NOT_FOUND',
        'DOCUMENT_NOT_FOUND',
        'DOCUMENT_FORBIDDEN',
        'INVALID_TRANSITION',
        'ROOM_REQUIRED',
        'MISSING_CALLBACK_PHONE',
        'CHECKIN_LOCK_REQUIRED',
        'DAY_CLOSE_IN_PROGRESS',
        'INVALID_DAY_CLOSE_PHASE',
        'DAY_CLOSE_NOT_STARTED',
        'UNKNOWN_MESSAGING_PROVIDER',
        'CHECKIN_LOCKED',
        'CHECKIN_AUTH_PATH_DISABLED',
        'CHECKIN_CLOSED',
        'TOPIC_DISABLED',
        'TOPIC_CLOSED',
        'DOCUMENT_NOT_SCANNED',
        'EXPORT_BLOCKED_MALWARE',
        'OPS_SETTINGS_INVALID',
        'EMERGENCY_DISABLED',
        'EMERGENCY_NOT_FOUND',
        'SETUP_INCOMPLETE',
        'SETUP_ALREADY_COMPLETED',
        'SESSION_INVALID_TICKET',
        'SESSION_TICKET_NOT_ACTIVE',
        'SESSION_ALREADY_ACTIVE',
        'SESSION_UNAUTHORIZED',
        'SESSION_EXPIRED',
        'FORM_TEMPLATE_NOT_FOUND',
        'DOCUMENT_INTAKE_BLOCKED',
        'DOCUMENT_TEMPLATE_METADATA_INVALID',
        'DOCUMENT_SCHEMA_OUTDATED',
        'SANDBOX_UNAVAILABLE',
        'CAPTIVE_CLIENT_MISSING',
        'CAPTIVE_AUTH_FAILED',
        'CALL_ANNOUNCEMENT_OFFLINE',
        'ROOM_AT_CAPACITY',
        'ROOM_BLOCKED_TOPICS',
        'ROOM_BLOCKED_QUEUE',
        'ROOM_BLOCKED_CAPACITY',
        'RECALL_NOTIFY_RETRY_NOT_ALLOWED',
        'RECALL_WINDOW_EXPIRED',
        'UNKNOWN_TOPIC',
        'TERMINAL_OFFLINE',
        'TERMINAL_PHONE_INVALID',
        'TERMINAL_BIRTH_DATE_INVALID',
        'TERMINAL_LAST_NAME_INVALID',
      ],
    },
    message: {
      type: 'string',
    },
    details: {
      type: 'object',
      additionalProperties: true,
    },
  },
} as const;

export const POST_api_v1_auth_pin_changeResponse403 = {
  type: 'object',
  required: ['code', 'message'],
  properties: {
    code: {
      type: 'string',
      enum: [
        'INVALID_ARGUMENT',
        'INTERNAL_ERROR',
        'NOT_FOUND',
        'AUTH_UNAUTHORIZED',
        'AUTH_FORBIDDEN',
        'RATE_LIMITED',
        'TICKET_NOT_FOUND',
        'DOCUMENT_NOT_FOUND',
        'DOCUMENT_FORBIDDEN',
        'INVALID_TRANSITION',
        'ROOM_REQUIRED',
        'MISSING_CALLBACK_PHONE',
        'CHECKIN_LOCK_REQUIRED',
        'DAY_CLOSE_IN_PROGRESS',
        'INVALID_DAY_CLOSE_PHASE',
        'DAY_CLOSE_NOT_STARTED',
        'UNKNOWN_MESSAGING_PROVIDER',
        'CHECKIN_LOCKED',
        'CHECKIN_AUTH_PATH_DISABLED',
        'CHECKIN_CLOSED',
        'TOPIC_DISABLED',
        'TOPIC_CLOSED',
        'DOCUMENT_NOT_SCANNED',
        'EXPORT_BLOCKED_MALWARE',
        'OPS_SETTINGS_INVALID',
        'EMERGENCY_DISABLED',
        'EMERGENCY_NOT_FOUND',
        'SETUP_INCOMPLETE',
        'SETUP_ALREADY_COMPLETED',
        'SESSION_INVALID_TICKET',
        'SESSION_TICKET_NOT_ACTIVE',
        'SESSION_ALREADY_ACTIVE',
        'SESSION_UNAUTHORIZED',
        'SESSION_EXPIRED',
        'FORM_TEMPLATE_NOT_FOUND',
        'DOCUMENT_INTAKE_BLOCKED',
        'DOCUMENT_TEMPLATE_METADATA_INVALID',
        'DOCUMENT_SCHEMA_OUTDATED',
        'SANDBOX_UNAVAILABLE',
        'CAPTIVE_CLIENT_MISSING',
        'CAPTIVE_AUTH_FAILED',
        'CALL_ANNOUNCEMENT_OFFLINE',
        'ROOM_AT_CAPACITY',
        'ROOM_BLOCKED_TOPICS',
        'ROOM_BLOCKED_QUEUE',
        'ROOM_BLOCKED_CAPACITY',
        'RECALL_NOTIFY_RETRY_NOT_ALLOWED',
        'RECALL_WINDOW_EXPIRED',
        'UNKNOWN_TOPIC',
        'TERMINAL_OFFLINE',
        'TERMINAL_PHONE_INVALID',
        'TERMINAL_BIRTH_DATE_INVALID',
        'TERMINAL_LAST_NAME_INVALID',
      ],
    },
    message: {
      type: 'string',
    },
    details: {
      type: 'object',
      additionalProperties: true,
    },
  },
} as const;

export const POST_api_v1_auth_pin_changeResponse429 = {
  type: 'object',
  required: ['code', 'message'],
  properties: {
    code: {
      type: 'string',
      enum: [
        'INVALID_ARGUMENT',
        'INTERNAL_ERROR',
        'NOT_FOUND',
        'AUTH_UNAUTHORIZED',
        'AUTH_FORBIDDEN',
        'RATE_LIMITED',
        'TICKET_NOT_FOUND',
        'DOCUMENT_NOT_FOUND',
        'DOCUMENT_FORBIDDEN',
        'INVALID_TRANSITION',
        'ROOM_REQUIRED',
        'MISSING_CALLBACK_PHONE',
        'CHECKIN_LOCK_REQUIRED',
        'DAY_CLOSE_IN_PROGRESS',
        'INVALID_DAY_CLOSE_PHASE',
        'DAY_CLOSE_NOT_STARTED',
        'UNKNOWN_MESSAGING_PROVIDER',
        'CHECKIN_LOCKED',
        'CHECKIN_AUTH_PATH_DISABLED',
        'CHECKIN_CLOSED',
        'TOPIC_DISABLED',
        'TOPIC_CLOSED',
        'DOCUMENT_NOT_SCANNED',
        'EXPORT_BLOCKED_MALWARE',
        'OPS_SETTINGS_INVALID',
        'EMERGENCY_DISABLED',
        'EMERGENCY_NOT_FOUND',
        'SETUP_INCOMPLETE',
        'SETUP_ALREADY_COMPLETED',
        'SESSION_INVALID_TICKET',
        'SESSION_TICKET_NOT_ACTIVE',
        'SESSION_ALREADY_ACTIVE',
        'SESSION_UNAUTHORIZED',
        'SESSION_EXPIRED',
        'FORM_TEMPLATE_NOT_FOUND',
        'DOCUMENT_INTAKE_BLOCKED',
        'DOCUMENT_TEMPLATE_METADATA_INVALID',
        'DOCUMENT_SCHEMA_OUTDATED',
        'SANDBOX_UNAVAILABLE',
        'CAPTIVE_CLIENT_MISSING',
        'CAPTIVE_AUTH_FAILED',
        'CALL_ANNOUNCEMENT_OFFLINE',
        'ROOM_AT_CAPACITY',
        'ROOM_BLOCKED_TOPICS',
        'ROOM_BLOCKED_QUEUE',
        'ROOM_BLOCKED_CAPACITY',
        'RECALL_NOTIFY_RETRY_NOT_ALLOWED',
        'RECALL_WINDOW_EXPIRED',
        'UNKNOWN_TOPIC',
        'TERMINAL_OFFLINE',
        'TERMINAL_PHONE_INVALID',
        'TERMINAL_BIRTH_DATE_INVALID',
        'TERMINAL_LAST_NAME_INVALID',
      ],
    },
    message: {
      type: 'string',
    },
    details: {
      type: 'object',
      additionalProperties: true,
    },
  },
} as const;

export const POST_api_v1_auth_logoutResponse200 = {
  type: 'object',
  required: ['ok'],
  properties: {
    ok: {
      type: 'boolean',
      const: true,
    },
  },
} as const;

export const POST_api_v1_auth_tv_pairing_startRequestBody = {
  type: 'object',
  additionalProperties: false,
  properties: {
    displayId: {
      type: 'string',
      minLength: 1,
      maxLength: 80,
    },
  },
} as const;

export const POST_api_v1_auth_tv_pairing_startResponse200 = {
  type: 'object',
  required: ['pairingId', 'code', 'expiresAt', 'status'],
  properties: {
    pairingId: {
      type: 'string',
    },
    code: {
      type: 'string',
      pattern: '^[0-9]{4}$',
    },
    expiresAt: {
      type: 'string',
      format: 'date-time',
    },
    status: {
      type: 'string',
      const: 'pending',
    },
  },
} as const;

export const POST_api_v1_auth_tv_pairing_startResponse429 = {
  type: 'object',
  required: ['code', 'message'],
  properties: {
    code: {
      type: 'string',
      enum: [
        'INVALID_ARGUMENT',
        'INTERNAL_ERROR',
        'NOT_FOUND',
        'AUTH_UNAUTHORIZED',
        'AUTH_FORBIDDEN',
        'RATE_LIMITED',
        'TICKET_NOT_FOUND',
        'DOCUMENT_NOT_FOUND',
        'DOCUMENT_FORBIDDEN',
        'INVALID_TRANSITION',
        'ROOM_REQUIRED',
        'MISSING_CALLBACK_PHONE',
        'CHECKIN_LOCK_REQUIRED',
        'DAY_CLOSE_IN_PROGRESS',
        'INVALID_DAY_CLOSE_PHASE',
        'DAY_CLOSE_NOT_STARTED',
        'UNKNOWN_MESSAGING_PROVIDER',
        'CHECKIN_LOCKED',
        'CHECKIN_AUTH_PATH_DISABLED',
        'CHECKIN_CLOSED',
        'TOPIC_DISABLED',
        'TOPIC_CLOSED',
        'DOCUMENT_NOT_SCANNED',
        'EXPORT_BLOCKED_MALWARE',
        'OPS_SETTINGS_INVALID',
        'EMERGENCY_DISABLED',
        'EMERGENCY_NOT_FOUND',
        'SETUP_INCOMPLETE',
        'SETUP_ALREADY_COMPLETED',
        'SESSION_INVALID_TICKET',
        'SESSION_TICKET_NOT_ACTIVE',
        'SESSION_ALREADY_ACTIVE',
        'SESSION_UNAUTHORIZED',
        'SESSION_EXPIRED',
        'FORM_TEMPLATE_NOT_FOUND',
        'DOCUMENT_INTAKE_BLOCKED',
        'DOCUMENT_TEMPLATE_METADATA_INVALID',
        'DOCUMENT_SCHEMA_OUTDATED',
        'SANDBOX_UNAVAILABLE',
        'CAPTIVE_CLIENT_MISSING',
        'CAPTIVE_AUTH_FAILED',
        'CALL_ANNOUNCEMENT_OFFLINE',
        'ROOM_AT_CAPACITY',
        'ROOM_BLOCKED_TOPICS',
        'ROOM_BLOCKED_QUEUE',
        'ROOM_BLOCKED_CAPACITY',
        'RECALL_NOTIFY_RETRY_NOT_ALLOWED',
        'RECALL_WINDOW_EXPIRED',
        'UNKNOWN_TOPIC',
        'TERMINAL_OFFLINE',
        'TERMINAL_PHONE_INVALID',
        'TERMINAL_BIRTH_DATE_INVALID',
        'TERMINAL_LAST_NAME_INVALID',
      ],
    },
    message: {
      type: 'string',
    },
    details: {
      type: 'object',
      additionalProperties: true,
    },
  },
} as const;

export const GET_api_v1_auth_tv_pairing_pairingId_Params = {
  type: 'object',
  required: ['pairingId'],
  additionalProperties: false,
  properties: {
    pairingId: {
      type: 'string',
    },
  },
} as const;

export const GET_api_v1_auth_tv_pairing_pairingId_Response200 = {
  type: 'object',
  required: ['pairingId', 'status', 'paired'],
  properties: {
    pairingId: {
      type: 'string',
    },
    status: {
      type: 'string',
      enum: ['pending', 'paired', 'expired'],
    },
    paired: {
      type: 'boolean',
    },
    expiresAt: {
      type: 'string',
      format: 'date-time',
    },
    sessionId: {
      type: 'string',
    },
  },
} as const;

export const GET_api_v1_auth_tv_pairing_pairingId_Response404 = {
  type: 'object',
  required: ['code', 'message'],
  properties: {
    code: {
      type: 'string',
      enum: [
        'INVALID_ARGUMENT',
        'INTERNAL_ERROR',
        'NOT_FOUND',
        'AUTH_UNAUTHORIZED',
        'AUTH_FORBIDDEN',
        'RATE_LIMITED',
        'TICKET_NOT_FOUND',
        'DOCUMENT_NOT_FOUND',
        'DOCUMENT_FORBIDDEN',
        'INVALID_TRANSITION',
        'ROOM_REQUIRED',
        'MISSING_CALLBACK_PHONE',
        'CHECKIN_LOCK_REQUIRED',
        'DAY_CLOSE_IN_PROGRESS',
        'INVALID_DAY_CLOSE_PHASE',
        'DAY_CLOSE_NOT_STARTED',
        'UNKNOWN_MESSAGING_PROVIDER',
        'CHECKIN_LOCKED',
        'CHECKIN_AUTH_PATH_DISABLED',
        'CHECKIN_CLOSED',
        'TOPIC_DISABLED',
        'TOPIC_CLOSED',
        'DOCUMENT_NOT_SCANNED',
        'EXPORT_BLOCKED_MALWARE',
        'OPS_SETTINGS_INVALID',
        'EMERGENCY_DISABLED',
        'EMERGENCY_NOT_FOUND',
        'SETUP_INCOMPLETE',
        'SETUP_ALREADY_COMPLETED',
        'SESSION_INVALID_TICKET',
        'SESSION_TICKET_NOT_ACTIVE',
        'SESSION_ALREADY_ACTIVE',
        'SESSION_UNAUTHORIZED',
        'SESSION_EXPIRED',
        'FORM_TEMPLATE_NOT_FOUND',
        'DOCUMENT_INTAKE_BLOCKED',
        'DOCUMENT_TEMPLATE_METADATA_INVALID',
        'DOCUMENT_SCHEMA_OUTDATED',
        'SANDBOX_UNAVAILABLE',
        'CAPTIVE_CLIENT_MISSING',
        'CAPTIVE_AUTH_FAILED',
        'CALL_ANNOUNCEMENT_OFFLINE',
        'ROOM_AT_CAPACITY',
        'ROOM_BLOCKED_TOPICS',
        'ROOM_BLOCKED_QUEUE',
        'ROOM_BLOCKED_CAPACITY',
        'RECALL_NOTIFY_RETRY_NOT_ALLOWED',
        'RECALL_WINDOW_EXPIRED',
        'UNKNOWN_TOPIC',
        'TERMINAL_OFFLINE',
        'TERMINAL_PHONE_INVALID',
        'TERMINAL_BIRTH_DATE_INVALID',
        'TERMINAL_LAST_NAME_INVALID',
      ],
    },
    message: {
      type: 'string',
    },
    details: {
      type: 'object',
      additionalProperties: true,
    },
  },
} as const;

export const POST_api_v1_auth_tv_pairing_confirmRequestBody = {
  type: 'object',
  required: ['code'],
  additionalProperties: false,
  properties: {
    code: {
      type: 'string',
      pattern: '^[0-9]{4}$',
    },
  },
} as const;

export const POST_api_v1_auth_tv_pairing_confirmResponse200 = {
  type: 'object',
  required: ['ok', 'pairingId', 'status'],
  properties: {
    ok: {
      type: 'boolean',
      const: true,
    },
    pairingId: {
      type: 'string',
    },
    status: {
      type: 'string',
      enum: ['paired', 'already_paired'],
    },
  },
} as const;

export const POST_api_v1_auth_tv_pairing_confirmResponse404 = {
  type: 'object',
  required: ['code', 'message'],
  properties: {
    code: {
      type: 'string',
      enum: [
        'INVALID_ARGUMENT',
        'INTERNAL_ERROR',
        'NOT_FOUND',
        'AUTH_UNAUTHORIZED',
        'AUTH_FORBIDDEN',
        'RATE_LIMITED',
        'TICKET_NOT_FOUND',
        'DOCUMENT_NOT_FOUND',
        'DOCUMENT_FORBIDDEN',
        'INVALID_TRANSITION',
        'ROOM_REQUIRED',
        'MISSING_CALLBACK_PHONE',
        'CHECKIN_LOCK_REQUIRED',
        'DAY_CLOSE_IN_PROGRESS',
        'INVALID_DAY_CLOSE_PHASE',
        'DAY_CLOSE_NOT_STARTED',
        'UNKNOWN_MESSAGING_PROVIDER',
        'CHECKIN_LOCKED',
        'CHECKIN_AUTH_PATH_DISABLED',
        'CHECKIN_CLOSED',
        'TOPIC_DISABLED',
        'TOPIC_CLOSED',
        'DOCUMENT_NOT_SCANNED',
        'EXPORT_BLOCKED_MALWARE',
        'OPS_SETTINGS_INVALID',
        'EMERGENCY_DISABLED',
        'EMERGENCY_NOT_FOUND',
        'SETUP_INCOMPLETE',
        'SETUP_ALREADY_COMPLETED',
        'SESSION_INVALID_TICKET',
        'SESSION_TICKET_NOT_ACTIVE',
        'SESSION_ALREADY_ACTIVE',
        'SESSION_UNAUTHORIZED',
        'SESSION_EXPIRED',
        'FORM_TEMPLATE_NOT_FOUND',
        'DOCUMENT_INTAKE_BLOCKED',
        'DOCUMENT_TEMPLATE_METADATA_INVALID',
        'DOCUMENT_SCHEMA_OUTDATED',
        'SANDBOX_UNAVAILABLE',
        'CAPTIVE_CLIENT_MISSING',
        'CAPTIVE_AUTH_FAILED',
        'CALL_ANNOUNCEMENT_OFFLINE',
        'ROOM_AT_CAPACITY',
        'ROOM_BLOCKED_TOPICS',
        'ROOM_BLOCKED_QUEUE',
        'ROOM_BLOCKED_CAPACITY',
        'RECALL_NOTIFY_RETRY_NOT_ALLOWED',
        'RECALL_WINDOW_EXPIRED',
        'UNKNOWN_TOPIC',
        'TERMINAL_OFFLINE',
        'TERMINAL_PHONE_INVALID',
        'TERMINAL_BIRTH_DATE_INVALID',
        'TERMINAL_LAST_NAME_INVALID',
      ],
    },
    message: {
      type: 'string',
    },
    details: {
      type: 'object',
      additionalProperties: true,
    },
  },
} as const;

export const POST_api_v1_auth_tv_pairing_confirmResponse429 = {
  type: 'object',
  required: ['code', 'message'],
  properties: {
    code: {
      type: 'string',
      enum: [
        'INVALID_ARGUMENT',
        'INTERNAL_ERROR',
        'NOT_FOUND',
        'AUTH_UNAUTHORIZED',
        'AUTH_FORBIDDEN',
        'RATE_LIMITED',
        'TICKET_NOT_FOUND',
        'DOCUMENT_NOT_FOUND',
        'DOCUMENT_FORBIDDEN',
        'INVALID_TRANSITION',
        'ROOM_REQUIRED',
        'MISSING_CALLBACK_PHONE',
        'CHECKIN_LOCK_REQUIRED',
        'DAY_CLOSE_IN_PROGRESS',
        'INVALID_DAY_CLOSE_PHASE',
        'DAY_CLOSE_NOT_STARTED',
        'UNKNOWN_MESSAGING_PROVIDER',
        'CHECKIN_LOCKED',
        'CHECKIN_AUTH_PATH_DISABLED',
        'CHECKIN_CLOSED',
        'TOPIC_DISABLED',
        'TOPIC_CLOSED',
        'DOCUMENT_NOT_SCANNED',
        'EXPORT_BLOCKED_MALWARE',
        'OPS_SETTINGS_INVALID',
        'EMERGENCY_DISABLED',
        'EMERGENCY_NOT_FOUND',
        'SETUP_INCOMPLETE',
        'SETUP_ALREADY_COMPLETED',
        'SESSION_INVALID_TICKET',
        'SESSION_TICKET_NOT_ACTIVE',
        'SESSION_ALREADY_ACTIVE',
        'SESSION_UNAUTHORIZED',
        'SESSION_EXPIRED',
        'FORM_TEMPLATE_NOT_FOUND',
        'DOCUMENT_INTAKE_BLOCKED',
        'DOCUMENT_TEMPLATE_METADATA_INVALID',
        'DOCUMENT_SCHEMA_OUTDATED',
        'SANDBOX_UNAVAILABLE',
        'CAPTIVE_CLIENT_MISSING',
        'CAPTIVE_AUTH_FAILED',
        'CALL_ANNOUNCEMENT_OFFLINE',
        'ROOM_AT_CAPACITY',
        'ROOM_BLOCKED_TOPICS',
        'ROOM_BLOCKED_QUEUE',
        'ROOM_BLOCKED_CAPACITY',
        'RECALL_NOTIFY_RETRY_NOT_ALLOWED',
        'RECALL_WINDOW_EXPIRED',
        'UNKNOWN_TOPIC',
        'TERMINAL_OFFLINE',
        'TERMINAL_PHONE_INVALID',
        'TERMINAL_BIRTH_DATE_INVALID',
        'TERMINAL_LAST_NAME_INVALID',
      ],
    },
    message: {
      type: 'string',
    },
    details: {
      type: 'object',
      additionalProperties: true,
    },
  },
} as const;

export const POST_api_v1_auth_terminal_pairing_startRequestBody = {
  type: 'object',
  additionalProperties: false,
  properties: {
    displayId: {
      type: 'string',
      minLength: 1,
      maxLength: 80,
    },
  },
} as const;

export const POST_api_v1_auth_terminal_pairing_startResponse200 = {
  type: 'object',
  required: ['pairingId', 'code', 'expiresAt', 'status'],
  properties: {
    pairingId: {
      type: 'string',
    },
    code: {
      type: 'string',
      pattern: '^[0-9]{4}$',
    },
    expiresAt: {
      type: 'string',
      format: 'date-time',
    },
    status: {
      type: 'string',
      const: 'pending',
    },
  },
} as const;

export const POST_api_v1_auth_terminal_pairing_startResponse429 = {
  type: 'object',
  required: ['code', 'message'],
  properties: {
    code: {
      type: 'string',
      enum: [
        'INVALID_ARGUMENT',
        'INTERNAL_ERROR',
        'NOT_FOUND',
        'AUTH_UNAUTHORIZED',
        'AUTH_FORBIDDEN',
        'RATE_LIMITED',
        'TICKET_NOT_FOUND',
        'DOCUMENT_NOT_FOUND',
        'DOCUMENT_FORBIDDEN',
        'INVALID_TRANSITION',
        'ROOM_REQUIRED',
        'MISSING_CALLBACK_PHONE',
        'CHECKIN_LOCK_REQUIRED',
        'DAY_CLOSE_IN_PROGRESS',
        'INVALID_DAY_CLOSE_PHASE',
        'DAY_CLOSE_NOT_STARTED',
        'UNKNOWN_MESSAGING_PROVIDER',
        'CHECKIN_LOCKED',
        'CHECKIN_AUTH_PATH_DISABLED',
        'CHECKIN_CLOSED',
        'TOPIC_DISABLED',
        'TOPIC_CLOSED',
        'DOCUMENT_NOT_SCANNED',
        'EXPORT_BLOCKED_MALWARE',
        'OPS_SETTINGS_INVALID',
        'EMERGENCY_DISABLED',
        'EMERGENCY_NOT_FOUND',
        'SETUP_INCOMPLETE',
        'SETUP_ALREADY_COMPLETED',
        'SESSION_INVALID_TICKET',
        'SESSION_TICKET_NOT_ACTIVE',
        'SESSION_ALREADY_ACTIVE',
        'SESSION_UNAUTHORIZED',
        'SESSION_EXPIRED',
        'FORM_TEMPLATE_NOT_FOUND',
        'DOCUMENT_INTAKE_BLOCKED',
        'DOCUMENT_TEMPLATE_METADATA_INVALID',
        'DOCUMENT_SCHEMA_OUTDATED',
        'SANDBOX_UNAVAILABLE',
        'CAPTIVE_CLIENT_MISSING',
        'CAPTIVE_AUTH_FAILED',
        'CALL_ANNOUNCEMENT_OFFLINE',
        'ROOM_AT_CAPACITY',
        'ROOM_BLOCKED_TOPICS',
        'ROOM_BLOCKED_QUEUE',
        'ROOM_BLOCKED_CAPACITY',
        'RECALL_NOTIFY_RETRY_NOT_ALLOWED',
        'RECALL_WINDOW_EXPIRED',
        'UNKNOWN_TOPIC',
        'TERMINAL_OFFLINE',
        'TERMINAL_PHONE_INVALID',
        'TERMINAL_BIRTH_DATE_INVALID',
        'TERMINAL_LAST_NAME_INVALID',
      ],
    },
    message: {
      type: 'string',
    },
    details: {
      type: 'object',
      additionalProperties: true,
    },
  },
} as const;

export const GET_api_v1_auth_terminal_pairing_pairingId_Params = {
  type: 'object',
  required: ['pairingId'],
  additionalProperties: false,
  properties: {
    pairingId: {
      type: 'string',
    },
  },
} as const;

export const GET_api_v1_auth_terminal_pairing_pairingId_Response200 = {
  type: 'object',
  required: ['pairingId', 'status', 'paired'],
  properties: {
    pairingId: {
      type: 'string',
    },
    status: {
      type: 'string',
      enum: ['pending', 'paired', 'expired'],
    },
    paired: {
      type: 'boolean',
    },
    expiresAt: {
      type: 'string',
      format: 'date-time',
    },
    sessionId: {
      type: 'string',
    },
  },
} as const;

export const GET_api_v1_auth_terminal_pairing_pairingId_Response404 = {
  type: 'object',
  required: ['code', 'message'],
  properties: {
    code: {
      type: 'string',
      enum: [
        'INVALID_ARGUMENT',
        'INTERNAL_ERROR',
        'NOT_FOUND',
        'AUTH_UNAUTHORIZED',
        'AUTH_FORBIDDEN',
        'RATE_LIMITED',
        'TICKET_NOT_FOUND',
        'DOCUMENT_NOT_FOUND',
        'DOCUMENT_FORBIDDEN',
        'INVALID_TRANSITION',
        'ROOM_REQUIRED',
        'MISSING_CALLBACK_PHONE',
        'CHECKIN_LOCK_REQUIRED',
        'DAY_CLOSE_IN_PROGRESS',
        'INVALID_DAY_CLOSE_PHASE',
        'DAY_CLOSE_NOT_STARTED',
        'UNKNOWN_MESSAGING_PROVIDER',
        'CHECKIN_LOCKED',
        'CHECKIN_AUTH_PATH_DISABLED',
        'CHECKIN_CLOSED',
        'TOPIC_DISABLED',
        'TOPIC_CLOSED',
        'DOCUMENT_NOT_SCANNED',
        'EXPORT_BLOCKED_MALWARE',
        'OPS_SETTINGS_INVALID',
        'EMERGENCY_DISABLED',
        'EMERGENCY_NOT_FOUND',
        'SETUP_INCOMPLETE',
        'SETUP_ALREADY_COMPLETED',
        'SESSION_INVALID_TICKET',
        'SESSION_TICKET_NOT_ACTIVE',
        'SESSION_ALREADY_ACTIVE',
        'SESSION_UNAUTHORIZED',
        'SESSION_EXPIRED',
        'FORM_TEMPLATE_NOT_FOUND',
        'DOCUMENT_INTAKE_BLOCKED',
        'DOCUMENT_TEMPLATE_METADATA_INVALID',
        'DOCUMENT_SCHEMA_OUTDATED',
        'SANDBOX_UNAVAILABLE',
        'CAPTIVE_CLIENT_MISSING',
        'CAPTIVE_AUTH_FAILED',
        'CALL_ANNOUNCEMENT_OFFLINE',
        'ROOM_AT_CAPACITY',
        'ROOM_BLOCKED_TOPICS',
        'ROOM_BLOCKED_QUEUE',
        'ROOM_BLOCKED_CAPACITY',
        'RECALL_NOTIFY_RETRY_NOT_ALLOWED',
        'RECALL_WINDOW_EXPIRED',
        'UNKNOWN_TOPIC',
        'TERMINAL_OFFLINE',
        'TERMINAL_PHONE_INVALID',
        'TERMINAL_BIRTH_DATE_INVALID',
        'TERMINAL_LAST_NAME_INVALID',
      ],
    },
    message: {
      type: 'string',
    },
    details: {
      type: 'object',
      additionalProperties: true,
    },
  },
} as const;

export const POST_api_v1_auth_terminal_pairing_confirmRequestBody = {
  type: 'object',
  required: ['code'],
  additionalProperties: false,
  properties: {
    code: {
      type: 'string',
      pattern: '^[0-9]{4}$',
    },
  },
} as const;

export const POST_api_v1_auth_terminal_pairing_confirmResponse200 = {
  type: 'object',
  required: ['ok', 'pairingId', 'status'],
  properties: {
    ok: {
      type: 'boolean',
      const: true,
    },
    pairingId: {
      type: 'string',
    },
    status: {
      type: 'string',
      enum: ['paired', 'already_paired'],
    },
  },
} as const;

export const POST_api_v1_auth_terminal_pairing_confirmResponse404 = {
  type: 'object',
  required: ['code', 'message'],
  properties: {
    code: {
      type: 'string',
      enum: [
        'INVALID_ARGUMENT',
        'INTERNAL_ERROR',
        'NOT_FOUND',
        'AUTH_UNAUTHORIZED',
        'AUTH_FORBIDDEN',
        'RATE_LIMITED',
        'TICKET_NOT_FOUND',
        'DOCUMENT_NOT_FOUND',
        'DOCUMENT_FORBIDDEN',
        'INVALID_TRANSITION',
        'ROOM_REQUIRED',
        'MISSING_CALLBACK_PHONE',
        'CHECKIN_LOCK_REQUIRED',
        'DAY_CLOSE_IN_PROGRESS',
        'INVALID_DAY_CLOSE_PHASE',
        'DAY_CLOSE_NOT_STARTED',
        'UNKNOWN_MESSAGING_PROVIDER',
        'CHECKIN_LOCKED',
        'CHECKIN_AUTH_PATH_DISABLED',
        'CHECKIN_CLOSED',
        'TOPIC_DISABLED',
        'TOPIC_CLOSED',
        'DOCUMENT_NOT_SCANNED',
        'EXPORT_BLOCKED_MALWARE',
        'OPS_SETTINGS_INVALID',
        'EMERGENCY_DISABLED',
        'EMERGENCY_NOT_FOUND',
        'SETUP_INCOMPLETE',
        'SETUP_ALREADY_COMPLETED',
        'SESSION_INVALID_TICKET',
        'SESSION_TICKET_NOT_ACTIVE',
        'SESSION_ALREADY_ACTIVE',
        'SESSION_UNAUTHORIZED',
        'SESSION_EXPIRED',
        'FORM_TEMPLATE_NOT_FOUND',
        'DOCUMENT_INTAKE_BLOCKED',
        'DOCUMENT_TEMPLATE_METADATA_INVALID',
        'DOCUMENT_SCHEMA_OUTDATED',
        'SANDBOX_UNAVAILABLE',
        'CAPTIVE_CLIENT_MISSING',
        'CAPTIVE_AUTH_FAILED',
        'CALL_ANNOUNCEMENT_OFFLINE',
        'ROOM_AT_CAPACITY',
        'ROOM_BLOCKED_TOPICS',
        'ROOM_BLOCKED_QUEUE',
        'ROOM_BLOCKED_CAPACITY',
        'RECALL_NOTIFY_RETRY_NOT_ALLOWED',
        'RECALL_WINDOW_EXPIRED',
        'UNKNOWN_TOPIC',
        'TERMINAL_OFFLINE',
        'TERMINAL_PHONE_INVALID',
        'TERMINAL_BIRTH_DATE_INVALID',
        'TERMINAL_LAST_NAME_INVALID',
      ],
    },
    message: {
      type: 'string',
    },
    details: {
      type: 'object',
      additionalProperties: true,
    },
  },
} as const;

export const POST_api_v1_auth_terminal_pairing_confirmResponse429 = {
  type: 'object',
  required: ['code', 'message'],
  properties: {
    code: {
      type: 'string',
      enum: [
        'INVALID_ARGUMENT',
        'INTERNAL_ERROR',
        'NOT_FOUND',
        'AUTH_UNAUTHORIZED',
        'AUTH_FORBIDDEN',
        'RATE_LIMITED',
        'TICKET_NOT_FOUND',
        'DOCUMENT_NOT_FOUND',
        'DOCUMENT_FORBIDDEN',
        'INVALID_TRANSITION',
        'ROOM_REQUIRED',
        'MISSING_CALLBACK_PHONE',
        'CHECKIN_LOCK_REQUIRED',
        'DAY_CLOSE_IN_PROGRESS',
        'INVALID_DAY_CLOSE_PHASE',
        'DAY_CLOSE_NOT_STARTED',
        'UNKNOWN_MESSAGING_PROVIDER',
        'CHECKIN_LOCKED',
        'CHECKIN_AUTH_PATH_DISABLED',
        'CHECKIN_CLOSED',
        'TOPIC_DISABLED',
        'TOPIC_CLOSED',
        'DOCUMENT_NOT_SCANNED',
        'EXPORT_BLOCKED_MALWARE',
        'OPS_SETTINGS_INVALID',
        'EMERGENCY_DISABLED',
        'EMERGENCY_NOT_FOUND',
        'SETUP_INCOMPLETE',
        'SETUP_ALREADY_COMPLETED',
        'SESSION_INVALID_TICKET',
        'SESSION_TICKET_NOT_ACTIVE',
        'SESSION_ALREADY_ACTIVE',
        'SESSION_UNAUTHORIZED',
        'SESSION_EXPIRED',
        'FORM_TEMPLATE_NOT_FOUND',
        'DOCUMENT_INTAKE_BLOCKED',
        'DOCUMENT_TEMPLATE_METADATA_INVALID',
        'DOCUMENT_SCHEMA_OUTDATED',
        'SANDBOX_UNAVAILABLE',
        'CAPTIVE_CLIENT_MISSING',
        'CAPTIVE_AUTH_FAILED',
        'CALL_ANNOUNCEMENT_OFFLINE',
        'ROOM_AT_CAPACITY',
        'ROOM_BLOCKED_TOPICS',
        'ROOM_BLOCKED_QUEUE',
        'ROOM_BLOCKED_CAPACITY',
        'RECALL_NOTIFY_RETRY_NOT_ALLOWED',
        'RECALL_WINDOW_EXPIRED',
        'UNKNOWN_TOPIC',
        'TERMINAL_OFFLINE',
        'TERMINAL_PHONE_INVALID',
        'TERMINAL_BIRTH_DATE_INVALID',
        'TERMINAL_LAST_NAME_INVALID',
      ],
    },
    message: {
      type: 'string',
    },
    details: {
      type: 'object',
      additionalProperties: true,
    },
  },
} as const;

export const authSchemas = {
  StaffRole,
  StaffLoginRequest,
  StaffSessionResponse,
  RoomPanelMode,
  RoomPanelPlacement,
  RoomPanelRoom,
  RoomPanelRoomsResponse,
  RoomPanelLoginRequest,
  RoomPanelSessionResponse,
  AuthPinTarget,
  ChangePinRequest,
  ChangePinResponse,
  LogoutResponse,
  DevicePairingStartRequest,
  DevicePairingStartResponse,
  DevicePairingStatusResponse,
  DevicePairingConfirmRequest,
  DevicePairingConfirmResponse,
  POST_api_v1_auth_loginRequestBody,
  POST_api_v1_auth_loginResponse200,
  POST_api_v1_auth_loginResponse401,
  POST_api_v1_auth_loginResponse429,
  GET_api_v1_auth_meResponse200,
  GET_api_v1_auth_meResponse401,
  GET_api_v1_auth_room_panel_roomsResponse200,
  POST_api_v1_auth_room_panel_loginRequestBody,
  POST_api_v1_auth_room_panel_loginResponse200,
  POST_api_v1_auth_room_panel_loginResponse401,
  POST_api_v1_auth_room_panel_loginResponse404,
  POST_api_v1_auth_room_panel_loginResponse429,
  POST_api_v1_auth_pin_changeRequestBody,
  POST_api_v1_auth_pin_changeResponse200,
  POST_api_v1_auth_pin_changeResponse400,
  POST_api_v1_auth_pin_changeResponse401,
  POST_api_v1_auth_pin_changeResponse403,
  POST_api_v1_auth_pin_changeResponse429,
  POST_api_v1_auth_logoutResponse200,
  POST_api_v1_auth_tv_pairing_startRequestBody,
  POST_api_v1_auth_tv_pairing_startResponse200,
  POST_api_v1_auth_tv_pairing_startResponse429,
  GET_api_v1_auth_tv_pairing_pairingId_Params,
  GET_api_v1_auth_tv_pairing_pairingId_Response200,
  GET_api_v1_auth_tv_pairing_pairingId_Response404,
  POST_api_v1_auth_tv_pairing_confirmRequestBody,
  POST_api_v1_auth_tv_pairing_confirmResponse200,
  POST_api_v1_auth_tv_pairing_confirmResponse404,
  POST_api_v1_auth_tv_pairing_confirmResponse429,
  POST_api_v1_auth_terminal_pairing_startRequestBody,
  POST_api_v1_auth_terminal_pairing_startResponse200,
  POST_api_v1_auth_terminal_pairing_startResponse429,
  GET_api_v1_auth_terminal_pairing_pairingId_Params,
  GET_api_v1_auth_terminal_pairing_pairingId_Response200,
  GET_api_v1_auth_terminal_pairing_pairingId_Response404,
  POST_api_v1_auth_terminal_pairing_confirmRequestBody,
  POST_api_v1_auth_terminal_pairing_confirmResponse200,
  POST_api_v1_auth_terminal_pairing_confirmResponse404,
  POST_api_v1_auth_terminal_pairing_confirmResponse429,
} as const;
