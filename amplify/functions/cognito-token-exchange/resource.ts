import { defineFunction, secret } from "@aws-amplify/backend";

function requiredEnv(name: string) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required backend environment variable: ${name}`);
  }

  return value;
}

export const cognitoTokenExchange = defineFunction({
  name: "cognito-token-exchange",
  entry: "./handler.ts",
  timeoutSeconds: 10,
  environment: {
    COGNITO_CLIENT_ID: requiredEnv("COGNITO_CLIENT_ID"),
    COGNITO_CLIENT_SECRET: secret("COGNITO_CLIENT_SECRET"),
    COGNITO_DOMAIN: requiredEnv("COGNITO_DOMAIN"),
    COGNITO_REDIRECT_URI: requiredEnv("COGNITO_REDIRECT_URI"),
    COGNITO_USER_POOL_ID: requiredEnv("COGNITO_USER_POOL_ID"),
  },
});
