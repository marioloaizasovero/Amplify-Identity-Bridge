import { NextResponse } from "next/server";
import {
  createAuthorizationCode,
  hashOpaqueToken,
  nowEpochSeconds,
} from "@/lib/crypto";
import {
  saveVtexAuthorizationCode,
  type CognitoClaims,
} from "@/lib/session-store";
import { vtexAuthorizationCodeTtlSeconds } from "@/lib/vtex";

export async function completeVtexAuthorization(input: {
  claims: CognitoClaims;
  clientId: string;
  correlationId: string;
  redirectUri: string;
  state: string;
}) {
  const code = createAuthorizationCode();

  await saveVtexAuthorizationCode({
    claims: input.claims,
    clientId: input.clientId,
    codeHash: hashOpaqueToken(code),
    correlationId: input.correlationId,
    redirectUri: input.redirectUri,
    ttl: nowEpochSeconds() + vtexAuthorizationCodeTtlSeconds,
  });

  const callbackUrl = new URL(input.redirectUri);
  callbackUrl.searchParams.set("code", code);
  callbackUrl.searchParams.set("state", input.state);

  const response = NextResponse.redirect(callbackUrl);
  response.headers.set("Cache-Control", "no-store");

  return response;
}
