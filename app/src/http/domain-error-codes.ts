import type { FastifyReply } from 'fastify';
import { API_ERROR_CODES, type ApiErrorCode, type ApiErrorPayload } from './api-errors.js';
import { readDomainCode } from '../shared/errors/domain-error.js';

type DomainErrorHttpSpec = {
  status: number;
  code: ApiErrorCode;
  message: string;
};

const DOMAIN_ERROR_HTTP = {
  VISIT_NOT_FOUND: { status: 404, code: 'VISIT_NOT_FOUND', message: 'Visit not found.' },
  DOCUMENT_NOT_FOUND: { status: 404, code: 'DOCUMENT_NOT_FOUND', message: 'Document not found.' },
  DOCUMENT_FORBIDDEN: {
    status: 403,
    code: 'DOCUMENT_FORBIDDEN',
    message: 'Document access forbidden.',
  },
  INVALID_TRANSITION: {
    status: 409,
    code: 'INVALID_TRANSITION',
    message: 'Invalid queue transition.',
  },
  ROOM_REQUIRED: { status: 400, code: 'ROOM_REQUIRED', message: 'Room is required.' },
  MISSING_CALLBACK_PHONE: {
    status: 400,
    code: 'MISSING_CALLBACK_PHONE',
    message: 'Callback phone is required.',
  },
  RECALL_NOTIFY_RETRY_NOT_ALLOWED: {
    status: 409,
    code: 'RECALL_NOTIFY_RETRY_NOT_ALLOWED',
    message: 'Recall notify retry is not allowed for this ticket.',
  },
  RECALL_WINDOW_EXPIRED: {
    status: 409,
    code: 'RECALL_WINDOW_EXPIRED',
    message: 'Recall return window has expired.',
  },
  CHECKIN_LOCK_REQUIRED: {
    status: 409,
    code: 'CHECKIN_LOCK_REQUIRED',
    message: 'Check-in lock required.',
  },
  DAY_CLOSE_IN_PROGRESS: {
    status: 409,
    code: 'DAY_CLOSE_IN_PROGRESS',
    message: 'Day close in progress.',
  },
  INVALID_DAY_CLOSE_PHASE: {
    status: 409,
    code: 'INVALID_DAY_CLOSE_PHASE',
    message: 'Invalid day close phase.',
  },
  INVALID_DAY_CLOSE_PHASE_VALUE: {
    status: 409,
    code: 'INVALID_DAY_CLOSE_PHASE',
    message: 'Invalid day close phase.',
  },
  DAY_CLOSE_NOT_STARTED: {
    status: 409,
    code: 'DAY_CLOSE_NOT_STARTED',
    message: 'Day close not started.',
  },
  UNKNOWN_MESSAGING_PROVIDER: {
    status: 400,
    code: 'UNKNOWN_MESSAGING_PROVIDER',
    message: 'Unknown messaging provider.',
  },
  CHECKIN_LOCKED: { status: 409, code: 'CHECKIN_LOCKED', message: 'Check-in is locked.' },
  CHECKIN_AUTH_PATH_DISABLED: {
    status: 409,
    code: 'CHECKIN_AUTH_PATH_DISABLED',
    message: 'This check-in method is disabled.',
  },
  CALL_ANNOUNCEMENT_OFFLINE: {
    status: 409,
    code: 'CALL_ANNOUNCEMENT_OFFLINE',
    message: 'Call announcement display is offline.',
  },
  TERMINAL_OFFLINE: {
    status: 409,
    code: 'TERMINAL_OFFLINE',
    message: 'Check-in terminal is offline.',
  },
  TERMINAL_PHONE_INVALID: {
    status: 400,
    code: 'TERMINAL_PHONE_INVALID',
    message: 'Invalid phone number.',
  },
  TERMINAL_BIRTH_DATE_INVALID: {
    status: 400,
    code: 'TERMINAL_BIRTH_DATE_INVALID',
    message: 'Invalid birth date.',
  },
  TERMINAL_LAST_NAME_INVALID: {
    status: 400,
    code: 'TERMINAL_LAST_NAME_INVALID',
    message: 'Invalid last name.',
  },
  ROOM_AT_CAPACITY: {
    status: 409,
    code: 'ROOM_AT_CAPACITY',
    message: 'Room is at capacity.',
  },
  QUEUE_ROOM_MISMATCH: {
    status: 409,
    code: 'QUEUE_ROOM_MISMATCH',
    message: 'Queue action is not allowed from this room.',
  },
  CHECKIN_CLOSED: { status: 409, code: 'CHECKIN_CLOSED', message: 'Check-in is closed.' },
  TOPIC_DISABLED: { status: 409, code: 'TOPIC_DISABLED', message: 'Topic is disabled.' },
  TOPIC_CLOSED: { status: 409, code: 'TOPIC_CLOSED', message: 'Topic is closed.' },
  UNKNOWN_TOPIC: { status: 400, code: 'INVALID_ARGUMENT', message: 'Unknown topic.' },
  DOCUMENT_NOT_SCANNED: {
    status: 409,
    code: 'DOCUMENT_NOT_SCANNED',
    message: 'Document not scanned yet.',
  },
  EXPORT_BLOCKED_MALWARE: {
    status: 409,
    code: 'EXPORT_BLOCKED_MALWARE',
    message: 'Export blocked due to malware.',
  },
  OPS_SETTINGS_INVALID: {
    status: 400,
    code: 'OPS_SETTINGS_INVALID',
    message: 'Operations settings are invalid.',
  },
  OPS_SETTINGS_NOT_INITIALIZED: {
    status: 409,
    code: 'OPS_SETTINGS_INVALID',
    message: 'Operations settings are not initialized.',
  },
  EMERGENCY_DISABLED: {
    status: 409,
    code: 'EMERGENCY_DISABLED',
    message: 'Emergency is disabled.',
  },
  EMERGENCY_NOT_FOUND: {
    status: 404,
    code: 'EMERGENCY_NOT_FOUND',
    message: 'Emergency not found.',
  },
  SESSION_INVALID_TICKET: {
    status: 404,
    code: 'SESSION_INVALID_TICKET',
    message: 'Invalid ticket code.',
  },
  SESSION_TICKET_NOT_ACTIVE: {
    status: 409,
    code: 'SESSION_TICKET_NOT_ACTIVE',
    message: 'Ticket is not active.',
  },
  SESSION_ALREADY_ACTIVE: {
    status: 409,
    code: 'SESSION_ALREADY_ACTIVE',
    message: 'Session already active for ticket.',
  },
  SESSION_UNAUTHORIZED: { status: 401, code: 'SESSION_UNAUTHORIZED', message: 'Unauthorized.' },
  SESSION_EXPIRED: { status: 401, code: 'SESSION_EXPIRED', message: 'Session expired.' },
  DOCUMENT_TEMPLATE_METADATA_INVALID: {
    status: 409,
    code: 'DOCUMENT_TEMPLATE_METADATA_INVALID',
    message: 'Document template metadata is invalid.',
  },
  SETUP_REQUIRED_CHECKS_INCOMPLETE: {
    status: 409,
    code: 'SETUP_INCOMPLETE',
    message: 'Required setup checks are not satisfied yet.',
  },
  SETUP_ALREADY_COMPLETED: {
    status: 409,
    code: 'SETUP_ALREADY_COMPLETED',
    message: 'Setup has already been completed.',
  },
  SETUP_INVALID_STEP: {
    status: 400,
    code: 'INVALID_ARGUMENT',
    message: 'Invalid setup wizard step.',
  },
  SETUP_INVALID_CONTACT_MODE: {
    status: 400,
    code: 'INVALID_ARGUMENT',
    message: 'Invalid contact mode.',
  },
  TICKET_CODE_REQUIRED: {
    status: 400,
    code: 'INVALID_ARGUMENT',
    message: 'Handynummer nicht eindeutig — bitte Wartenummer eingeben.',
  },
  TICKET_AMBIGUOUS: {
    status: 409,
    code: 'INVALID_ARGUMENT',
    message: 'Mehrere Treffer — bitte Wartenummer eingeben.',
  },
  INVALID_TICKET_CODE: {
    status: 400,
    code: 'INVALID_ARGUMENT',
    message: 'Ungueltige Wartenummer (Format z. B. O-012).',
  },
  TICKET_LOOKUP_REQUIRED: {
    status: 400,
    code: 'INVALID_ARGUMENT',
    message: 'Handynummer nicht eindeutig — bitte Wartenummer eingeben.',
  },
  INVALID_ARGUMENT: { status: 400, code: 'INVALID_ARGUMENT', message: 'Invalid argument.' },
  FORM_TEMPLATE_ID_REQUIRED: {
    status: 400,
    code: 'INVALID_ARGUMENT',
    message: 'Invalid form template reference.',
  },
  FORM_TEMPLATE_VERSION_INVALID: {
    status: 400,
    code: 'INVALID_ARGUMENT',
    message: 'Invalid form template reference.',
  },
  FORM_ANSWERS_INVALID: {
    status: 400,
    code: 'INVALID_ARGUMENT',
    message: 'Form answers validation failed.',
  },
  FORM_ANSWERS_VALIDATION_FAILED: {
    status: 400,
    code: 'INVALID_ARGUMENT',
    message: 'Form answers validation failed.',
  },
  FORM_CONSENT_REQUIRED: {
    status: 400,
    code: 'INVALID_ARGUMENT',
    message: 'Consent form is required and must follow a primary form.',
  },
  FORM_CONSENT_REQUIRES_PRIMARY: {
    status: 400,
    code: 'INVALID_ARGUMENT',
    message: 'Consent form is required and must follow a primary form.',
  },
  FORM_BATCH_SIZE_INVALID: {
    status: 400,
    code: 'INVALID_ARGUMENT',
    message: 'Form batch must contain between 1 and 8 documents.',
  },
  FORM_TEMPLATE_NOT_FOUND: {
    status: 404,
    code: 'FORM_TEMPLATE_NOT_FOUND',
    message: 'Form template not found.',
  },
  DOCUMENT_INTAKE_BLOCKED: {
    status: 400,
    code: 'DOCUMENT_INTAKE_BLOCKED',
    message: 'One or more documents failed security scanning.',
  },
  DOCUMENT_SCHEMA_OUTDATED: {
    status: 503,
    code: 'DOCUMENT_SCHEMA_OUTDATED',
    message:
      'Document database schema is outdated (missing scan statuses). Restart the app after rebuild so migrations can run.',
  },
  RATE_LIMITED: {
    status: 429,
    code: 'RATE_LIMITED',
    message: 'Too many requests. Please wait and try again.',
  },
  CAPTIVE_CLIENT_MISSING: {
    status: 400,
    code: 'CAPTIVE_CLIENT_MISSING',
    message: 'Captive portal client context is missing.',
  },
  CAPTIVE_AUTH_FAILED: {
    status: 502,
    code: 'CAPTIVE_AUTH_FAILED',
    message: 'Captive portal authorization failed.',
  },
  PORTAL_DISABLED: {
    status: 403,
    code: 'PORTAL_DISABLED',
    message: 'Das Patientenportal ist in dieser Praxis derzeit nicht aktiv.',
  },
  SANDBOX_UNAVAILABLE: {
    status: 502,
    code: 'SANDBOX_UNAVAILABLE',
    message: 'Sandbox service is unavailable.',
  },
} as const satisfies Record<string, DomainErrorHttpSpec>;

