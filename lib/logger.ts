type LogContext = Record<string, string | number | boolean | undefined>;

export function logError(message: string, error: unknown, context: LogContext = {}) {
  const details = error instanceof Error ? { error: error.message } : { error: String(error) };
  console.error(JSON.stringify({ level: "error", mode: "bridge", message, ...details, ...context }));
}
