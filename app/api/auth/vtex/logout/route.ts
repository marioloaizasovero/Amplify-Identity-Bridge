import { NextResponse } from "next/server";
import {
  bridgeSessionCookieName,
  bridgeSessionCookieOptions,
} from "@/lib/cookies";

export async function GET() {
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

  return response;
}
