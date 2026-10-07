import {
  ManagerApiError,
  type ManagerErrorCategory,
  type SetupApiErrorResponse,
} from '@wartezimmer/server-shared/setup-api';

const statusByCategory: Record<ManagerErrorCategory, number> = {
  validation: 400,
  conflict: 409,
  unavailable: 503,
  timeout: 504,
  // The request was understood, but the host operation could not be completed.
  'operation-failed': 422,
  inconsistent: 409,
  internal: 500,
};

export function resolveSetupApiError(error: unknown): {
  status: number;
  body: SetupApiErrorResponse;
} {
  const publicError =
    error instanceof ManagerApiError
      ? error.toJSON()
      : {
          code: 'internal_error',
          category: 'internal' as const,
          message: 'Die Aktion konnte wegen eines internen Fehlers nicht abgeschlossen werden.',
          retryable: false,
        };
  // HTTP protocol errors keep their specific status without adding public categories.
  const status =
    publicError.code === 'setup_auth_required'
      ? 401
      : publicError.code === 'setup_route_not_found'
        ? 404
        : statusByCategory[publicError.category];
  return { status, body: { error: publicError } };
}
