export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVEL_RANK: Record<LogLevel | 'fatal' | 'silent', number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
  fatal: 50,
  silent: 100,
};

function readConfiguredLogLevelRank(): number {
  const raw = process.env.LOG_LEVEL?.trim().toLowerCase();
  if (raw && raw in LOG_LEVEL_RANK) {
    return LOG_LEVEL_RANK[raw as keyof typeof LOG_LEVEL_RANK];
  }
  return process.env.NODE_ENV === 'production' ? LOG_LEVEL_RANK.warn : LOG_LEVEL_RANK.info;
}

function shouldEmitLog(level: LogLevel): boolean {
  return LOG_LEVEL_RANK[level] >= readConfiguredLogLevelRank();
}

export function log(level: LogLevel, message: string, context?: string, meta?: unknown): void {
  if (!shouldEmitLog(level)) {
    return;
  }

  const prefix = context ? `[${context}]` : '[app]';
  switch (level) {
    case 'debug':
      console.debug(prefix, message, meta ?? '');
      break;
    case 'info':
      console.info(prefix, message, meta ?? '');
      break;
    case 'warn':
      console.warn(prefix, message, meta ?? '');
      break;
    case 'error':
      console.error(prefix, message, meta ?? '');
      break;
  }
}

export function createLogger(context: string): {
  debug: (message: string, meta?: unknown) => void;
  info: (message: string, meta?: unknown) => void;
  warn: (message: string, meta?: unknown) => void;
  error: (message: string, meta?: unknown) => void;
} {
  return {
    debug: (message, meta) => log('debug', message, context, meta),
    info: (message, meta) => log('info', message, context, meta),
    warn: (message, meta) => log('warn', message, context, meta),
    error: (message, meta) => log('error', message, context, meta),
  };
}
