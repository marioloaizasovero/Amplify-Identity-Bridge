import { NextRequest, NextResponse } from "next/server";
import { config } from "@/lib/config";
import {
  bridgeSessionCookieName,
  getBridgeSessionCookieOptions,
} from "@/lib/cookies";
import { createSessionId } from "@/lib/crypto";
import { invokeCognitoTokenExchange } from "@/lib/lambda";
import { logError } from "@/lib/logger";
import { redirectToCognitoDebug } from "@/lib/responses";
import {
  consumeOAuthState,
  getSessionTtl,
  saveBridgeSession,
  saveCognitoResult,
  type CognitoClaims,
} from "@/lib/session-store";
import { buildVtexStoreLoginUrl } from "@/lib/vtex";

export const dynamic = "force-dynamic";

async function saveAndRedirect(input: {
  sessionId: string;
  claims?: CognitoClaims;
  detail?: string;
  error?: string;
}) {
  const ttl = getSessionTtl();

  if (!input.error && input.claims) {
    await saveBridgeSession({
      claims: input.claims,
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
    detail: input.detail,
    error: input.error,
    sessionId: input.sessionId,
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
  try {
    const url = new URL(request.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const cognitoError = url.searchParams.get("error");
    const cognitoErrorDescription = url.searchParams.get("error_description");
    const sessionId = createSessionId();

    let expectedNonce: string | undefined;

    if (state) {
      const oauthState = await consumeOAuthState(state);

      if (!oauthState) {
        return saveAndRedirect({
          error: "invalid_or_expired_state",
          sessionId,
        });
      }

      expectedNonce = oauthState.nonce;
    }

    if (cognitoError) {
      return saveAndRedirect({
        detail: cognitoErrorDescription ?? undefined,
        error: cognitoError,
        sessionId,
      });
    }

    if (!code) {
      return saveAndRedirect({
        error: "missing_code",
        sessionId,
      });
    }

    const tokenExchangeResult = await invokeCognitoTokenExchange({
      code,
      expectedNonce,
      redirectUri: config.cognitoRedirectUri,
    });

    return saveAndRedirect({
      claims: tokenExchangeResult.claims,
      detail: tokenExchangeResult.detail,
      error: tokenExchangeResult.ok ? undefined : tokenExchangeResult.error,
      sessionId,
    });
  } catch (error) {
    logError("Failed to complete Cognito callback.", error);

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
