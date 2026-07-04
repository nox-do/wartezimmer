/**
 * AUTO-GENERATED from openapi/identity.yaml — do not edit.
 * Run: npm run generate:api-schemas
 */

export const MfaLookupCandidate = {
  type: 'object',
  required: ['identityRef', 'firstName', 'lastName', 'birthDate', 'phoneNumberMasked'],
  properties: {
    identityRef: {
      type: 'string',
      maxLength: 160,
    },
    firstName: {
      type: ['string', 'null'],
      maxLength: 160,
    },
    lastName: {
      type: ['string', 'null'],
      maxLength: 160,
    },
    birthDate: {
      type: ['string', 'null'],
      maxLength: 32,
    },
    phoneNumberMasked: {
      type: ['string', 'null'],
      maxLength: 32,
    },
    phoneNumberExact: {
      type: ['string', 'null'],
      maxLength: 32,
    },
  },
} as const;

export const POST_api_v1_identity_phone_dob_lookupRequestBody = {
  type: 'object',
  required: ['phoneNumber', 'birthDate'],
  additionalProperties: false,
  properties: {
    phoneNumber: {
      type: 'string',
      minLength: 3,
      maxLength: 64,
    },
    birthDate: {
      type: 'string',
      pattern: '^\\d{4}-\\d{2}-\\d{2}$',
    },
  },
} as const;

export const POST_api_v1_identity_phone_dob_lookupResponse200 = {
  type: 'object',
  required: ['found', 'identityRef'],
  properties: {
    found: {
      type: 'boolean',
    },
    identityRef: {
      type: ['string', 'null'],
      maxLength: 160,
    },
  },
} as const;

export const POST_api_v1_identity_phone_dob_lookupResponse400 = {
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

export const POST_api_v1_identity_mfa_lookupRequestBody = {
  type: 'object',
  additionalProperties: false,
  properties: {
    name: {
      type: 'string',
      minLength: 3,
      maxLength: 160,
    },
    birthDate: {
      type: 'string',
      minLength: 8,
      maxLength: 32,
    },
    phoneNumber: {
      type: 'string',
      minLength: 3,
      maxLength: 64,
    },
    limit: {
      type: 'integer',
      minimum: 1,
      maximum: 50,
    },
  },
} as const;

export const POST_api_v1_identity_mfa_lookupResponse200 = {
  type: 'object',
  required: ['candidates'],
  properties: {
    candidates: {
      type: 'array',
      items: {
        type: 'object',
        required: ['identityRef', 'firstName', 'lastName', 'birthDate', 'phoneNumberMasked'],
        properties: {
          identityRef: {
            type: 'string',
            maxLength: 160,
          },
          firstName: {
            type: ['string', 'null'],
            maxLength: 160,
          },
          lastName: {
            type: ['string', 'null'],
            maxLength: 160,
          },
          birthDate: {
            type: ['string', 'null'],
            maxLength: 32,
          },
          phoneNumberMasked: {
            type: ['string', 'null'],
            maxLength: 32,
          },
          phoneNumberExact: {
            type: ['string', 'null'],
            maxLength: 32,
          },
        },
      },
    },
  },
} as const;

export const POST_api_v1_identity_mfa_lookupResponse400 = {
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

export const POST_api_v1_identity_mfa_lookupResponse429 = {
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

export const GET_api_v1_identity_ticket_Params = {
  type: 'object',
  required: ['ticket'],
  additionalProperties: false,
  properties: {
    ticket: {
      type: 'string',
      minLength: 1,
    },
  },
} as const;

export const GET_api_v1_identity_ticket_Response200 = {
  type: 'object',
  required: [
    'ticketId',
    'laneCode',
    'topicLabel',
    'number',
    'topicId',
    'authPath',
    'identityRef',
    'status',
    'createdAt',
    'updatedAt',
  ],
  properties: {
    ticketId: {
      type: 'string',
    },
    laneCode: {
      type: 'string',
    },
    topicLabel: {
      type: 'string',
    },
    number: {
      type: 'integer',
    },
    topicId: {
      type: 'string',
    },
    authPath: {
      type: 'string',
    },
    identityRef: {
      type: ['string', 'null'],
    },
    status: {
      type: 'string',
    },
    createdAt: {
      type: 'string',
      format: 'date-time',
    },
    updatedAt: {
      type: 'string',
      format: 'date-time',
    },
  },
} as const;

export const GET_api_v1_identity_ticket_Response404 = {
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

export const identitySchemas = {
  MfaLookupCandidate,
  POST_api_v1_identity_phone_dob_lookupRequestBody,
  POST_api_v1_identity_phone_dob_lookupResponse200,
  POST_api_v1_identity_phone_dob_lookupResponse400,
  POST_api_v1_identity_mfa_lookupRequestBody,
  POST_api_v1_identity_mfa_lookupResponse200,
  POST_api_v1_identity_mfa_lookupResponse400,
  POST_api_v1_identity_mfa_lookupResponse429,
  GET_api_v1_identity_ticket_Params,
  GET_api_v1_identity_ticket_Response200,
  GET_api_v1_identity_ticket_Response404,
} as const;
