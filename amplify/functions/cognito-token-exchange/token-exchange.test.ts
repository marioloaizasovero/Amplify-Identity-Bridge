import assert from "node:assert/strict";
import test from "node:test";
import type { JWTPayload } from "jose";
import {
  processTokenExchange,
  type TokenExchangeDependencies,
  type TokenExchangeEvent,
} from "./token-exchange";

const validEvent = {
  code: "valid-authorization-code",
  correlationId: "0123456789abcdef0123456789abcdef",
  redirectUri: "https://bridge.example.com/api/auth/cognito/callback",
} satisfies TokenExchangeEvent;

const validPayload: JWTPayload = {
  sub: "user-123",
  email: "user@example.com",
  email_verified: true,
  name: "Test User",
  token_use: "id",
};

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    headers: {
      "content-type": "application/json",
    },
    status,
  });
}

function createDependencies(
  overrides: Partial<TokenExchangeDependencies> = {},
): TokenExchangeDependencies {
  return {
    config: {
      clientId: "cognito-client-id",
      clientSecret: "cognito-client-secret",
      domain: "https://example.auth.us-east-1.amazoncognito.com",
      redirectUri: validEvent.redirectUri,
      httpTimeoutMs: 6_000,
    },
    fetch: async () =>
      jsonResponse({
        access_token: "access-token",
        expires_in: 3_600,
        id_token: "id-token",
        refresh_token: "refresh-token",
        token_type: "Bearer",
      }),
    logger: {
      debug: () => undefined,
      info: () => undefined,
      warn: () => undefined,
    },
    verifyIdToken: async () => validPayload,
    ...overrides,
  };
}

const lambdaContext = {
  awsRequestId: "lambda-request-id",
  getRemainingTimeInMillis: () => 15_000,
};

test("rejects an invocation without a correlation ID", async () => {
  const result = await processTokenExchange(
    {
      code: validEvent.code,
      redirectUri: validEvent.redirectUri,
    },
    lambdaContext,
    createDependencies(),
  );

  assert.equal(result.ok, false);
  assert.equal(result.error, "missing_token_exchange_input");
});

test("rejects malformed input before calling Cognito", async () => {
  let fetchCalled = false;
  const result = await processTokenExchange(
    {
      ...validEvent,
      correlationId: "invalid correlation id",
    },
    lambdaContext,
    createDependencies({
      fetch: async () => {
        fetchCalled = true;
        return jsonResponse({});
      },
    }),
  );

  assert.equal(result.ok, false);
  assert.equal(result.error, "invalid_token_exchange_input");
  assert.equal(fetchCalled, false);
});

test("rejects a redirect URI different from the configured value", async () => {
  const result = await processTokenExchange(
    {
      ...validEvent,
      redirectUri: "https://attacker.example.com/callback",
    },
    lambdaContext,
    createDependencies(),
  );

  assert.equal(result.ok, false);
  assert.equal(result.error, "invalid_redirect_uri");
});

test("exchanges and validates a Cognito authorization code", async () => {
  let requestedUrl = "";
  let requestInit: RequestInit | undefined;
  const result = await processTokenExchange(
    validEvent,
    lambdaContext,
    createDependencies({
      fetch: async (input, init) => {
        requestedUrl = input.toString();
        requestInit = init;

        return jsonResponse({
          access_token: "access-token",
          expires_in: 3_600,
          id_token: "id-token",
          refresh_token: "refresh-token",
          token_type: "Bearer",
        });
      },
    }),
  );

  assert.equal(result.ok, true);
  assert.equal(result.claims?.sub, validPayload.sub);
  assert.equal(result.claims?.email, validPayload.email);
  assert.equal(result.diagnostics.lambdaRequestId, "lambda-request-id");
  assert.equal(
    requestedUrl,
    "https://example.auth.us-east-1.amazoncognito.com/oauth2/token",
  );
  assert.equal(requestInit?.method, "POST");
  assert.ok(requestInit?.signal);
  assert.match(String(requestInit?.body), /grant_type=authorization_code/);
});

