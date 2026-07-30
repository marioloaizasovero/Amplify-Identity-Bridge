import { NextRequest, NextResponse } from "next/server";
import { config } from "@/lib/config";
import {
  bridgeSessionCookieName,
  bridgeSessionCookieOptions,
} from "@/lib/cookies";
import {
  createAuthorizationCode,
  createCorrelationId,
  hashOpaqueToken,
  nowEpochSeconds,
} from "@/lib/crypto";
import { logDebug, logError, logInfo, logWarn } from "@/lib/logger";
import {
  consumeBridgeSession,
  saveVtexAuthorizationCode,
} from "@/lib/session-store";
import {
  isAllowedVtexAuthorizationRequest,
  vtexAuthorizationCodeTtlSeconds,
} from "@/lib/vtex";

export const dynamic = "force-dynamic";

function oauthErrorRedirect(input: {
  error: string;
  errorDescription: string;
  redirectUri: string;
  state: string | null;
}) {
  const url = new URL(input.redirectUri);
  url.searchParams.set("error", input.error);
  url.searchParams.set("error_description", input.errorDescription);

  if (input.state) {
    url.searchParams.set("state", input.state);
  }

  return NextResponse.redirect(url);
}

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

    if (!isAllowedVtexAuthorizationRequest({ clientId, redirectUri })) {
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
          error_description: "Invalid client_id or redirect_uri.",
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
      logWarn("VTEX authorization has no valid bridge session.", {
        correlationId,
        event: "vtex.authorization.login_required",
        hasSessionCookie: Boolean(sessionId),
        stage: "bridge_session",
      });

      return oauthErrorRedirect({
        error: "login_required",
        errorDescription: "A valid Cognito bridge session is required.",
        redirectUri: config.vtexAllowedRedirectUri,
        state,
      });
    }

    correlationId = session.correlationId;
    const code = createAuthorizationCode();

    await saveVtexAuthorizationCode({
      claims: session.claims,
      clientId: config.vtexClientId,
      codeHash: hashOpaqueToken(code),
      correlationId,
      redirectUri: config.vtexAllowedRedirectUri,
      ttl: nowEpochSeconds() + vtexAuthorizationCodeTtlSeconds,
    });

    const callbackUrl = new URL(config.vtexAllowedRedirectUri);
    callbackUrl.searchParams.set("code", code);

    if (state) {
      callbackUrl.searchParams.set("state", state);
    }

    const response = NextResponse.redirect(callbackUrl);
    response.cookies.set(bridgeSessionCookieName, "", {
      ...bridgeSessionCookieOptions,
      maxAge: 0,
    });
    response.headers.set("Cache-Control", "no-store");

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
