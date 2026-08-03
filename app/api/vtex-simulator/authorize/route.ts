import { NextRequest, NextResponse } from "next/server";
import { config } from "@/lib/config";
import {
  getVtexSimulatorCookieOptions,
  vtexSimulatorSessionCookieName,
} from "@/lib/cookies";
import {
  createCorrelationId,
  createSessionId,
  createState,
  hashOpaqueToken,
} from "@/lib/crypto";
import { logError, logInfo, logWarn } from "@/lib/logger";
import {
  getStateTtl,
  saveVtexSimulatorState,
} from "@/lib/session-store";
import {
  buildBridgeAuthorizationUrl,
  isSafeReturnUrl,
} from "@/lib/vtex-simulator";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  if (!config.enableVtexSimulator) {
    return new NextResponse("Not Found", { status: 404 });
  }

  const correlationId = createCorrelationId();
  const startedAt = Date.now();

  try {
    const url = new URL(request.url);
    const provider = url.searchParams.get("provider") ?? "";
    const returnUrl = url.searchParams.get("returnUrl") ?? "";

    if (
      provider !== config.vtexOAuthProvider ||
      !isSafeReturnUrl(returnUrl)
    ) {
      logWarn("VTEX simulator received invalid login parameters.", {
        correlationId,
        event: "vtex.simulator.authorization.invalid_parameters",
        provider,
        returnUrl,
        stage: "simulator_authorize",
      });

      return NextResponse.json(
        {
          ok: false,
          error: "invalid_simulator_parameters",
        },
        {
          headers: { "Cache-Control": "no-store" },
          status: 400,
        },
      );
    }

    const state = createState();
    const sessionId = createSessionId();

    await saveVtexSimulatorState({
      provider,
      returnUrl,
      sessionId,
      stateHash: hashOpaqueToken(state),
      ttl: getStateTtl(),
    });

    const response = NextResponse.redirect(
      buildBridgeAuthorizationUrl(state),
    );
    response.cookies.set(
      vtexSimulatorSessionCookieName,
      sessionId,
      getVtexSimulatorCookieOptions(config.bridgeSessionTtlSeconds),
    );
    response.headers.set("Cache-Control", "no-store");

    logInfo("VTEX simulator authorization started.", {
      correlationId,
      durationMs: Date.now() - startedAt,
      event: "vtex.simulator.authorization.started",
      provider,
      returnUrl,
      stage: "simulator_authorize",
    });

    return response;
  } catch (error) {
    logError("VTEX simulator could not start authorization.", error, {
      correlationId,
      durationMs: Date.now() - startedAt,
      event: "vtex.simulator.authorization.failed",
      stage: "simulator_authorize",
    });

    return NextResponse.json(
      {
        ok: false,
        error: "vtex_simulator_unavailable",
      },
      {
        headers: { "Cache-Control": "no-store" },
        status: 503,
      },
    );
  }
}