test("returns the OAuth error supplied by Cognito", async () => {
  const result = await processTokenExchange(
    validEvent,
    lambdaContext,
    createDependencies({
      fetch: async () =>
        jsonResponse(
          {
            error: "invalid_grant",
            error_description: "Authorization code already used.",
          },
          400,
        ),
    }),
  );

  assert.equal(result.ok, false);
  assert.equal(result.error, "invalid_grant");
  assert.equal("detail" in result, false);
});

test("rejects a non-JSON response from Cognito", async () => {
  const result = await processTokenExchange(
    validEvent,
    lambdaContext,
    createDependencies({
      fetch: async () =>
        new Response("<html>Unavailable</html>", {
          headers: { "content-type": "text/html" },
          status: 502,
        }),
    }),
  );

  assert.equal(result.ok, false);
  assert.equal(result.error, "invalid_token_endpoint_response");
});

test("returns a controlled error when the Cognito request times out", async () => {
  const result = await processTokenExchange(
    validEvent,
    lambdaContext,
    createDependencies({
      fetch: async () => {
        throw new DOMException("Request timed out.", "TimeoutError");
      },
    }),
  );

  assert.equal(result.ok, false);
  assert.equal(result.error, "token_endpoint_timeout");
});

test("rethrows unexpected network errors for the Lambda Errors metric", async () => {
  await assert.rejects(
    processTokenExchange(
      validEvent,
      lambdaContext,
      createDependencies({
        fetch: async () => {
          throw new Error("Unexpected network failure.");
        },
      }),
    ),
    /Unexpected network failure/,
  );
});

test("does not expose JWT verification error details", async () => {
  const result = await processTokenExchange(
    validEvent,
    lambdaContext,
    createDependencies({
      verifyIdToken: async () => {
        throw new Error("Detailed signature verification information.");
      },
    }),
  );

  assert.equal(result.ok, false);
  assert.equal(result.error, "token_validation_failed");
  assert.equal("detail" in result, false);
});

test("validates the nonce when the bridge initiated Cognito", async () => {
  const expectedNonce = "0123456789abcdef0123456789abcdef";
  const result = await processTokenExchange(
    {
      ...validEvent,
      expectedNonce,
    },
    lambdaContext,
    createDependencies({
      verifyIdToken: async () => ({
        ...validPayload,
        nonce: expectedNonce,
      }),
    }),
  );

  assert.equal(result.ok, true);
});

test("rejects an ID token with a different nonce", async () => {
  const result = await processTokenExchange(
    {
      ...validEvent,
      expectedNonce: "0123456789abcdef0123456789abcdef",
    },
    lambdaContext,
    createDependencies({
      verifyIdToken: async () => ({
        ...validPayload,
        nonce: "fedcba9876543210fedcba9876543210",
      }),
    }),
  );

  assert.equal(result.ok, false);
  assert.equal(result.error, "invalid_nonce");
});

test("rejects an ID token without the required claims", async () => {
  const result = await processTokenExchange(
    validEvent,
    lambdaContext,
    createDependencies({
      verifyIdToken: async () => ({
        token_use: "id",
      }),
    }),
  );

  assert.equal(result.ok, false);
  assert.equal(result.error, "missing_required_claims");
});

test("rejects an ID token with an unverified email", async () => {
  const result = await processTokenExchange(
    validEvent,
    lambdaContext,
    createDependencies({
      verifyIdToken: async () => ({
        ...validPayload,
        email_verified: false,
      }),
    }),
  );

  assert.equal(result.ok, false);
  assert.equal(result.error, "email_not_verified");
});

test("stops before the HTTP request when execution time is insufficient", async () => {
  await assert.rejects(
    processTokenExchange(
      validEvent,
      {
        ...lambdaContext,
        getRemainingTimeInMillis: () => 1_000,
      },
      createDependencies(),
    ),
    /Insufficient Lambda execution time/,
  );
});
