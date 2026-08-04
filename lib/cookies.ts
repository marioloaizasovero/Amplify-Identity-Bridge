export const bridgeSessionCookieName = "toyota_vtex_bridge_session";
export const pendingVtexAuthorizationCookieName =
  "toyota_vtex_pending_authorization";
export const vtexSimulatorSessionCookieName =
  "toyota_vtex_simulator_session";

export const bridgeSessionCookieOptions = {
  httpOnly: true,
  path: "/",
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
};

export function getBridgeSessionCookieOptions(maxAge: number) {
  return {
    ...bridgeSessionCookieOptions,
    maxAge,
  };
}

export function getPendingVtexAuthorizationCookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    maxAge,
    path: "/api/auth/cognito/callback",
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
  };
}

export function getVtexSimulatorCookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    maxAge,
    path: "/",
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
  };
}
