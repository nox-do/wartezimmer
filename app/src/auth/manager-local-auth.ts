import type { FastifyRequest } from 'fastify';

export const MANAGER_LOCAL_HEADER = 'x-praxis-manager-local';

const MANAGER_LOCAL_OPS_ROUTES = new Set([
  'GET /api/v1/ops/settings/capabilities',
  'GET /api/v1/ops/settings',
  'PATCH /api/v1/ops/settings',
]);

function isLoopbackAddress(value: string | undefined): boolean {
  const address = value?.trim();
  if (!address) {
    return false;
  }

  return (
    address === '::1' ||
    address === '127.0.0.1' ||
    address.startsWith('127.') ||
    address === '::ffff:127.0.0.1' ||
    address.startsWith('::ffff:127.')
  );
}

export function isManagerLocalTrustedRequest(request: FastifyRequest): boolean {
  const header = request.headers[MANAGER_LOCAL_HEADER];
  if (header !== '1') {
    return false;
  }

  return (
    isLoopbackAddress(request.ip) ||
    isLoopbackAddress(request.socket.remoteAddress) ||
    isLoopbackAddress(request.headers['x-forwarded-for']?.toString().split(',')[0]?.trim())
  );
}

export function resolveManagerLocalOpsRole(
  request: FastifyRequest,
  method: string,
  routePath: string,
): 'ops' | null {
  if (!MANAGER_LOCAL_OPS_ROUTES.has(`${method} ${routePath}`)) {
    return null;
  }

  return isManagerLocalTrustedRequest(request) ? 'ops' : null;
}
