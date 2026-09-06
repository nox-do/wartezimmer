import { readLogLevelFromEnv } from '@praxis-flow/server-shared/logger';

type SandboxLogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVEL_RANK: Record<SandboxLogLevel | 'fatal' | 'silent', number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  fatal: 50,
  silent: 100,
};

function shouldEmit(level: SandboxLogLevel): boolean {
  const configured = readLogLevelFromEnv();
  const configuredRank =
    LOG_LEVEL_RANK[configured as keyof typeof LOG_LEVEL_RANK] ?? LOG_LEVEL_RANK.info;
  return LOG_LEVEL_RANK[level] >= configuredRank;
}

export function truncateLogTail(text: string, maxLength = 500): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `…${normalized.slice(-maxLength)}`;
}

/** Bootstrap logging before Fastify is available (entrypoint). See docs/architecture/logging.md. */
export function logSandboxWarn(message: string, meta?: Record<string, unknown>): void {
  if (!shouldEmit('warn')) {
    return;
  }
  if (meta && Object.keys(meta).length > 0) {
    console.warn('[sandbox]', message, meta);
    return;
  }
  console.warn('[sandbox]', message);
}

export function logSandboxInfo(message: string, meta?: Record<string, unknown>): void {
  if (!shouldEmit('info')) {
    return;
  }
  if (meta && Object.keys(meta).length > 0) {
    console.info('[sandbox]', message, meta);
    return;
  }
  console.info('[sandbox]', message);
}
