import { NextResponse } from "next/server";
import { buildDummyResponse } from "@/lib/dummy-response";
import { config } from "@/lib/config";

const cognitoDebugSessionCookieName = "toyota_cognito_debug_session";

export function dummyJson(endpoint: string) {
  return NextResponse.json(buildDummyResponse(endpoint));
}

export function dummyError(endpoint: string, status = 400) {
  return NextResponse.json(
    {
      ...buildDummyResponse(endpoint),
      ok: false,
      error: "Dummy error response.",
    },
    { status },
  );
}

export function dummyRedirect(path = "/") {
  return NextResponse.redirect(new URL(path, "http://localhost:3000"));
}

export function redirectToCognitoDebug(sessionId: string) {
  const url = new URL("/cognito-debug", config.bridgeBaseUrl);
  const response = NextResponse.redirect(url);

  response.cookies.set(cognitoDebugSessionCookieName, sessionId, {
    httpOnly: true,
    maxAge: config.bridgeSessionTtlSeconds,
    path: "/cognito-debug",
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
  response.headers.set("Cache-Control", "no-store");

  return response;
}

export function getCognitoDebugSessionCookieName() {
  return cognitoDebugSessionCookieName;
}
