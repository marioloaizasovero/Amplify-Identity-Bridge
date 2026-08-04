import { config } from "@/lib/config";
import { secureStringEqual } from "@/lib/crypto";
import type { CognitoClaims } from "@/lib/session-store";

export const vtexAuthorizationCodeTtlSeconds = 300;
export const vtexAccessTokenTtlSeconds = 900;

export function buildVtexStoreLoginUrl() {
  const url = new URL(config.vtexStoreLoginUrl);
  url.searchParams.set("oAuthRedirect", config.vtexOAuthProvider);
  url.searchParams.set("returnUrl", config.vtexReturnUrl);

  return url;
}

export function isAllowedVtexAuthorizationRequest(input: {
  clientId: string | null;
  redirectUri: string | null;
}) {
  return (
    input.clientId === config.vtexClientId &&
    input.redirectUri === config.vtexAllowedRedirectUri
  );
}

export function isValidOAuthState(state: string | null): state is string {
  return Boolean(state && state.length >= 16 && state.length <= 2_048);
}

export function validateVtexClientCredentials(input: {
  clientId: string;
  clientSecret: string;
}) {
  return (
    secureStringEqual(input.clientId, config.vtexClientId) &&
    secureStringEqual(input.clientSecret, config.vtexClientSecret)
  );
}

export function readBasicClientCredentials(
  authorizationHeader: string | null,
) {
  const match = authorizationHeader?.match(/^Basic\s+(.+)$/i);

  if (!match) {
    return null;
  }

  try {
    const decoded = Buffer.from(
      match[1],
      "base64",
    ).toString("utf8");
    const separatorIndex = decoded.indexOf(":");

    if (separatorIndex < 1) {
      return null;
    }

    return {
      clientId: decoded.slice(0, separatorIndex),
      clientSecret: decoded.slice(separatorIndex + 1),
    };
  } catch {
    return null;
  }
}

export function mapVtexUserInfo(claims: CognitoClaims) {
  if (!claims.sub || !claims.email) {
    return null;
  }

  return {
    userId: claims.sub,
    email: claims.email,
    name: claims.name ?? claims.username ?? claims.email,
  };
}
