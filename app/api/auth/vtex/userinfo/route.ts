import { NextRequest, NextResponse } from "next/server";
import { createCorrelationId, hashOpaqueToken } from "@/lib/crypto";
import { logDebug, logError, logInfo, logWarn } from "@/lib/logger";
import { getVtexAccessToken } from "@/lib/session-store";
import { mapVtexUserInfo } from "@/lib/vtex";

export const dynamic = "force-dynamic";

function unauthorized() {
  return NextResponse.json(
    {
      error: "invalid_token",
      error_description: "A valid bearer access token is required.",
    },
    {
      headers: {
        "Cache-Control": "no-store",
        "WWW-Authenticate": 'Bearer error="invalid_token"',
      },
      status: 401,
    },
  );
}

export async function GET(request: NextRequest) {
  const startedAt = Date.now();
  let correlationId = createCorrelationId();

  try {
    const authorization = request.headers.get("authorization");
    const match = authorization?.match(/^Bearer\s+(.+)$/i);

    if (!match) {
      logWarn("VTEX userinfo request has no bearer token.", {
        correlationId,
        event: "vtex.userinfo.missing_token",
        stage: "bearer_validation",
      });

      return unauthorized();
    }

    const accessToken = match[1].trim();

    if (!accessToken) {
      return unauthorized();
    }

    logDebug("VTEX userinfo request received.", {
      correlationId,
      event: "vtex.userinfo.received",
      stage: "vtex_userinfo",
    });

    const token = await getVtexAccessToken(hashOpaqueToken(accessToken));
    const userInfo = token ? mapVtexUserInfo(token.claims) : null;

    if (!userInfo || !token) {
      logWarn("VTEX userinfo token is invalid or expired.", {
        correlationId,
        event: "vtex.userinfo.invalid_token",
        stage: "bearer_validation",
      });

      return unauthorized();
    }

    correlationId = token.correlationId;

    logInfo("VTEX userinfo returned successfully.", {
      correlationId,
      durationMs: Date.now() - startedAt,
      event: "vtex.userinfo.completed",
      stage: "vtex_userinfo",
      subject: token.claims.sub,
    });

    return NextResponse.json(userInfo, {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    logError("VTEX userinfo endpoint failed unexpectedly.", error, {
      correlationId,
      durationMs: Date.now() - startedAt,
      event: "vtex.userinfo.failed",
      stage: "vtex_userinfo",
    });

    return NextResponse.json(
      {
        error: "temporarily_unavailable",
        error_description: "Userinfo endpoint is temporarily unavailable.",
      },
      {
        headers: { "Cache-Control": "no-store" },
        status: 503,
      },
    );
  }
}
