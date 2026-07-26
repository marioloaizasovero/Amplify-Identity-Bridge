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

export const config = {
  awsRegion: readEnv("AWS_REGION"),
  bridgeBaseUrl: readUrlEnv("BRIDGE_BASE_URL", "http://localhost:3000"),
  cognitoDomain: readUrlEnv(
    "COGNITO_DOMAIN",
    "https://loginstaging.toyota.cl",
  ),
  cognitoClientId: readEnv(
    "COGNITO_CLIENT_ID",
    "4lnjhfjhs73u5k1v72h9jk1rnr",
  ),
  cognitoRedirectUri: readUrlEnv(
    "COGNITO_REDIRECT_URI",
    "http://localhost:3000/api/auth/cognito/callback",
  ),
  cognitoScopes: readEnv(
    "COGNITO_SCOPES",
    "openid email profile aws.cognito.signin.user.admin",
  ),
  cognitoStateTtlSeconds: readIntegerEnv(
    "COGNITO_STATE_TTL_SECONDS",
    300,
    { min: 60, max: 900 },
  ),
  bridgeSessionTtlSeconds: readIntegerEnv(
    "BRIDGE_SESSION_TTL_SECONDS",
    900,
    { min: 60, max: 86_400 },
  ),
  enableCognitoDebug: readBooleanEnv(
    "ENABLE_COGNITO_DEBUG",
    process.env.NODE_ENV !== "production",
  ),
  vtexClientId: readEnv("VTEX_CLIENT_ID", "dummy-vtex-client-id"),
  vtexAllowedRedirectUri: readUrlEnv(
    "VTEX_ALLOWED_REDIRECT_URI",
    "https://dummy-vtex.example.com/callback",
  ),
};
