import { nowEpochSeconds, randomDummyToken } from "@/lib/crypto";

export async function saveDummyAuthorizationState() {
  return {
    state: randomDummyToken("dummy-state"),
    nonce: randomDummyToken("dummy-nonce"),
    expiresAt: nowEpochSeconds() + 300,
  };
}

export async function getDummyBridgeSession() {
  return {
    sessionId: "dummy-session-id",
    userId: "dummy-user",
    email: "dummy@example.com",
    name: "Dummy User",
    expiresAt: nowEpochSeconds() + 3600,
  };
}

export async function saveDummyAuthorizationCode() {
  return {
    code: randomDummyToken("dummy-code"),
    expiresAt: nowEpochSeconds() + 300,
  };
}

export async function saveDummyAccessToken() {
  return {
    accessToken: randomDummyToken("dummy-access-token"),
    expiresAt: nowEpochSeconds() + 3600,
  };
}
