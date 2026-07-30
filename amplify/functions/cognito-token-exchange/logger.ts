type LogLevel = "error" | "warn" | "info" | "debug";
type LogContext = Record<string, unknown>;

const priorities: Record<LogLevel, number> = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

function configuredLogLevel(): LogLevel {
  const value = process.env.LOG_LEVEL?.trim().toLowerCase();

  return value === "error" ||
    value === "warn" ||
    value === "info" ||
    value === "debug"
    ? value
    : "info";
}

function writeLog(
  level: LogLevel,
  message: string,
  context: LogContext = {},
) {
  if (priorities[level] > priorities[configuredLogLevel()]) {
    return;
  }

  const entry = JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    service: "cognito-token-exchange",
    message,
    ...context,
  });

  if (level === "error") {
    console.error(entry);
  } else if (level === "warn") {
    console.warn(entry);
  } else {
    console.log(entry);
  }
}

export function logDebug(message: string, context: LogContext = {}) {
  writeLog("debug", message, context);
}

export function logInfo(message: string, context: LogContext = {}) {
  writeLog("info", message, context);
}

export function logWarn(message: string, context: LogContext = {}) {
  writeLog("warn", message, context);
}

export function logError(
  message: string,
  error: unknown,
  context: LogContext = {},
) {
  writeLog("error", message, {
    ...context,
    errorName: error instanceof Error ? error.name : undefined,
    errorMessage: error instanceof Error ? error.message : String(error),
    stack:
      configuredLogLevel() === "debug" && error instanceof Error
        ? error.stack
        : undefined,
  });
}
