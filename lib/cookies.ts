export const bridgeSessionCookieName = "toyota_vtex_bridge_session";
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

export function getVtexSimulatorCookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    maxAge,
    path: "/",
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
  };
}
