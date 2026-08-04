import assert from "node:assert/strict";
import test from "node:test";
import {
  generateVtexCredentials,
  isVtexCredentialEnvironment,
  vtexCredentialEnvironments,
} from "./vtex-credentials";

const expectedProviderNames = {
  dev: "ToyotaCognitoDev",
  qa: "ToyotaCognitoQA",
  stage: "ToyotaCognitoStage",
  prod: "ToyotaCognito",
} as const;

test("generates valid VTEX credentials for every environment", () => {
  for (const environment of vtexCredentialEnvironments) {
    const credentials = generateVtexCredentials(environment);

    assert.equal(credentials.environment, environment);
    assert.equal(
      credentials.providerName,
      expectedProviderNames[environment],
    );
    assert.match(
      credentials.clientId,
      new RegExp(`^toyota-vtex-${environment}-[A-Za-z0-9_-]{16}$`),
    );
    assert.match(credentials.clientSecret, /^[A-Za-z0-9_-]{64}$/);
  }
});

test("generates different credentials on every invocation", () => {
  const first = generateVtexCredentials("dev");
  const second = generateVtexCredentials("dev");

  assert.notEqual(first.clientId, second.clientId);
  assert.notEqual(first.clientSecret, second.clientSecret);
});

test("accepts only supported environments", () => {
  assert.equal(isVtexCredentialEnvironment("qa"), true);
  assert.equal(isVtexCredentialEnvironment("production"), false);
  assert.equal(isVtexCredentialEnvironment(undefined), false);
});
