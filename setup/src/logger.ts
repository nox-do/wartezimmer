type LogContext = Record<string, unknown>;

type SetupLogger = {
  error(context: LogContext, message: string): void;
};

function serializeError(value: unknown, seen = new Set<Error>()): unknown {
  if (!(value instanceof Error)) return value;
  if (seen.has(value)) return '[Circular error cause]';
  if (seen.size >= 8) return '[Error cause depth limit]';
  seen.add(value);
  return {
    name: value.name,
    message: value.message,
    stack: value.stack,
    ...(value.cause !== undefined ? { cause: serializeError(value.cause, seen) } : {}),
  };
}

export function createModuleLogger(module: string): SetupLogger {
  return {
    error(context, message) {
      const normalized = Object.fromEntries(
        Object.entries(context).map(([key, value]) => [key, serializeError(value)]),
      );
      console.error(JSON.stringify({ level: 'error', module, message, ...normalized }));
    },
  };
}
