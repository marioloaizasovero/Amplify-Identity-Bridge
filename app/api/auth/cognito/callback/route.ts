import { NextRequest, NextResponse } from "next/server";
import { config } from "@/lib/config";
import {
  bridgeSessionCookieName,
  getBridgeSessionCookieOptions,
  getPendingVtexAuthorizationCookieOptions,
  pendingVtexAuthorizationCookieName,
} from "@/lib/cookies";
import {
  createCorrelationId,
  createSessionId,
  hashOpaqueToken,
} from "@/lib/crypto";
import { invokeCognitoTokenExchange } from "@/lib/lambda";
import { logDebug, logError, logInfo, logWarn } from "@/lib/logger";
import { redirectToCognitoDebug } from "@/lib/responses";
import {
  consumePendingVtexAuthorization,
  getSessionTtl,
  saveBridgeSession,
  saveCognitoResult,
  type CognitoClaims,
} from "@/lib/session-store";
import { buildVtexStoreLoginUrl } from "@/lib/vtex";
import { completeVtexAuthorization } from "@/lib/vtex-authorization";

export const dynamic = "force-dynamic";

type PendingVtexAuthorization = NonNullable<
  Awaited<ReturnType<typeof consumePendingVtexAuthorization>>
>;

function clearPendingAuthorizationCookie(response: NextResponse) {
  response.cookies.set(pendingVtexAuthorizationCookieName, "", {
    ...getPendingVtexAuthorizationCookieOptions(0),
    maxAge: 0,
  });

  return response;
}

function redirectVtexOAuthError(input: {
  detail: string;
  error: string;
  pending: PendingVtexAuthorization;
}) {
  const callbackUrl = new URL(input.pending.redirectUri);
  callbackUrl.searchParams.set("error", input.error);
  callbackUrl.searchParams.set("error_description", input.detail);
  callbackUrl.searchParams.set("state", input.pending.vtexState);

  const response = NextResponse.redirect(callbackUrl);
  response.headers.set("Cache-Control", "no-store");

  return clearPendingAuthorizationCookie(response);
}

function mapCognitoOAuthError(error: string) {
  return error === "access_denied" || error === "login_required"
    ? error
    : "server_error";
}

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

    if (input.error) {
      destination.searchParams.set("error", input.error);
    }

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
  let correlationId = createCorrelationId();
  let pendingVtexAuthorization: PendingVtexAuthorization | null = null;

  try {
    const url = new URL(request.url);
    const code = url.searchParams.get("code");
    const cognitoState = url.searchParams.get("state");
    const cognitoError = url.searchParams.get("error");
    const cognitoErrorDescription = url.searchParams.get("error_description");
    const sessionId = createSessionId();
    const pendingFlowId = request.cookies.get(
      pendingVtexAuthorizationCookieName,
    )?.value;
    if (Boolean(cognitoState) !== Boolean(pendingFlowId)) {
      logWarn("Cognito callback has an incomplete VTEX authorization context.", {
        correlationId,
        event: "cognito.pending_vtex_context.incomplete",
        stage: "state_validation",
      });

      const response = await saveAndRedirect({
        correlationId,
        error: "invalid_or_expired_state",
        sessionId,
        stage: "state_validation",
      });

      return clearPendingAuthorizationCookie(response);
    }

    if (cognitoState && pendingFlowId) {
      pendingVtexAuthorization = await consumePendingVtexAuthorization({
        cognitoStateHash: hashOpaqueToken(cognitoState),
        flowIdHash: hashOpaqueToken(pendingFlowId),
      });

      if (!pendingVtexAuthorization) {
        logWarn("Cognito callback VTEX state is invalid or expired.", {
          correlationId,
          event: "cognito.pending_vtex_context.invalid",
          stage: "state_validation",
        });

        const response = await saveAndRedirect({
          correlationId,
          error: "invalid_or_expired_state",
          sessionId,
          stage: "state_validation",
        });

        return clearPendingAuthorizationCookie(response);
      }

      correlationId = pendingVtexAuthorization.correlationId;
    }

    logDebug("Cognito callback received.", {
      correlationId,
      event: "cognito.callback.received",
      hasCode: Boolean(code),
      hasError: Boolean(cognitoError),
      hasPendingVtexAuthorization: Boolean(pendingVtexAuthorization),
      stage: "cognito_callback",
    });

    if (cognitoError) {
      logWarn("Cognito returned an OAuth error.", {
        cognitoError,
        correlationId,
        event: "cognito.callback.oauth_error",
        stage: "cognito_callback",
      });

      if (pendingVtexAuthorization) {
        return redirectVtexOAuthError({
          detail: "Cognito did not complete the authentication.",
          error: mapCognitoOAuthError(cognitoError),
          pending: pendingVtexAuthorization,
        });
      }

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

      if (pendingVtexAuthorization) {
        return redirectVtexOAuthError({
          detail: "Cognito did not return an authorization code.",
          error: "server_error",
          pending: pendingVtexAuthorization,
        });
      }

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
      expectedNonce: pendingVtexAuthorization?.nonce,
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

    if (pendingVtexAuthorization) {
      if (!tokenExchangeResult.ok || !tokenExchangeResult.claims) {
        return redirectVtexOAuthError({
          detail: "The identity provider could not validate the user.",
          error: "temporarily_unavailable",
          pending: pendingVtexAuthorization,
        });
      }

      const response = await completeVtexAuthorization({
        claims: tokenExchangeResult.claims,
        clientId: pendingVtexAuthorization.clientId,
        correlationId,
        redirectUri: pendingVtexAuthorization.redirectUri,
        state: pendingVtexAuthorization.vtexState,
      });

      logInfo("Pending VTEX authorization completed after Cognito.", {
        correlationId,
        durationMs: Date.now() - startedAt,
        event: "vtex.authorization.resumed",
        stage: "vtex_authorization",
      });

      return clearPendingAuthorizationCookie(response);
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

    if (pendingVtexAuthorization) {
      return redirectVtexOAuthError({
        detail: "The identity provider is temporarily unavailable.",
        error: "temporarily_unavailable",
        pending: pendingVtexAuthorization,
      });
    }

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
