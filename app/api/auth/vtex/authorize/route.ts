import { NextRequest, NextResponse } from "next/server";
import { config } from "@/lib/config";
import {
  bridgeSessionCookieName,
  bridgeSessionCookieOptions,
  getPendingVtexAuthorizationCookieOptions,
  pendingVtexAuthorizationCookieName,
} from "@/lib/cookies";
import {
  createCorrelationId,
  createNonce,
  createOAuthState,
  createPendingFlowId,
  hashOpaqueToken,
} from "@/lib/crypto";
import { buildCognitoAuthorizationUrl } from "@/lib/cognito-authorization";
import { logDebug, logError, logInfo, logWarn } from "@/lib/logger";
import {
  consumeBridgeSession,
  getStateTtl,
  savePendingVtexAuthorization,
} from "@/lib/session-store";
import {
  isAllowedVtexAuthorizationRequest,
  isValidOAuthState,
} from "@/lib/vtex";
import { completeVtexAuthorization } from "@/lib/vtex-authorization";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const startedAt = Date.now();
  let correlationId = createCorrelationId();

  try {
    const url = new URL(request.url);
    const clientId = url.searchParams.get("client_id");
    const redirectUri = url.searchParams.get("redirect_uri");
    const state = url.searchParams.get("state");

    logDebug("VTEX authorization request received.", {
      clientId,
      correlationId,
      event: "vtex.authorization.received",
      hasState: Boolean(state),
      redirectUri,
      stage: "vtex_authorize",
    });

    if (
      !isAllowedVtexAuthorizationRequest({ clientId, redirectUri }) ||
      !isValidOAuthState(state)
    ) {
      logWarn("VTEX authorization request is invalid.", {
        clientId,
        correlationId,
        event: "vtex.authorization.invalid_request",
        redirectUri,
        stage: "vtex_authorize",
      });

      return NextResponse.json(
        {
          error: "invalid_request",
          error_description:
            "Invalid client_id, redirect_uri or state.",
        },
        {
          headers: { "Cache-Control": "no-store" },
          status: 400,
        },
      );
    }

    const sessionId = request.cookies.get(bridgeSessionCookieName)?.value;
    const session = sessionId ? await consumeBridgeSession(sessionId) : null;

    if (!session) {
      const flowId = createPendingFlowId();
      const cognitoState = createOAuthState();
      const nonce = createNonce();

      await savePendingVtexAuthorization({
        clientId: config.vtexClientId,
        cognitoStateHash: hashOpaqueToken(cognitoState),
        correlationId,
        flowIdHash: hashOpaqueToken(flowId),
        nonce,
        redirectUri: config.vtexAllowedRedirectUri,
        ttl: getStateTtl(),
        vtexState: state,
      });

      const cognitoAuthorizationUrl = buildCognitoAuthorizationUrl({
        clientId: config.cognitoClientId,
        domain: config.cognitoDomain,
        nonce,
        redirectUri: config.cognitoRedirectUri,
        scopes: config.cognitoScopes,
        state: cognitoState,
      });
      const response = NextResponse.redirect(cognitoAuthorizationUrl);
      response.cookies.set(
        pendingVtexAuthorizationCookieName,
        flowId,
        getPendingVtexAuthorizationCookieOptions(
          config.oauthStateTtlSeconds,
        ),
      );
      response.headers.set("Cache-Control", "no-store");

      logInfo("VTEX authorization redirected to Cognito.", {
        correlationId,
        event: "vtex.authorization.cognito_redirect",
        hasSessionCookie: Boolean(sessionId),
        stage: "cognito_authorization",
      });

      return response;
    }

    correlationId = session.correlationId;
    const response = await completeVtexAuthorization({
      claims: session.claims,
      clientId: config.vtexClientId,
      correlationId,
      redirectUri: config.vtexAllowedRedirectUri,
      state,
    });
    response.cookies.set(bridgeSessionCookieName, "", {
      ...bridgeSessionCookieOptions,
      maxAge: 0,
    });

    logInfo("VTEX authorization code created.", {
      correlationId,
      durationMs: Date.now() - startedAt,
      event: "vtex.authorization.completed",
      stage: "vtex_authorize",
      subject: session.claims.sub,
    });

    return response;
  } catch (error) {
    logError("VTEX authorization failed unexpectedly.", error, {
      correlationId,
      durationMs: Date.now() - startedAt,
      event: "vtex.authorization.failed",
      stage: "vtex_authorize",
    });

    return NextResponse.json(
      {
        error: "temporarily_unavailable",
        error_description: "VTEX authorization is temporarily unavailable.",
      },
      {
        headers: { "Cache-Control": "no-store" },
        status: 503,
      },
    );
  }
}
