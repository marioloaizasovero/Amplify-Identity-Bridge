const isProduction = process.env.NODE_ENV === "production";

function readEnv(name: string, developmentFallback?: string) {
  const value =
    process.env[name] ??
    (isProduction ? undefined : developmentFallback);

  if (!value?.trim()) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value.trim();
}

function readUrlEnv(name: string, developmentFallback?: string) {
  const value = readEnv(name, developmentFallback);

  try {
    return new URL(value).toString();
  } catch {
    throw new Error(`Invalid URL environment variable: ${name}`);
  }
}

function readPathEnv(name: string, developmentFallback: string) {
  const value =
    process.env[name] ??
    (isProduction ? undefined : developmentFallback);

  if (
    !value ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\")
  ) {
    throw new Error(
      `Invalid path environment variable: ${name} must be a relative path starting with /.`,
    );
  }

  return value;
}

function readIntegerEnv(
  name: string,
  developmentFallback: number,
  limits: { min: number; max: number },
) {
  const rawValue =
    process.env[name] ??
    (isProduction ? undefined : String(developmentFallback));
  const value = Number(rawValue);

  if (
    !Number.isSafeInteger(value) ||
    value < limits.min ||
    value > limits.max
  ) {
    throw new Error(
      `Invalid integer environment variable: ${name} must be between ${limits.min} and ${limits.max}`,
    );
  }

  return value;
}

function readBooleanEnv(name: string, fallback: boolean) {
  const value = process.env[name];

  if (value === undefined) {
    return fallback;
  }

  if (value === "true") {
    return true;
  }

  if (value === "false") {
    return false;
  }

  throw new Error(`Invalid boolean environment variable: ${name}`);
}

export type LogLevel = "error" | "warn" | "info" | "debug";

function readLogLevelEnv(name: string, fallback: LogLevel): LogLevel {
  const value = process.env[name]?.trim().toLowerCase() ?? fallback;

  if (
    value !== "error" &&
    value !== "warn" &&
    value !== "info" &&
    value !== "debug"
  ) {
    throw new Error(
      `Invalid log level environment variable: ${name} must be error, warn, info or debug.`,
    );
  }

  return value;
}

export const config = {
  awsRegion: readEnv("AWS_REGION"),
  bridgeBaseUrl: readUrlEnv("BRIDGE_BASE_URL", "http://localhost:3000"),
  cognitoDomain: readUrlEnv(
    "COGNITO_DOMAIN",
    "https://example.auth.us-east-1.amazoncognito.com",
  ),
  cognitoClientId: readEnv(
    "COGNITO_CLIENT_ID",
    "dummy-cognito-client-id",
  ),
  cognitoRedirectUri: readUrlEnv(
    "COGNITO_REDIRECT_URI",
    "http://localhost:3000/api/auth/cognito/callback",
  ),
  cognitoScopes: readEnv(
    "COGNITO_SCOPES",
    "openid email profile",
  ),
  oauthStateTtlSeconds: 300,
  bridgeSessionTtlSeconds: readIntegerEnv(
    "BRIDGE_SESSION_TTL_SECONDS",
    900,
    { min: 60, max: 86_400 },
  ),
  enableCognitoDebug: readBooleanEnv(
    "ENABLE_COGNITO_DEBUG",
    process.env.NODE_ENV !== "production",
  ),
  enableVtexCredentialGenerator: readBooleanEnv(
    "ENABLE_VTEX_CREDENTIAL_GENERATOR",
    false,
  ),
  enableVtexSimulator: readBooleanEnv("ENABLE_VTEX_SIMULATOR", false),
  logLevel: readLogLevelEnv("LOG_LEVEL", "info"),
  vtexClientId: readEnv("VTEX_CLIENT_ID", "dummy-vtex-client-id"),
  vtexClientSecret: readEnv(
    "VTEX_CLIENT_SECRET",
    "dummy-vtex-client-secret",
  ),
  vtexAllowedRedirectUri: readUrlEnv(
    "VTEX_ALLOWED_REDIRECT_URI",
    "https://dummy-vtex.example.com/callback",
  ),
  vtexStoreLoginUrl: readUrlEnv(
    "VTEX_STORE_LOGIN_URL",
    "http://localhost:3000/login",
  ),
  vtexOAuthProvider: readEnv(
    "VTEX_OAUTH_PROVIDER",
    "ToyotaSSO",
  ),
  vtexReturnUrl: readPathEnv("VTEX_RETURN_URL", "/"),
};
