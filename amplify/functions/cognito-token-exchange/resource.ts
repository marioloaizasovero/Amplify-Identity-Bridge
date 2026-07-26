import { defineFunction, secret } from "@aws-amplify/backend";

export const cognitoTokenExchange = defineFunction({
  name: "cognito-token-exchange",
  entry: "./handler.ts",
  timeoutSeconds: 10,
  environment: {
    AWS_REGION: process.env.AWS_REGION ?? "us-east-1",
    COGNITO_CLIENT_ID:
      process.env.COGNITO_CLIENT_ID ?? "4lnjhfjhs73u5k1v72h9jk1rnr",
    COGNITO_CLIENT_SECRET: secret("COGNITO_CLIENT_SECRET"),
    COGNITO_DOMAIN:
      process.env.COGNITO_DOMAIN ?? "https://loginstaging.toyota.cl",
    COGNITO_USER_POOL_ID:
      process.env.COGNITO_USER_POOL_ID ?? "us-east-1_LPM0238QU",
  },
});
