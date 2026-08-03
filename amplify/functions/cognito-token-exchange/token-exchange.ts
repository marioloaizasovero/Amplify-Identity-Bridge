import type { JWTPayload } from "jose";

export type TokenExchangeEvent = {
  code?: unknown;
  correlationId?: unknown;
  redirectUri?: unknown;
};

export type TokenExchangeContext = {
  awsRequestId?: string;
  getRemainingTimeInMillis?: () => number;
};

export type TokenExchangeConfig = {
  clientId: string;
  clientSecret: string;
  domain: string;
  redirectUri: string;
  httpTimeoutMs: number;
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

type SafeClaims = {
  sub?: string;
  email?: string;
  emailVerified?: boolean;
  name?: string;
  username?: string;
};

type FetchLike = (
  input: string | URL,
  init?: RequestInit,
) => Promise<Response>;

type TokenExchangeLogger = {
  debug: (message: string, context?: Record<string, unknown>) => void;
  info: (message: string, context?: Record<string, unknown>) => void;
  warn: (message: string, context?: Record<string, unknown>) => void;
};

export type TokenExchangeDependencies = {
  config: TokenExchangeConfig;
  fetch: FetchLike;
  logger: TokenExchangeLogger;
  verifyIdToken: (token: string) => Promise<JWTPayload>;
  now?: () => number;
};

const maximumResponseBytes = 64 * 1024;
const minimumRemainingTimeMs = 1_500;
const executionTimeBufferMs = 1_000;

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isBoundedString(
  value: unknown,
  limits: { min: number; max: number },
): value is string {
  return (
    isNonEmptyString(value) &&
    value.length >= limits.min &&
    value.length <= limits.max
  );
}

function isCorrelationId(value: unknown): value is string {
  return (
    isBoundedString(value, { min: 16, max: 128 }) &&
    /^[A-Za-z0-9._-]+$/.test(value)
  );
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

function getRequestTimeoutMs(
  context: TokenExchangeContext,
  configuredTimeoutMs: number,
) {
  const remainingTime =
    context.getRemainingTimeInMillis?.() ??
    configuredTimeoutMs + executionTimeBufferMs;

  if (remainingTime < minimumRemainingTimeMs) {
    throw new Error("Insufficient Lambda execution time remaining.");
  }

  return Math.min(
    configuredTimeoutMs,
    remainingTime - executionTimeBufferMs,
  );
}

function isTimeoutError(error: unknown) {
  return (
    error instanceof Error &&
    (error.name === "AbortError" || error.name === "TimeoutError")
  );
}

async function readTokenResponse(response: Response) {
  const contentType = response.headers.get("content-type") ?? "";

  if (!contentType.toLowerCase().includes("application/json")) {
    return null;
  }

  const contentLength = Number(response.headers.get("content-length"));

  if (
    Number.isFinite(contentLength) &&
    contentLength > maximumResponseBytes
  ) {
    return null;
  }

  const responseBody = await response.text();

  if (
    !responseBody ||
    Buffer.byteLength(responseBody, "utf8") > maximumResponseBytes
  ) {
    return null;
  }

  try {
    const value: unknown = JSON.parse(responseBody);

    return typeof value === "object" && value !== null
      ? (value as TokenResponse)
      : null;
  } catch {
    return null;
  }
}

export async function processTokenExchange(
  event: TokenExchangeEvent,
  context: TokenExchangeContext,
  dependencies: TokenExchangeDependencies,
) {
  const now = dependencies.now ?? Date.now;
  const startedAt = now();
  const diagnostics = {
    lambdaRequestId: context.awsRequestId,
  };

  if (
    !isNonEmptyString(event.code) ||
    !isNonEmptyString(event.redirectUri) ||
    !isNonEmptyString(event.correlationId)
  ) {
    dependencies.logger.warn("Token exchange input is incomplete.", {
      event: "lambda.input.missing",
      lambdaRequestId: context.awsRequestId,
      stage: "input_validation",
    });

    return {
      ok: false as const,
      error: "missing_token_exchange_input",
      diagnostics,
    };
  }

  const correlationId = event.correlationId;
  const logContext = {
    correlationId,
    lambdaRequestId: context.awsRequestId,
  };

  if (
    !isBoundedString(event.code, { min: 8, max: 8_192 }) ||
    !isCorrelationId(correlationId)
  ) {
    dependencies.logger.warn("Token exchange input format is invalid.", {
      ...logContext,
      event: "lambda.input.invalid",
      stage: "input_validation",
    });

    return {
      ok: false as const,
      error: "invalid_token_exchange_input",
      diagnostics,
    };
  }

  if (event.redirectUri !== dependencies.config.redirectUri) {
    dependencies.logger.warn(
      "Token exchange redirect URI does not match configuration.",
      {
        ...logContext,
        event: "lambda.redirect_uri.invalid",
        stage: "input_validation",
      },
    );

    return {
      ok: false as const,
      error: "invalid_redirect_uri",
      diagnostics,
    };
  }

  dependencies.logger.debug("Token exchange input validated.", {
    ...logContext,
    event: "lambda.input.validated",
    stage: "input_validation",
  });

  const requestTimeoutMs = getRequestTimeoutMs(
    context,
    dependencies.config.httpTimeoutMs,
  );
  const tokenRequestStartedAt = now();
  let tokenResponse: Response;

  try {
    tokenResponse = await dependencies.fetch(
      new URL("/oauth2/token", dependencies.config.domain),
      {
        method: "POST",
        headers: {
          authorization:
            "Basic " +
            Buffer.from(
              `${dependencies.config.clientId}:${dependencies.config.clientSecret}`,
            ).toString("base64"),
          "content-type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          code: event.code,
          grant_type: "authorization_code",
          redirect_uri: event.redirectUri,
        }),
        signal: AbortSignal.timeout(requestTimeoutMs),
      },
    );
  } catch (error) {
    if (isTimeoutError(error)) {
      dependencies.logger.warn("Cognito token endpoint timed out.", {
        ...logContext,
        durationMs: now() - tokenRequestStartedAt,
        event: "lambda.cognito_token_request.timeout",
        stage: "token_exchange",
      });

      return {
        ok: false as const,
        error: "token_endpoint_timeout",
        diagnostics,
      };
    }

    throw error;
  }

  const tokenPayload = await readTokenResponse(tokenResponse);

  if (!tokenPayload) {
    dependencies.logger.warn(
      "Cognito token endpoint returned an invalid response.",
      {
        ...logContext,
        durationMs: now() - tokenRequestStartedAt,
        event: "lambda.cognito_token_request.invalid_response",
        httpStatus: tokenResponse.status,
        stage: "token_exchange",
      },
    );

    return {
      ok: false as const,
      error: "invalid_token_endpoint_response",
      diagnostics,
    };
  }

  dependencies.logger.debug("Cognito token endpoint responded.", {
    ...logContext,
    durationMs: now() - tokenRequestStartedAt,
    event: "lambda.cognito_token_request.completed",
    hasAccessToken: Boolean(tokenPayload.access_token),
    hasIdToken: Boolean(tokenPayload.id_token),
    hasRefreshToken: Boolean(tokenPayload.refresh_token),
    httpStatus: tokenResponse.status,
    stage: "token_exchange",
    tokenExpiresIn: tokenPayload.expires_in,
    tokenType: tokenPayload.token_type,
  });

  if (!tokenResponse.ok) {
    dependencies.logger.warn("Cognito token exchange was rejected.", {
      ...logContext,
      cognitoError: tokenPayload.error,
      event: "lambda.cognito_token_request.rejected",
      httpStatus: tokenResponse.status,
      stage: "token_exchange",
    });

    return {
      ok: false as const,
      error: tokenPayload.error ?? "token_exchange_failed",
      diagnostics,
    };
  }

  if (!isNonEmptyString(tokenPayload.id_token)) {
    dependencies.logger.warn(
      "Cognito token response does not include an ID token.",
      {
        ...logContext,
        event: "lambda.cognito_token_request.missing_id_token",
        httpStatus: tokenResponse.status,
        stage: "token_exchange",
      },
    );

    return {
      ok: false as const,
      error: "missing_id_token",
      diagnostics,
    };
  }

  let payload: JWTPayload;

  try {
    payload = await dependencies.verifyIdToken(tokenPayload.id_token);
  } catch {
    dependencies.logger.warn("Cognito ID token validation failed.", {
      ...logContext,
      event: "lambda.id_token.invalid",
      stage: "token_validation",
    });

    return {
      ok: false as const,
      error: "token_validation_failed",
      diagnostics,
    };
  }

  if (payload.token_use !== "id") {
    dependencies.logger.warn("Cognito token_use claim is invalid.", {
      ...logContext,
      event: "lambda.id_token.invalid_token_use",
      stage: "token_validation",
      tokenUse: payload.token_use,
    });

    return {
      ok: false as const,
      error: "invalid_token_use",
      diagnostics,
    };
  }

  const claims = getSafeClaims(payload);

  if (!claims.sub || !claims.email) {
    dependencies.logger.warn(
      "Cognito token is missing required claims.",
      {
        ...logContext,
        event: "lambda.claims.missing",
        hasEmail: Boolean(claims.email),
        hasSub: Boolean(claims.sub),
        stage: "claims_validation",
      },
    );

    return {
      ok: false as const,
      error: "missing_required_claims",
      diagnostics,
    };
  }

  if (!claims.emailVerified) {
    dependencies.logger.warn("Cognito email claim is not verified.", {
      ...logContext,
      event: "lambda.claims.email_not_verified",
      stage: "claims_validation",
    });

    return {
      ok: false as const,
      error: "email_not_verified",
      diagnostics,
    };
  }

  const resultDiagnostics = {
    ...diagnostics,
    tokenExpiresIn: tokenPayload.expires_in,
    tokenType: tokenPayload.token_type,
  };

  dependencies.logger.info("Cognito token validated successfully.", {
    ...logContext,
    durationMs: now() - startedAt,
    event: "lambda.token_validation.completed",
    hasEmail: true,
    hasName: Boolean(claims.name),
    stage: "completed",
    tokenExpiresIn: tokenPayload.expires_in,
    tokenType: tokenPayload.token_type,
  });

  return {
    ok: true as const,
    claims,
    diagnostics: resultDiagnostics,
    token: {
      expiresIn: tokenPayload.expires_in,
      tokenType: tokenPayload.token_type,
    },
  };
}
