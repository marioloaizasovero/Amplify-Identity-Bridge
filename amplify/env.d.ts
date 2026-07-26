declare module "$amplify/env/cognito-token-exchange" {
  export const env: {
    AWS_REGION: string;
    COGNITO_CLIENT_ID: string;
    COGNITO_CLIENT_SECRET: string;
    COGNITO_DOMAIN: string;
    COGNITO_USER_POOL_ID: string;
  };
}
