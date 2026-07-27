import { NextRequest, NextResponse } from "next/server";
import { hashOpaqueToken } from "@/lib/crypto";
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
  const authorization = request.headers.get("authorization");
  const match = authorization?.match(/^Bearer\s+(.+)$/i);

  if (!match) {
    return unauthorized();
  }

  const accessToken = match[1].trim();

  if (!accessToken) {
    return unauthorized();
  }

  const claims = await getVtexAccessToken(hashOpaqueToken(accessToken));
  const userInfo = claims ? mapVtexUserInfo(claims) : null;

  if (!userInfo) {
    return unauthorized();
  }

  return NextResponse.json(userInfo, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
