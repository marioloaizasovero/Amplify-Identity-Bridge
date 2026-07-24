function readEnv(name: string, fallback?: string) {
  const value = process.env[name] ?? fallback;

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function readNumberEnv(name: string, fallback: number) {
  const value = Number(process.env[name] ?? fallback);

  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`Invalid numeric environment variable: ${name}`);
  }

  return value;
}

export const config = {
  awsRegion: readEnv("AWS_REGION", "us-east-1"),
  bridgeBaseUrl: readEnv("BRIDGE_BASE_URL", "http://localhost:3000"),
  cognitoDomain: readEnv("COGNITO_DOMAIN", "https://loginstaging.toyota.cl"),
  cognitoClientId: readEnv(
    "COGNITO_CLIENT_ID",
    "4lnjhfjhs73u5k1v72h9jk1rnr",
  ),
  cognitoRedirectUri: readEnv(
    "COGNITO_REDIRECT_URI",
    "http://localhost:3000/api/auth/cognito/callback",
  ),
  cognitoScopes: readEnv(
    "COGNITO_SCOPES",
    "openid email profile aws.cognito.signin.user.admin",
  ),
  cognitoStateTtlSeconds: readNumberEnv("COGNITO_STATE_TTL_SECONDS", 300),
  bridgeSessionTtlSeconds: readNumberEnv("BRIDGE_SESSION_TTL_SECONDS", 900),
  vtexClientId: process.env.VTEX_CLIENT_ID ?? "dummy-vtex-client-id",
  vtexAllowedRedirectUri:
    process.env.VTEX_ALLOWED_REDIRECT_URI ?? "https://dummy-vtex.example.com/callback",
};
