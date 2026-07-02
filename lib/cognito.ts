export function getDummyCognitoConfig() {
  return {
    provider: "cognito",
    mode: "dummy",
  };
}

export function buildDummyCognitoAuthorizeUrl() {
  return new URL("https://dummy-cognito.example.com/oauth2/authorize");
}

export async function exchangeDummyCognitoCode(code: string) {
  return {
    access_token: `dummy-cognito-access-token-${code}`,
    id_token: `dummy-cognito-id-token-${code}`,
    token_type: "Bearer",
    expires_in: 3600,
  };
}

export async function verifyDummyCognitoIdToken() {
  return {
    sub: "dummy-cognito-user",
    email: "dummy@example.com",
    name: "Dummy User",
  };
}
