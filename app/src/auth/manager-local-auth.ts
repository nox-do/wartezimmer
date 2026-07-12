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

function isLoopbackHostname(hostname: string): boolean {
  const normalized = hostname.trim().toLowerCase();
  return normalized === 'localhost' || isLoopbackAddress(normalized);
}

/** Host-bound local access (e.g. Setup-API on host → published 127.0.0.1:8080 in Docker). */
function isLocalHostBoundRequest(request: FastifyRequest): boolean {
  const hostHeader = request.headers.host?.split(',')[0]?.trim() ?? '';
  if (!hostHeader) {
    return false;
  }

  try {
    const url = hostHeader.includes('://') ? new URL(hostHeader) : new URL(`http://${hostHeader}`);
    return isLoopbackHostname(url.hostname);
  } catch {
    const hostname = hostHeader.includes(':')
      ? hostHeader.slice(0, hostHeader.lastIndexOf(':'))
      : hostHeader;
    return isLoopbackHostname(hostname);
  }
}

export function isManagerLocalTrustedRequest(request: FastifyRequest): boolean {
  const header = request.headers[MANAGER_LOCAL_HEADER];
  if (header !== '1') {
    return false;
  }

  if (isLocalHostBoundRequest(request)) {
    return true;
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
