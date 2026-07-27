import { NextRequest, NextResponse } from "next/server";
import { config } from "@/lib/config";
import {
  bridgeSessionCookieName,
  bridgeSessionCookieOptions,
} from "@/lib/cookies";
import {
  createAuthorizationCode,
  hashOpaqueToken,
  nowEpochSeconds,
} from "@/lib/crypto";
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
  const url = new URL(request.url);
  const clientId = url.searchParams.get("client_id");
  const redirectUri = url.searchParams.get("redirect_uri");
  const state = url.searchParams.get("state");

  if (!isAllowedVtexAuthorizationRequest({ clientId, redirectUri })) {
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
  const claims = sessionId ? await consumeBridgeSession(sessionId) : null;

  if (!claims) {
    return oauthErrorRedirect({
      error: "login_required",
      errorDescription: "A valid Cognito bridge session is required.",
      redirectUri: config.vtexAllowedRedirectUri,
      state,
    });
  }

  const code = createAuthorizationCode();

  await saveVtexAuthorizationCode({
    claims,
    clientId: config.vtexClientId,
    codeHash: hashOpaqueToken(code),
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

  return response;
}