const SANDBOX_UNAVAILABLE_SPEC = DOMAIN_ERROR_HTTP.SANDBOX_UNAVAILABLE;

export type DomainErrorCode = keyof typeof DOMAIN_ERROR_HTTP;

const DOMAIN_ERROR_PREFIXES: Array<{ prefix: string; key: DomainErrorCode }> = [
  { prefix: 'UNKNOWN_MESSAGING_PROVIDER:', key: 'UNKNOWN_MESSAGING_PROVIDER' },
  { prefix: 'FORM_DOCUMENT_SCAN_', key: 'DOCUMENT_INTAKE_BLOCKED' },
];

const SANDBOX_UNAVAILABLE_PREFIXES = [
  'SANDBOX_PREVIEW_',
  'SANDBOX_FORM_RENDER_',
  'SANDBOX_INTAKE_',
  'SANDBOX_CONTENT_',
  'SANDBOX_DELETE_',
  'SANDBOX_PURGE_',
  'SANDBOX_HEALTH_',
  'SANDBOX_RUNTIME_RESTART_',
] as const;

function isSandboxUnavailableMessage(rawMessage: string): boolean {
  if (rawMessage === 'SANDBOX_INTERNAL_TOKEN is required') {
    return true;
  }
  return SANDBOX_UNAVAILABLE_PREFIXES.some((prefix) => rawMessage.startsWith(prefix));
}

