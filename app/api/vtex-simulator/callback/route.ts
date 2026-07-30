import { NextRequest, NextResponse } from "next/server";
import { config } from "@/lib/config";
import {
  getVtexSimulatorCookieOptions,
  vtexSimulatorSessionCookieName,
} from "@/lib/cookies";
import {
  createCorrelationId,
  createSessionId,
  hashOpaqueToken,
} from "@/lib/crypto";
import { logDebug, logError, logInfo, logWarn } from "@/lib/logger";
import {
  consumeVtexSimulatorState,
  getSessionTtl,
  saveVtexSimulatorResult,
  type VtexSimulatorResult,
  type VtexSimulatorStage,
} from "@/lib/session-store";
import {
  exchangeSimulatorAuthorizationCode,
  requestSimulatorUserInfo,
} from "@/lib/vtex-simulator";

export const dynamic = "force-dynamic";

function resultRedirect(sessionId: string) {
  const destination = new URL(
    "/vtex-simulator/result",
    config.bridgeBaseUrl,
  );
  const response = NextResponse.redirect(destination);
  response.cookies.set(
    vtexSimulatorSessionCookieName,
    sessionId,
    getVtexSimulatorCookieOptions(config.bridgeSessionTtlSeconds),
  );
  response.headers.set("Cache-Control", "no-store");

  return response;
}

