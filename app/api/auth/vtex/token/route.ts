import { NextRequest, NextResponse } from "next/server";
import {
  createAccessToken,
  createCorrelationId,
  hashOpaqueToken,
  nowEpochSeconds,
} from "@/lib/crypto";
import { logDebug, logError, logInfo, logWarn } from "@/lib/logger";
import {
  consumeVtexAuthorizationCode,
  saveVtexAccessToken,
} from "@/lib/session-store";
import {
  readBasicClientCredentials,
  validateVtexClientCredentials,
  vtexAccessTokenTtlSeconds,
} from "@/lib/vtex";

export const dynamic = "force-dynamic";

function tokenError(error: string, description: string, status: number) {
  return NextResponse.json(
    {
      error,
      error_description: description,
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
      status,
    },
  );
}

export async function POST(request: NextRequest) {
  const startedAt = Date.now();
  let correlationId = createCorrelationId();

  try {
    const contentType = request.headers.get("content-type") ?? "";

    if (!contentType.includes("application/x-www-form-urlencoded")) {
      logWarn("VTEX token request has an invalid content type.", {
        contentType,
        correlationId,
        event: "vtex.token.invalid_content_type",
        stage: "vtex_token",
      });

      return tokenError(
        "invalid_request",
        "Content-Type must be application/x-www-form-urlencoded.",
        400,
      );
    }

    const body = new URLSearchParams(await request.text());
    const basicCredentials = readBasicClientCredentials(
      request.headers.get("authorization"),
    );
    const clientId =
      basicCredentials?.clientId ?? body.get("client_id") ?? "";
    const clientSecret =
      basicCredentials?.clientSecret ?? body.get("client_secret") ?? "";
    const code = body.get("code") ?? "";
    const redirectUri = body.get("redirect_uri") ?? "";
    const grantType = body.get("grant_type") ?? "authorization_code";

    logDebug("VTEX token request received.", {
      clientId,
      correlationId,
      credentialMethod: basicCredentials ? "basic" : "form",
      event: "vtex.token.received",
      grantType,
      hasCode: Boolean(code),
      redirectUri,
      stage: "vtex_token",
    });

    if (
      !validateVtexClientCredentials({
        clientId,
        clientSecret,
      })
    ) {
      logWarn("VTEX client authentication failed.", {
        clientId,
        correlationId,
        event: "vtex.token.invalid_client",
        stage: "client_authentication",
      });

      return tokenError("invalid_client", "Invalid client credentials.", 401);
    }

    if (grantType !== "authorization_code" || !code || !redirectUri) {
      logWarn("VTEX token request is missing required parameters.", {
        correlationId,
        event: "vtex.token.invalid_request",
        grantType,
        hasCode: Boolean(code),
        hasRedirectUri: Boolean(redirectUri),
        stage: "token_request_validation",
      });

      return tokenError(
        "invalid_request",
        "grant_type, code and redirect_uri are required.",
        400,
      );
    }

    const authorization = await consumeVtexAuthorizationCode({
      clientId,
      codeHash: hashOpaqueToken(code),
      redirectUri,
    });

    if (!authorization) {
      logWarn("VTEX authorization code is invalid or expired.", {
        correlationId,
        event: "vtex.token.invalid_grant",
        stage: "authorization_code",
      });

      return tokenError(
        "invalid_grant",
        "Authorization code is invalid, expired or already used.",
        400,
      );
    }

    correlationId = authorization.correlationId;
    const accessToken = createAccessToken();

    await saveVtexAccessToken({
      claims: authorization.claims,
      correlationId,
      tokenHash: hashOpaqueToken(accessToken),
      ttl: nowEpochSeconds() + vtexAccessTokenTtlSeconds,
    });

    logInfo("VTEX access token created.", {
      correlationId,
      durationMs: Date.now() - startedAt,
      event: "vtex.token.completed",
      expiresIn: vtexAccessTokenTtlSeconds,
      stage: "vtex_token",
      subject: authorization.claims.sub,
    });

    return NextResponse.json(
      {
        access_token: accessToken,
        expires_in: vtexAccessTokenTtlSeconds,
        token_type: "Bearer",
      },
      {
        headers: {
          "Cache-Control": "no-store",
          Pragma: "no-cache",
          "X-Correlation-Id": correlationId,
        },
      },
    );
  } catch (error) {
    logError("VTEX token endpoint failed unexpectedly.", error, {
      correlationId,
      durationMs: Date.now() - startedAt,
      event: "vtex.token.failed",
      stage: "vtex_token",
    });

    return tokenError(
      "temporarily_unavailable",
      "Token endpoint is temporarily unavailable.",
      503,
    );
  }
}
