import { NextResponse } from "next/server";
import { buildCognitoAuthorizeUrl } from "@/lib/cognito";
import { createNonce, createState } from "@/lib/crypto";
import { logError } from "@/lib/logger";
import { getStateTtl, saveOAuthState } from "@/lib/session-store";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const state = createState();
    const nonce = createNonce();

    await saveOAuthState({
      nonce,
      state,
      ttl: getStateTtl(),
    });

    return NextResponse.redirect(
      buildCognitoAuthorizeUrl({
        nonce,
        state,
      }),
    );
  } catch (error) {
    logError("Failed to start Cognito authorization.", error);

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
