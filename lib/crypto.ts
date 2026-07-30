import { createHash, randomBytes, timingSafeEqual } from "crypto";

export function randomOpaqueToken(byteLength = 32) {
  if (!Number.isSafeInteger(byteLength) || byteLength < 16) {
    throw new Error("Token byte length must be an integer of at least 16");
  }

  return randomBytes(byteLength).toString("base64url");
}

export function createState() {
  return randomOpaqueToken(32);
}

export function createNonce() {
  return randomOpaqueToken(32);
}

export function createSessionId() {
  return randomOpaqueToken(24);
}

export function createAuthorizationCode() {
  return randomOpaqueToken(64);
}

export function createAccessToken() {
  return randomOpaqueToken(48);
}

export function hashOpaqueToken(token: string) {
  return createHash("sha256").update(token, "utf8").digest("base64url");
}

export function secureStringEqual(actual: string, expected: string) {
  const actualBuffer = Buffer.from(actual, "utf8");
  const expectedBuffer = Buffer.from(expected, "utf8");

  return (
    actualBuffer.length === expectedBuffer.length &&
    timingSafeEqual(actualBuffer, expectedBuffer)
  );
}

export function nowEpochSeconds() {
  return Math.floor(Date.now() / 1000);
}
