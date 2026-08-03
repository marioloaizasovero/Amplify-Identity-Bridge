import { NextRequest, NextResponse } from "next/server";
import { config } from "@/lib/config";
import {
  bridgeSessionCookieName,
  getBridgeSessionCookieOptions,
} from "@/lib/cookies";
import { createCorrelationId, createSessionId } from "@/lib/crypto";
import { invokeCognitoTokenExchange } from "@/lib/lambda";
import { logDebug, logError, logInfo, logWarn } from "@/lib/logger";
import { redirectToCognitoDebug } from "@/lib/responses";
import {
  getSessionTtl,
  saveBridgeSession,
  saveCognitoResult,
  type CognitoClaims,
} from "@/lib/session-store";
import { buildVtexStoreLoginUrl } from "@/lib/vtex";

export const dynamic = "force-dynamic";

async function saveAndRedirect(input: {
  sessionId: string;
  correlationId: string;
  claims?: CognitoClaims;
  detail?: string;
  diagnostics?: {
    lambdaRequestId?: string;
    tokenExpiresIn?: number;
    tokenType?: string;
  };
  error?: string;
  stage: string;
}) {
  const ttl = getSessionTtl();

  if (!input.error && input.claims) {
    await saveBridgeSession({
      claims: input.claims,
      correlationId: input.correlationId,
      sessionId: input.sessionId,
      ttl,
    });
  }

  if (!config.enableCognitoDebug) {
    const destination = input.error
      ? new URL("/vtex/error", config.bridgeBaseUrl)
      : buildVtexStoreLoginUrl();
    const response = NextResponse.redirect(destination);

    if (!input.error) {
      response.cookies.set(
        bridgeSessionCookieName,
        input.sessionId,
        getBridgeSessionCookieOptions(config.bridgeSessionTtlSeconds),
      );
    }

    return response;
  }

  await saveCognitoResult({
    claims: input.claims,
    correlationId: input.correlationId,
    detail: input.detail,
    diagnostics: input.diagnostics,
    error: input.error,
    sessionId: input.sessionId,
    stage: input.stage,
    ttl,
  });

  const response = redirectToCognitoDebug(input.sessionId);

  if (!input.error) {
    response.cookies.set(
      bridgeSessionCookieName,
      input.sessionId,
      getBridgeSessionCookieOptions(config.bridgeSessionTtlSeconds),
    );
  }

  return response;
}

export async function GET(request: NextRequest) {
  const startedAt = Date.now();
  const correlationId = createCorrelationId();

  try {
    const url = new URL(request.url);
    const code = url.searchParams.get("code");
    const cognitoError = url.searchParams.get("error");
    const cognitoErrorDescription = url.searchParams.get("error_description");
    const sessionId = createSessionId();

    logDebug("Cognito callback received.", {
      correlationId,
      event: "cognito.callback.received",
      hasCode: Boolean(code),
      hasError: Boolean(cognitoError),
      stage: "cognito_callback",
    });

    if (cognitoError) {
      logWarn("Cognito returned an OAuth error.", {
        cognitoError,
        correlationId,
        event: "cognito.callback.oauth_error",
        stage: "cognito_callback",
      });

      return saveAndRedirect({
        correlationId,
        detail: cognitoErrorDescription ?? undefined,
        error: cognitoError,
        sessionId,
        stage: "cognito_callback",
      });
    }

    if (!code) {
      logWarn("Cognito callback did not include a code.", {
        correlationId,
        event: "cognito.callback.missing_code",
        stage: "cognito_callback",
      });

      return saveAndRedirect({
        correlationId,
        error: "missing_code",
        sessionId,
        stage: "cognito_callback",
      });
    }

    logInfo("Invoking Cognito token exchange Lambda.", {
      correlationId,
      event: "cognito.token_exchange.started",
      stage: "lambda_invoke",
    });

    const tokenExchangeResult = await invokeCognitoTokenExchange({
      code,
      correlationId,
      redirectUri: config.cognitoRedirectUri,
    });

    const stage = tokenExchangeResult.ok
      ? "cognito_validation_completed"
      : "cognito_validation_failed";
    const logContext = {
      correlationId,
      durationMs: Date.now() - startedAt,
      error: tokenExchangeResult.error,
      event: tokenExchangeResult.ok
        ? "cognito.flow.completed"
        : "cognito.flow.failed",
      lambdaRequestId: tokenExchangeResult.diagnostics?.lambdaRequestId,
      stage,
      subject: tokenExchangeResult.claims?.sub,
    };

    if (tokenExchangeResult.ok) {
      logInfo("Cognito validation completed successfully.", logContext);
    } else {
      logWarn("Cognito validation returned a controlled error.", logContext);
    }

    return saveAndRedirect({
      claims: tokenExchangeResult.claims,
      correlationId,
      detail: tokenExchangeResult.detail,
      diagnostics: tokenExchangeResult.diagnostics,
      error: tokenExchangeResult.ok ? undefined : tokenExchangeResult.error,
      sessionId,
      stage,
    });
  } catch (error) {
    logError("Failed to complete Cognito callback.", error, {
      correlationId,
      durationMs: Date.now() - startedAt,
      event: "cognito.callback.failed",
      stage: "cognito_callback",
    });

    return Response.json(
      {
        ok: false,
        error: "cognito_callback_unavailable",
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
        status: 503,
      },
    );
  }
}
