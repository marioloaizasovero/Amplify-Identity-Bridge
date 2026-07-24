import { NextResponse } from "next/server";
import { buildCognitoAuthorizeUrl } from "@/lib/cognito";
import { createNonce, createState } from "@/lib/crypto";
import { getStateTtl, saveOAuthState } from "@/lib/session-store";

export const dynamic = "force-dynamic";

export async function GET() {
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
}
