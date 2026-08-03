import { config } from "@/lib/config";

export type SimulatorTokenResponse = {
  access_token?: string;
  expires_in?: number;
  token_type?: string;
  error?: string;
  error_description?: string;
};

export type SimulatorUserInfoResponse = {
  userId?: string;
  email?: string;
  name?: string;
  error?: string;
  error_description?: string;
};

export function isSafeReturnUrl(value: string) {
  return (
    value.startsWith("/") &&
    !value.startsWith("//") &&
    !value.includes("\\")
  );
}

export function buildBridgeAuthorizationUrl(state: string) {
  const url = new URL("/api/auth/vtex/authorize", config.bridgeBaseUrl);
  url.searchParams.set("client_id", config.vtexClientId);
  url.searchParams.set("redirect_uri", config.vtexAllowedRedirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("state", state);

  return url;
}

async function readJsonResponse<T>(response: Response): Promise<T> {
  const contentType = response.headers.get("content-type") ?? "";

  if (!contentType.includes("application/json")) {
    throw new Error(
      `Expected JSON response but received ${contentType || "unknown content type"}.`,
    );
  }

  return (await response.json()) as T;
}

export async function exchangeSimulatorAuthorizationCode(code: string) {
  const tokenUrl = new URL("/api/auth/vtex/token", config.bridgeBaseUrl);
  const credentials = Buffer.from(
    `${config.vtexClientId}:${config.vtexClientSecret}`,
    "utf8",
  ).toString("base64");
  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      authorization: `Basic ${credentials}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      code,
      grant_type: "authorization_code",
      redirect_uri: config.vtexAllowedRedirectUri,
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(8_000),
  });

  return {
    correlationId: response.headers.get("x-correlation-id") ?? undefined,
    payload: await readJsonResponse<SimulatorTokenResponse>(response),
    status: response.status,
  };
}

export async function requestSimulatorUserInfo(accessToken: string) {
  const userInfoUrl = new URL(
    "/api/auth/vtex/userinfo",
    config.bridgeBaseUrl,
  );
  const response = await fetch(userInfoUrl, {
    headers: {
      authorization: `Bearer ${accessToken}`,
    },
    cache: "no-store",
    signal: AbortSignal.timeout(8_000),
  });

  return {
    correlationId: response.headers.get("x-correlation-id") ?? undefined,
    payload: await readJsonResponse<SimulatorUserInfoResponse>(response),
    status: response.status,
  };
}
