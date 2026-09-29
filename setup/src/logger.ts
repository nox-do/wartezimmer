type LogContext = Record<string, unknown>;

type SetupLogger = {
  error(context: LogContext, message: string): void;
};

function serializeError(value: unknown): unknown {
  if (!(value instanceof Error)) return value;
  return {
    name: value.name,
    message: value.message,
    stack: value.stack,
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
