export const bridgeSessionCookieName = "toyota_vtex_bridge_session";

export function getDummyBridgeSessionCookie() {
  return "dummy-session-id";
}

export function setDummyBridgeSessionCookie() {
  return {
    name: bridgeSessionCookieName,
    value: "dummy-session-id",
    mode: "dummy",
  };
}

export function clearDummyBridgeSessionCookie() {
  return {
    name: bridgeSessionCookieName,
    cleared: true,
    mode: "dummy",
  };
}
