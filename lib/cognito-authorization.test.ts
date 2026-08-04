import assert from "node:assert/strict";
import test from "node:test";
import { buildCognitoAuthorizationUrl } from "./cognito-authorization";

const validInput = {
  clientId: "test-client-id",
  domain: "https://login.example.com",
  prompt: "none" as const,
  redirectUri: "https://bridge.example.com/api/auth/cognito/callback",
  scopes: "openid email profile",
};

test("builds a silent Cognito authorization URL", () => {
  const result = buildCognitoAuthorizationUrl(validInput);

  assert.equal(result.origin, "https://login.example.com");
  assert.equal(result.pathname, "/oauth2/authorize");
  assert.equal(result.searchParams.get("response_type"), "code");
  assert.equal(result.searchParams.get("client_id"), "test-client-id");
  assert.equal(
    result.searchParams.get("redirect_uri"),
    "https://bridge.example.com/api/auth/cognito/callback",
  );
  assert.equal(result.searchParams.get("scope"), "openid email profile");
  assert.equal(result.searchParams.get("prompt"), "none");
  assert.equal(result.searchParams.has("client_secret"), false);
  assert.equal(result.searchParams.has("state"), false);
  assert.equal(result.searchParams.has("nonce"), false);
});

test("normalizes whitespace in Cognito scopes", () => {
  const result = buildCognitoAuthorizationUrl({
    ...validInput,
    scopes: "  openid   email  ",
  });

  assert.equal(result.searchParams.get("scope"), "openid email");
});

test("adds state and nonce without forcing a Cognito prompt", () => {
  const result = buildCognitoAuthorizationUrl({
    ...validInput,
    nonce: "nonce-value-0123456789",
    prompt: undefined,
    state: "state-value-0123456789",
  });

  assert.equal(result.searchParams.get("state"), "state-value-0123456789");
  assert.equal(result.searchParams.get("nonce"), "nonce-value-0123456789");
  assert.equal(result.searchParams.has("prompt"), false);
});

test("rejects scopes that cannot produce an ID token", () => {
  assert.throws(
    () =>
      buildCognitoAuthorizationUrl({
        ...validInput,
        scopes: "email profile",
      }),
    /must include openid/,
  );
});
