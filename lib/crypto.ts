import { randomBytes } from "crypto";

export function randomOpaqueToken(byteLength = 32) {
  if (!Number.isSafeInteger(byteLength) || byteLength < 16) {
    throw new Error("Token byte length must be an integer of at least 16");
  }

  return randomBytes(byteLength).toString("base64url");
}

export function randomDummyToken(prefix = "dummy-token") {
  return `${prefix}-${randomOpaqueToken(16)}`;
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

export function nowEpochSeconds() {
  return Math.floor(Date.now() / 1000);
}