export async function GET(request: NextRequest) {
  if (!config.enableVtexSimulator) {
    return new NextResponse("Not Found", { status: 404 });
  }

  const startedAt = Date.now();
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");
  const oauthErrorDescription = url.searchParams.get("error_description");
  const cookieSessionId = request.cookies.get(
    vtexSimulatorSessionCookieName,
  )?.value;
  const sessionId = cookieSessionId ?? createSessionId();
  let correlationId = createCorrelationId();
  let provider: string | undefined;
  let returnUrl: string | undefined;
  const stages: VtexSimulatorStage[] = [];

  async function finish(result: VtexSimulatorResult) {
    await saveVtexSimulatorResult({
      result,
      sessionId,
      ttl: getSessionTtl(),
    });

    return resultRedirect(sessionId);
  }

  logDebug("VTEX simulator callback received.", {
    correlationId,
    event: "vtex.simulator.callback.received",
    hasCode: Boolean(code),
    hasError: Boolean(oauthError),
    hasSession: Boolean(cookieSessionId),
    hasState: Boolean(state),
    stage: "simulator_callback",
  });

  try {
    if (!state || !cookieSessionId) {
      stages.push({
        name: "state_validation",
        status: "error",
        detail: "Missing state or simulator session cookie.",
      });

      logWarn("VTEX simulator callback is missing state or session.", {
        correlationId,
        event: "vtex.simulator.state.missing",
        stage: "state_validation",
      });

      return finish({
        ok: false,
        correlationId,
        error: "missing_state_or_session",
        stages,
      });
    }

    const stateStartedAt = Date.now();
    const storedState = await consumeVtexSimulatorState(
      hashOpaqueToken(state),
    );

    if (!storedState || storedState.sessionId !== cookieSessionId) {
      stages.push({
        name: "state_validation",
        status: "error",
        durationMs: Date.now() - stateStartedAt,
        detail: "State is invalid, expired or belongs to another session.",
      });

      logWarn("VTEX simulator state validation failed.", {
        correlationId,
        event: "vtex.simulator.state.invalid",
        stage: "state_validation",
      });

      return finish({
        ok: false,
        correlationId,
        error: "invalid_or_expired_simulator_state",
        stages,
      });
    }

    provider = storedState.provider;
    returnUrl = storedState.returnUrl;
    stages.push({
      name: "state_validation",
      status: "success",
      durationMs: Date.now() - stateStartedAt,
    });

    logInfo("VTEX simulator state validated.", {
      correlationId,
      event: "vtex.simulator.state.validated",
      provider,
      returnUrl,
      stage: "state_validation",
    });

    if (oauthError) {
      stages.push({
        name: "authorization_code",
        status: "error",
        detail: oauthErrorDescription ?? oauthError,
      });

      return finish({
        ok: false,
        correlationId,
        provider,
        returnUrl,
        error: oauthError,
        detail: oauthErrorDescription ?? undefined,
        stages,
      });
    }

    if (!code) {
      stages.push({
        name: "authorization_code",
        status: "error",
        detail: "Bridge callback did not include an authorization code.",
      });

      return finish({
        ok: false,
        correlationId,
        provider,
        returnUrl,
        error: "missing_authorization_code",
        stages,
      });
    }

    stages.push({
      name: "authorization_code",
      status: "success",
    });

    logInfo("VTEX simulator received an authorization code.", {
      correlationId,
      event: "vtex.simulator.authorization_code.received",
      stage: "authorization_code",
    });

    const tokenStartedAt = Date.now();
    const tokenResponse = await exchangeSimulatorAuthorizationCode(code);
    correlationId = tokenResponse.correlationId ?? correlationId;

    if (
      tokenResponse.status < 200 ||
      tokenResponse.status >= 300 ||
      !tokenResponse.payload.access_token
    ) {
      stages.push({
        name: "token_exchange",
        status: "error",
        durationMs: Date.now() - tokenStartedAt,
        detail:
          tokenResponse.payload.error_description ??
          tokenResponse.payload.error ??
          `HTTP ${tokenResponse.status}`,
      });

      logWarn("VTEX simulator token exchange failed.", {
        correlationId,
        event: "vtex.simulator.token.failed",
        httpStatus: tokenResponse.status,
        stage: "token_exchange",
      });

      return finish({
        ok: false,
        correlationId,
        provider,
        returnUrl,
        error: tokenResponse.payload.error ?? "token_exchange_failed",
        detail: tokenResponse.payload.error_description,
        stages,
        token: {
          expiresIn: tokenResponse.payload.expires_in,
          httpStatus: tokenResponse.status,
          tokenType: tokenResponse.payload.token_type,
        },
      });
    }

    stages.push({
      name: "token_exchange",
      status: "success",
      durationMs: Date.now() - tokenStartedAt,
    });

    logInfo("VTEX simulator received an access token.", {
      correlationId,
      event: "vtex.simulator.token.completed",
      expiresIn: tokenResponse.payload.expires_in,
      httpStatus: tokenResponse.status,
      stage: "token_exchange",
      tokenType: tokenResponse.payload.token_type,
    });

    const userInfoStartedAt = Date.now();
    const userInfoResponse = await requestSimulatorUserInfo(
      tokenResponse.payload.access_token,
    );
    correlationId = userInfoResponse.correlationId ?? correlationId;
    const validUserInfo =
      userInfoResponse.status >= 200 &&
      userInfoResponse.status < 300 &&
      typeof userInfoResponse.payload.userId === "string" &&
      typeof userInfoResponse.payload.email === "string";

    if (!validUserInfo) {
      stages.push({
        name: "userinfo",
        status: "error",
        durationMs: Date.now() - userInfoStartedAt,
        detail:
          userInfoResponse.payload.error_description ??
          userInfoResponse.payload.error ??
          `HTTP ${userInfoResponse.status}`,
      });

      logWarn("VTEX simulator userinfo request failed.", {
        correlationId,
        event: "vtex.simulator.userinfo.failed",
        httpStatus: userInfoResponse.status,
        stage: "userinfo",
      });

      return finish({
        ok: false,
        correlationId,
        provider,
        returnUrl,
        error: userInfoResponse.payload.error ?? "userinfo_failed",
        detail: userInfoResponse.payload.error_description,
        stages,
        token: {
          expiresIn: tokenResponse.payload.expires_in,
          httpStatus: tokenResponse.status,
          tokenType: tokenResponse.payload.token_type,
        },
      });
    }

    stages.push({
      name: "userinfo",
      status: "success",
      durationMs: Date.now() - userInfoStartedAt,
    });

    logInfo("VTEX simulator flow completed successfully.", {
      correlationId,
      durationMs: Date.now() - startedAt,
      email: userInfoResponse.payload.email,
      event: "vtex.simulator.flow.completed",
      stage: "completed",
      subject: userInfoResponse.payload.userId,
    });

    return finish({
      ok: true,
      correlationId,
      provider,
      returnUrl,
      stages,
      token: {
        expiresIn: tokenResponse.payload.expires_in,
        httpStatus: tokenResponse.status,
        tokenType: tokenResponse.payload.token_type,
      },
      userInfo: {
        email: userInfoResponse.payload.email,
        name: userInfoResponse.payload.name,
        userId: userInfoResponse.payload.userId,
      },
    });
  } catch (error) {
    stages.push({
      name: "unexpected_error",
      status: "error",
      detail: error instanceof Error ? error.message : "Unknown error",
    });

    logError("VTEX simulator flow failed unexpectedly.", error, {
      correlationId,
      durationMs: Date.now() - startedAt,
      event: "vtex.simulator.flow.failed",
      stage: "simulator_callback",
    });

    try {
      return await finish({
        ok: false,
        correlationId,
        provider,
        returnUrl,
        error: "vtex_simulator_unavailable",
        detail: error instanceof Error ? error.message : "Unknown error",
        stages,
      });
    } catch (storageError) {
      logError("VTEX simulator result could not be persisted.", storageError, {
        correlationId,
        event: "vtex.simulator.result.persistence_failed",
        stage: "result_persistence",
      });

      return NextResponse.json(
        {
          ok: false,
          error: "vtex_simulator_result_unavailable",
          correlationId,
        },
        {
          headers: { "Cache-Control": "no-store" },
          status: 503,
        },
      );
    }
  }
}
