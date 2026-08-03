import { defineFunction, secret } from "@aws-amplify/backend";

function requiredEnv(name: string) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required backend environment variable: ${name}`);
  }

  return value;
}

function logLevelEnv() {
  const value = process.env.LOG_LEVEL?.trim().toLowerCase() ?? "info";

  if (!["error", "warn", "info", "debug"].includes(value)) {
    throw new Error(
      "Invalid backend environment variable: LOG_LEVEL must be error, warn, info or debug.",
    );
  }

  return value;
}

export const cognitoTokenExchange = defineFunction({
  name: "cognito-token-exchange",
  entry: "./handler.ts",
  timeoutSeconds: 15,
  environment: {
    COGNITO_CLIENT_ID: requiredEnv("COGNITO_CLIENT_ID"),
    COGNITO_CLIENT_SECRET: secret("COGNITO_CLIENT_SECRET"),
    COGNITO_DOMAIN: requiredEnv("COGNITO_DOMAIN"),
    COGNITO_REDIRECT_URI: requiredEnv("COGNITO_REDIRECT_URI"),
    COGNITO_USER_POOL_ID: requiredEnv("COGNITO_USER_POOL_ID"),
    LOG_LEVEL: logLevelEnv(),
  },
});
