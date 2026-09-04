export class OpsSettingsValidationError extends Error {
  readonly detailMessage: string;
  readonly apiCode?: string;
  readonly details?: Record<string, unknown>;

  constructor(
    detailMessage: string,
    options?: { apiCode?: string; details?: Record<string, unknown> },
  ) {
    super('OPS_SETTINGS_INVALID');
    this.name = 'OpsSettingsValidationError';
    this.detailMessage = detailMessage;
    this.apiCode = options?.apiCode;
    this.details = options?.details;
  }
}

const OPS_SETTINGS_ERROR_HTTP_STATUS: Record<string, number> = {
  ROUTING_MODE_CHANGE_BLOCKED: 409,
  JOURNEY_TEMPLATE_LOCKED: 409,
  COMPLEX_ROUTING_NOT_LICENSED: 403,
};

export function opsSettingsInvalidHttpStatus(code: string): number {
  return OPS_SETTINGS_ERROR_HTTP_STATUS[code] ?? 400;
}

export function opsSettingsInvalidResponse(
  error: unknown,
): { message: string; code: string; details?: Record<string, unknown> } | undefined {
  if (error instanceof OpsSettingsValidationError) {
    return {
      message: error.detailMessage,
      code: error.apiCode ?? 'INVALID_ARGUMENT',
      details: error.details,
    };
  }
  if (
    error instanceof Error &&
    error.message === 'OPS_SETTINGS_INVALID' &&
    error.cause instanceof Error
  ) {
    return {
      message: error.cause.message,
      code: 'INVALID_ARGUMENT',
    };
  }
  return undefined;
}
