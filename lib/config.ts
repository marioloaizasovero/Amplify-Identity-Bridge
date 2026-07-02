export const config = {
  mode: "dummy",
  bridgeBaseUrl: process.env.BRIDGE_BASE_URL ?? "http://localhost:3000",
  cognitoDomain: process.env.COGNITO_DOMAIN ?? "https://dummy-cognito.example.com",
  cognitoClientId: process.env.COGNITO_CLIENT_ID ?? "dummy-cognito-client-id",
  cognitoRedirectUri:
    process.env.COGNITO_REDIRECT_URI ?? "http://localhost:3000/api/auth/vtex/callback",
  cognitoScopes: process.env.COGNITO_SCOPES ?? "openid email profile",
  vtexClientId: process.env.VTEX_CLIENT_ID ?? "dummy-vtex-client-id",
  vtexAllowedRedirectUri:
    process.env.VTEX_ALLOWED_REDIRECT_URI ?? "https://dummy-vtex.example.com/callback",
};
