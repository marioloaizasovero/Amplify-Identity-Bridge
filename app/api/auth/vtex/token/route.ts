import { NextRequest, NextResponse } from "next/server";
import {
  createAccessToken,
  hashOpaqueToken,
  nowEpochSeconds,
} from "@/lib/crypto";
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
  const contentType = request.headers.get("content-type") ?? "";

  if (!contentType.includes("application/x-www-form-urlencoded")) {
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

  if (
    !validateVtexClientCredentials({
      clientId,
      clientSecret,
    })
  ) {
    return tokenError("invalid_client", "Invalid client credentials.", 401);
  }

  if (grantType !== "authorization_code" || !code || !redirectUri) {
    return tokenError(
      "invalid_request",
      "grant_type, code and redirect_uri are required.",
      400,
    );
  }

  const claims = await consumeVtexAuthorizationCode({
    clientId,
    codeHash: hashOpaqueToken(code),
    redirectUri,
  });

  if (!claims) {
    return tokenError(
      "invalid_grant",
      "Authorization code is invalid, expired or already used.",
      400,
    );
  }

  const accessToken = createAccessToken();

  await saveVtexAccessToken({
    claims,
    tokenHash: hashOpaqueToken(accessToken),
    ttl: nowEpochSeconds() + vtexAccessTokenTtlSeconds,
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
      },
    },
  );
}
