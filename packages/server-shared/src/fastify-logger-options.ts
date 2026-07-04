import type { FastifyServerOptions } from 'fastify';

const LOG_LEVELS = new Set(['debug', 'info', 'warn', 'error', 'fatal', 'silent']);

export function readLogLevelFromEnv(): string {
  const raw = process.env.LOG_LEVEL?.trim().toLowerCase();
  if (raw && LOG_LEVELS.has(raw)) {
    return raw;
  }
  return process.env.NODE_ENV === 'production' ? 'warn' : 'info';
}

export function buildFastifyLoggerOptions(): FastifyServerOptions['logger'] {
  return {
    level: readLogLevelFromEnv(),
  };
}

/** Suppress per-request access logs for high-frequency probe routes. */
export const SILENT_ROUTE_LOG = { logLevel: 'silent' as const };
