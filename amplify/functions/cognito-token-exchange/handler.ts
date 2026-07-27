import { env } from "$amplify/env/cognito-token-exchange";
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";

type TokenExchangeEvent = {
  code?: string;
  redirectUri?: string;
  expectedNonce?: string;
};

type SafeClaims = {
  sub?: string;
  email?: string;
  emailVerified?: boolean;
  name?: string;
  username?: string;
};

type TokenResponse = {
  id_token?: string;
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
  error?: string;
  error_description?: string;
};

function getIssuer() {
  const awsRegion = process.env.AWS_REGION;

  if (!awsRegion) {
    throw new Error("Missing Lambda runtime AWS_REGION.");
  }

  return `https://cognito-idp.${awsRegion}.amazonaws.com/${env.COGNITO_USER_POOL_ID}`;
}

function getSafeClaims(payload: JWTPayload): SafeClaims {
  return {
    sub: payload.sub,
    email: typeof payload.email === "string" ? payload.email : undefined,
    emailVerified:
      payload.email_verified === true || payload.email_verified === "true",
    name: typeof payload.name === "string" ? payload.name : undefined,
    username:
      typeof payload["cognito:username"] === "string"
        ? payload["cognito:username"]
        : undefined,
  };
}

export const handler = async (event: TokenExchangeEvent) => {
  if (!event.code || !event.redirectUri) {
    return {
      ok: false,
      error: "missing_token_exchange_input",
    };
  }

  if (event.redirectUri !== env.COGNITO_REDIRECT_URI) {
    return {
      ok: false,
      error: "invalid_redirect_uri",
    };
  }

  try {
    const tokenResponse = await fetch(`${env.COGNITO_DOMAIN}/oauth2/token`, {
      method: "POST",
      headers: {
        authorization:
          "Basic " +
          Buffer.from(
            `${env.COGNITO_CLIENT_ID}:${env.COGNITO_CLIENT_SECRET}`,
          ).toString("base64"),
        "content-type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        code: event.code,
        grant_type: "authorization_code",
        redirect_uri: event.redirectUri,
      }),
      signal: AbortSignal.timeout(8_000),
    });

    const tokenPayload = (await tokenResponse.json()) as TokenResponse;

    if (!tokenResponse.ok || !tokenPayload.id_token) {
      return {
        ok: false,
        error: tokenPayload.error ?? "token_exchange_failed",
        detail: tokenPayload.error_description,
      };
    }

    const issuer = getIssuer();
    const jwks = createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`));
    const { payload } = await jwtVerify(tokenPayload.id_token, jwks, {
      audience: env.COGNITO_CLIENT_ID,
      issuer,
    });

    if (payload.token_use !== "id") {
      return {
        ok: false,
        error: "invalid_token_use",
      };
    }

    if (event.expectedNonce && payload.nonce !== event.expectedNonce) {
      return {
        ok: false,
        error: "invalid_nonce",
      };
    }

    const claims = getSafeClaims(payload);

    if (!claims.sub || !claims.email) {
      return {
        ok: false,
        error: "missing_required_claims",
      };
    }

    if (!claims.emailVerified) {
      return {
        ok: false,
        error: "email_not_verified",
      };
    }

    return {
      ok: true,
      claims,
      token: {
        expiresIn: tokenPayload.expires_in,
        tokenType: tokenPayload.token_type,
      },
    };
  } catch (error) {
    return {
      ok: false,
      error: "token_validation_failed",
      detail: error instanceof Error ? error.message : "Unknown error",
    };
  }
};
