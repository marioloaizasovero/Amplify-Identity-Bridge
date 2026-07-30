import { NextResponse } from "next/server";
import { createCorrelationId } from "@/lib/crypto";
import {
  bridgeSessionCookieName,
  bridgeSessionCookieOptions,
} from "@/lib/cookies";
import { logInfo } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function GET() {
  const correlationId = createCorrelationId();
  const response = NextResponse.json(
    {
      ok: true,
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );

  response.cookies.set(bridgeSessionCookieName, "", {
    ...bridgeSessionCookieOptions,
    maxAge: 0,
  });

  logInfo("VTEX bridge session cookie cleared.", {
    correlationId,
    event: "vtex.logout.completed",
    stage: "vtex_logout",
  });

  return response;
}