function isDocumentSchemaOutdatedMessage(rawMessage: string): boolean {
  return rawMessage.includes('CHECK constraint failed') && rawMessage.includes('status');
}

function lookupDomainErrorHttp(rawMessage: string): DomainErrorHttpSpec | null {
  const direct = DOMAIN_ERROR_HTTP[rawMessage as DomainErrorCode];
  if (direct) {
    return direct;
  }

  for (const entry of DOMAIN_ERROR_PREFIXES) {
    if (rawMessage.startsWith(entry.prefix)) {
      return DOMAIN_ERROR_HTTP[entry.key];
    }
  }

  if (isSandboxUnavailableMessage(rawMessage)) {
    return SANDBOX_UNAVAILABLE_SPEC;
  }

  if (isDocumentSchemaOutdatedMessage(rawMessage)) {
    return DOMAIN_ERROR_HTTP.DOCUMENT_SCHEMA_OUTDATED;
  }

  return null;
}

export function isExpectedDomainError(message: string): boolean {
  if (lookupDomainErrorHttp(message)) {
    return true;
  }

  return false;
}

export function isKnownDomainErrorCode(code: string): code is ApiErrorCode | 'UNKNOWN_ERROR' {
  return code === 'UNKNOWN_ERROR' || (API_ERROR_CODES as readonly string[]).includes(code);
}

