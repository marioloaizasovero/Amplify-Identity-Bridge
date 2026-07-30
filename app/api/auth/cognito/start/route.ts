import { NextResponse } from "next/server";
import { buildCognitoAuthorizeUrl } from "@/lib/cognito";
import { createCorrelationId, createNonce, createState } from "@/lib/crypto";
import { logDebug, logError, logInfo } from "@/lib/logger";
import { getStateTtl, saveOAuthState } from "@/lib/session-store";

export const dynamic = "force-dynamic";

export async function GET() {
  const correlationId = createCorrelationId();
  const startedAt = Date.now();

  try {
    const state = createState();
    const nonce = createNonce();

    logInfo("Cognito authorization started.", {
      correlationId,
      event: "cognito.authorization.started",
      stage: "cognito_start",
    });

    await saveOAuthState({
      correlationId,
      nonce,
      state,
      ttl: getStateTtl(),
    });

    const authorizeUrl = buildCognitoAuthorizeUrl({
      nonce,
      state,
    });

    logDebug("Cognito authorization request prepared.", {
      authorizeHost: authorizeUrl.host,
      authorizePath: authorizeUrl.pathname,
      correlationId,
      durationMs: Date.now() - startedAt,
      event: "cognito.authorization.redirect",
      stage: "cognito_redirect",
    });

    return NextResponse.redirect(authorizeUrl);
  } catch (error) {
    logError("Failed to start Cognito authorization.", error, {
      correlationId,
      durationMs: Date.now() - startedAt,
      event: "cognito.authorization.failed",
      stage: "cognito_start",
    });

    return NextResponse.json(
      {
        ok: false,
        error: "cognito_start_unavailable",
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
