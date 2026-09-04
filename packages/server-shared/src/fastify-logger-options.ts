import type { FastifyServerOptions } from 'fastify';
import pino, { type Logger } from 'pino';

const LOG_LEVELS = new Set(['debug', 'info', 'warn', 'error', 'fatal', 'silent']);

export function readLogLevelFromEnv(): string {
  const raw = process.env.LOG_LEVEL?.trim().toLowerCase();
  if (raw && LOG_LEVELS.has(raw)) {
    return raw;
  }
  return process.env.NODE_ENV === 'production' ? 'warn' : 'info';
}

let rootLogger: Logger | null = null;

/** Shared Pino root for this process (Fastify + background modules). */
export function getRootLogger(): Logger {
  if (!rootLogger) {
    rootLogger = pino({ level: readLogLevelFromEnv() });
  }
  return rootLogger;
}

/** Background / shared-module child logger (`module` field in JSON logs). */
export function createModuleLogger(module: string): Logger {
  return getRootLogger().child({ module });
}

export function buildFastifyLoggerOptions(): FastifyServerOptions['logger'] {
  return getRootLogger();
}

/** Suppress per-request access logs for high-frequency probe routes. */
export const SILENT_ROUTE_LOG = { logLevel: 'silent' as const };

/** Test helper — drop cached root so the next call re-reads `LOG_LEVEL`. */
export function resetRootLoggerForTests(): void {
  rootLogger = null;
}