export type ResolvedDomainError = {
  code: ApiErrorCode | 'UNKNOWN_ERROR';
  rawMessage: string;
  http: DomainErrorHttpSpec | null;
};

export function resolveDomainError(error: unknown): ResolvedDomainError | null {
  const rawMessage = readDomainCode(error);
  if (!rawMessage) {
    return null;
  }

  const http = lookupDomainErrorHttp(rawMessage);
  return {
    code: http?.code ?? 'UNKNOWN_ERROR',
    rawMessage,
    http,
  };
}

export type DomainErrorMessageOverrides = {
  /** Override by domain throw code (e.g. `UNKNOWN_TOPIC` even when API code is `INVALID_ARGUMENT`). */
  byDomainCode?: Partial<Record<string, string>>;
  /** Override by API response code. */
  byApiCode?: Partial<Record<ApiErrorCode, string>>;
};

export function sendDomainError(
  reply: FastifyReply,
  error: unknown,
  overrides?: Partial<ApiErrorPayload> & DomainErrorMessageOverrides,
): boolean {
  const resolved = resolveDomainError(error);
  if (!resolved?.http) {
    return false;
  }

  const message =
    overrides?.message ??
    overrides?.byDomainCode?.[resolved.rawMessage] ??
    overrides?.byApiCode?.[resolved.code as ApiErrorCode] ??
    resolved.http.message;

  const payload: ApiErrorPayload = {
    code: overrides?.code ?? resolved.http.code,
    message,
    details: overrides?.details,
  };
  void reply.code(resolved.http.status).send(payload);
  return true;
}

export function sendResolvedDomainError(
  reply: FastifyReply,
  error: unknown,
  messageOverrides?: DomainErrorMessageOverrides,
): boolean {
  return sendDomainError(reply, error, messageOverrides);
}
