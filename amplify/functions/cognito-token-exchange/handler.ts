import { env } from "$amplify/env/cognito-token-exchange";
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";
import {
  logDebug,
  logError,
  logInfo,
  logWarn,
} from "./logger";

type TokenExchangeEvent = {
  code?: string;
  correlationId?: string;
  redirectUri?: string;
  expectedNonce?: string;
};

type LambdaContext = {
  awsRequestId?: string;
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

export const handler = async (
  event: TokenExchangeEvent,
  context: LambdaContext = {},
) => {
  const startedAt = Date.now();
  const correlationId = event.correlationId ?? "missing";
  const diagnostics = {
    lambdaRequestId: context.awsRequestId,
  };

  logDebug("Token exchange invocation received.", {
    correlationId,
    event: "lambda.invocation.received",
    hasCode: Boolean(event.code),
    hasExpectedNonce: Boolean(event.expectedNonce),
    lambdaRequestId: context.awsRequestId,
    redirectUri: event.redirectUri,
    stage: "input_validation",
  });

  if (!event.code || !event.redirectUri) {
    logWarn("Token exchange input is incomplete.", {
      correlationId,
      event: "lambda.input.invalid",
      lambdaRequestId: context.awsRequestId,
      stage: "input_validation",
    });

    return {
      ok: false,
      error: "missing_token_exchange_input",
      diagnostics,
    };
  }

  if (event.redirectUri !== env.COGNITO_REDIRECT_URI) {
    logWarn("Token exchange redirect URI does not match configuration.", {
      correlationId,
      event: "lambda.redirect_uri.invalid",
      lambdaRequestId: context.awsRequestId,
      redirectUri: event.redirectUri,
      stage: "input_validation",
    });

    return {
      ok: false,
      error: "invalid_redirect_uri",
      diagnostics,
    };
  }

  try {
    logInfo("Requesting tokens from Cognito.", {
      correlationId,
      event: "lambda.cognito_token_request.started",
      lambdaRequestId: context.awsRequestId,
      stage: "token_exchange",
    });

    const tokenRequestStartedAt = Date.now();
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

    logDebug("Cognito token endpoint responded.", {
      correlationId,
      durationMs: Date.now() - tokenRequestStartedAt,
      event: "lambda.cognito_token_request.completed",
      hasAccessToken: Boolean(tokenPayload.access_token),
      hasIdToken: Boolean(tokenPayload.id_token),
      hasRefreshToken: Boolean(tokenPayload.refresh_token),
      httpStatus: tokenResponse.status,
      lambdaRequestId: context.awsRequestId,
      stage: "token_exchange",
      tokenExpiresIn: tokenPayload.expires_in,
      tokenType: tokenPayload.token_type,
    });

    if (!tokenResponse.ok || !tokenPayload.id_token) {
      logWarn("Cognito token exchange was rejected.", {
        cognitoError: tokenPayload.error,
        correlationId,
        event: "lambda.cognito_token_request.failed",
        httpStatus: tokenResponse.status,
        lambdaRequestId: context.awsRequestId,
        stage: "token_exchange",
      });

      return {
        ok: false,
        error: tokenPayload.error ?? "token_exchange_failed",
        detail: tokenPayload.error_description,
        diagnostics,
      };
    }

    const issuer = getIssuer();
    const jwks = createRemoteJWKSet(new URL(`${issuer}/.well-known/jwks.json`));

    logDebug("Validating Cognito ID token.", {
      audience: env.COGNITO_CLIENT_ID,
      correlationId,
      event: "lambda.id_token.validation_started",
      issuer,
      lambdaRequestId: context.awsRequestId,
      stage: "token_validation",
    });

    const { payload } = await jwtVerify(tokenPayload.id_token, jwks, {
      audience: env.COGNITO_CLIENT_ID,
      issuer,
    });

    if (payload.token_use !== "id") {
      logWarn("Cognito token_use claim is invalid.", {
        correlationId,
        event: "lambda.id_token.invalid_token_use",
        lambdaRequestId: context.awsRequestId,
        stage: "token_validation",
        tokenUse: payload.token_use,
      });

      return {
        ok: false,
        error: "invalid_token_use",
        diagnostics,
      };
    }

    if (event.expectedNonce && payload.nonce !== event.expectedNonce) {
      logWarn("Cognito nonce validation failed.", {
        correlationId,
        event: "lambda.id_token.invalid_nonce",
        lambdaRequestId: context.awsRequestId,
        stage: "token_validation",
      });

      return {
        ok: false,
        error: "invalid_nonce",
        diagnostics,
      };
    }

    const claims = getSafeClaims(payload);

    if (!claims.sub || !claims.email) {
      logWarn("Cognito token is missing required claims.", {
        correlationId,
        event: "lambda.claims.missing",
        hasEmail: Boolean(claims.email),
        hasSub: Boolean(claims.sub),
        lambdaRequestId: context.awsRequestId,
        stage: "claims_validation",
      });

      return {
        ok: false,
        error: "missing_required_claims",
        diagnostics,
      };
    }

    if (!claims.emailVerified) {
      logWarn("Cognito email claim is not verified.", {
        correlationId,
        event: "lambda.claims.email_not_verified",
        lambdaRequestId: context.awsRequestId,
        stage: "claims_validation",
        subject: claims.sub,
      });

      return {
        ok: false,
        error: "email_not_verified",
        diagnostics,
      };
    }

    const resultDiagnostics = {
      ...diagnostics,
      tokenExpiresIn: tokenPayload.expires_in,
      tokenType: tokenPayload.token_type,
    };

    logInfo("Cognito token validated successfully.", {
      claims,
      correlationId,
      durationMs: Date.now() - startedAt,
      event: "lambda.token_validation.completed",
      lambdaRequestId: context.awsRequestId,
      stage: "completed",
      tokenExpiresIn: tokenPayload.expires_in,
      tokenType: tokenPayload.token_type,
    });

    return {
      ok: true,
      claims,
      diagnostics: resultDiagnostics,
      token: {
        expiresIn: tokenPayload.expires_in,
        tokenType: tokenPayload.token_type,
      },
    };
  } catch (error) {
    logError("Cognito token validation failed unexpectedly.", error, {
      correlationId,
      durationMs: Date.now() - startedAt,
      event: "lambda.token_validation.failed",
      lambdaRequestId: context.awsRequestId,
      stage: "token_validation",
    });

    return {
      ok: false,
      error: "token_validation_failed",
      detail: error instanceof Error ? error.message : "Unknown error",
      diagnostics,
    };
  }
};
