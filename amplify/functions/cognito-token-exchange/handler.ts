import { env } from "$amplify/env/cognito-token-exchange";
import { createRemoteJWKSet, jwtVerify } from "jose";
import {
  logDebug,
  logError,
  logInfo,
  logWarn,
} from "./logger";
import {
  processTokenExchange,
  type TokenExchangeContext,
  type TokenExchangeEvent,
} from "./token-exchange";

const awsRegion = process.env.AWS_REGION;

if (!awsRegion) {
  throw new Error("Missing Lambda runtime AWS_REGION.");
}

const issuer = `https://cognito-idp.${awsRegion}.amazonaws.com/${env.COGNITO_USER_POOL_ID}`;
const jwks = createRemoteJWKSet(
  new URL(`${issuer}/.well-known/jwks.json`),
);

const dependencies = {
  config: {
    clientId: env.COGNITO_CLIENT_ID,
    clientSecret: env.COGNITO_CLIENT_SECRET,
    domain: env.COGNITO_DOMAIN,
    redirectUri: env.COGNITO_REDIRECT_URI,
    httpTimeoutMs: 6_000,
  },
  fetch,
  logger: {
    debug: logDebug,
    error: logError,
    info: logInfo,
    warn: logWarn,
  },
  verifyIdToken: async (token: string) => {
    const result = await jwtVerify(token, jwks, {
      audience: env.COGNITO_CLIENT_ID,
      issuer,
    });

    return result.payload;
  },
};

export const handler = async (
  event: TokenExchangeEvent,
  context: TokenExchangeContext = {},
) => {
  try {
    return await processTokenExchange(event, context, dependencies);
  } catch (error) {
    logError("Cognito token exchange failed unexpectedly.", error, {
      correlationId:
        typeof event.correlationId === "string"
          ? event.correlationId
          : undefined,
      event: "lambda.token_exchange.unexpected_failure",
      lambdaRequestId: context.awsRequestId,
      stage: "unexpected_error",
    });

    throw error;
  }
};
