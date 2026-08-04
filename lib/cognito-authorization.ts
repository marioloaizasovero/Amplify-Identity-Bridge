export type CognitoAuthorizationInput = {
  clientId: string;
  domain: string;
  nonce?: string;
  prompt?: "login" | "none";
  redirectUri: string;
  scopes: string;
  state?: string;
};

export function buildCognitoAuthorizationUrl(
  input: CognitoAuthorizationInput,
) {
  const scopes = input.scopes.trim().split(/\s+/).filter(Boolean);

  if (!scopes.includes("openid")) {
    throw new Error("Cognito authorization scopes must include openid.");
  }

  const authorizationUrl = new URL("/oauth2/authorize", input.domain);
  authorizationUrl.searchParams.set("response_type", "code");
  authorizationUrl.searchParams.set("client_id", input.clientId);
  authorizationUrl.searchParams.set("redirect_uri", input.redirectUri);
  authorizationUrl.searchParams.set("scope", scopes.join(" "));
  if (input.state) {
    authorizationUrl.searchParams.set("state", input.state);
  }

  if (input.nonce) {
    authorizationUrl.searchParams.set("nonce", input.nonce);
  }

  if (input.prompt) {
    authorizationUrl.searchParams.set("prompt", input.prompt);
  }

  return authorizationUrl;
}
