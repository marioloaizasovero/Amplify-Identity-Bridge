import { NextRequest } from "next/server";
import { config } from "@/lib/config";
import { createSessionId } from "@/lib/crypto";
import { invokeCognitoTokenExchange } from "@/lib/lambda";
import { logError } from "@/lib/logger";
import { redirectToCognitoDebug } from "@/lib/responses";
import {
  consumeOAuthState,
  getSessionTtl,
  saveCognitoResult,
  type CognitoClaims,
} from "@/lib/session-store";

export const dynamic = "force-dynamic";

async function saveAndRedirect(input: {
  sessionId: string;
  claims?: CognitoClaims;
  detail?: string;
  error?: string;
}) {
  if (!config.enableCognitoDebug) {
    const path = input.error ? "/vtex/error" : "/vtex/callback";
    return Response.redirect(new URL(path, config.bridgeBaseUrl));
  }

  await saveCognitoResult({
    claims: input.claims,
    detail: input.detail,
    error: input.error,
    sessionId: input.sessionId,
    ttl: getSessionTtl(),
  });

  return redirectToCognitoDebug(input.sessionId);
}

export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const cognitoError = url.searchParams.get("error");
    const cognitoErrorDescription = url.searchParams.get("error_description");
    const sessionId = createSessionId();

    if (!state) {
      return saveAndRedirect({
        error: "missing_state",
        sessionId,
      });
    }

    const oauthState = await consumeOAuthState(state);

    if (!oauthState) {
      return saveAndRedirect({
        error: "invalid_or_expired_state",
        sessionId,
      });
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
      expectedNonce: oauthState.nonce,
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
