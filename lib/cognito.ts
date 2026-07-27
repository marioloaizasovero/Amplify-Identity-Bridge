import { config } from "@/lib/config";

export function buildCognitoAuthorizeUrl(input: {
  state: string;
  nonce: string;
}) {
  const authorizeUrl = new URL("/oauth2/authorize", config.cognitoDomain);

  authorizeUrl.searchParams.set("client_id", config.cognitoClientId);
  authorizeUrl.searchParams.set("redirect_uri", config.cognitoRedirectUri);
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("scope", config.cognitoScopes);
  authorizeUrl.searchParams.set("state", input.state);
  authorizeUrl.searchParams.set("nonce", input.nonce);
  authorizeUrl.searchParams.set("prompt", "none");

  return authorizeUrl;
}
