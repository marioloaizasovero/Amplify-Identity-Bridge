type DummyLogContext = Record<string, string | number | boolean | undefined>;

export function logInfo(message: string, context: DummyLogContext = {}) {
  console.info(JSON.stringify({ level: "info", mode: "dummy", message, ...context }));
}

export function logError(message: string, error: unknown, context: DummyLogContext = {}) {
  const details = error instanceof Error ? { error: error.message } : { error: String(error) };
  console.error(JSON.stringify({ level: "error", mode: "dummy", message, ...details, ...context }));
}
