import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
} from "@aws-sdk/lib-dynamodb";
import { config } from "@/lib/config";
import { getBridgeStateTableName } from "@/lib/amplify-outputs";
import { nowEpochSeconds, randomDummyToken } from "@/lib/crypto";

export type CognitoClaims = {
  sub?: string;
  email?: string;
  name?: string;
  username?: string;
};

export type CognitoResult = {
  ok: boolean;
  claims?: CognitoClaims;
  error?: string;
  detail?: string;
};

const dynamo = DynamoDBDocumentClient.from(
  new DynamoDBClient({
    region: config.awsRegion,
  }),
  {
    marshallOptions: {
      removeUndefinedValues: true,
    },
  },
);

function getTableName() {
  return getBridgeStateTableName();
}

export async function saveOAuthState(input: {
  state: string;
  nonce: string;
  ttl: number;
}) {
  await dynamo.send(
    new PutCommand({
      TableName: getTableName(),
      Item: {
        pk: `state#${input.state}`,
        sk: "oauth",
        state: input.state,
        nonce: input.nonce,
        ttl: input.ttl,
        createdAt: new Date().toISOString(),
      },
      ConditionExpression: "attribute_not_exists(pk)",
    }),
  );
}

export async function consumeOAuthState(state: string) {
  const result = await dynamo.send(
    new GetCommand({
      TableName: getTableName(),
      Key: {
        pk: `state#${state}`,
        sk: "oauth",
      },
    }),
  );

  if (!result.Item) {
    return null;
  }

  await dynamo.send(
    new DeleteCommand({
      TableName: getTableName(),
      Key: {
        pk: `state#${state}`,
        sk: "oauth",
      },
    }),
  );

  return {
    nonce: String(result.Item.nonce),
    state: String(result.Item.state),
  };
}

export async function saveCognitoResult(input: {
  sessionId: string;
  claims?: CognitoClaims;
  error?: string;
  detail?: string;
  ttl: number;
}) {
  await dynamo.send(
    new PutCommand({
      TableName: getTableName(),
      Item: {
        pk: `session#${input.sessionId}`,
        sk: "cognito",
        claims: input.claims,
        detail: input.detail,
        error: input.error,
        ok: !input.error,
        ttl: input.ttl,
        createdAt: new Date().toISOString(),
      },
    }),
  );
}

export async function getCognitoResult(sessionId: string) {
  const result = await dynamo.send(
    new GetCommand({
      TableName: getTableName(),
      Key: {
        pk: `session#${sessionId}`,
        sk: "cognito",
      },
    }),
  );

  if (!result.Item) {
    return null;
  }

  return {
    claims: result.Item.claims as CognitoClaims | undefined,
    createdAt: result.Item.createdAt as string | undefined,
    detail: result.Item.detail as string | undefined,
    error: result.Item.error as string | undefined,
    ok: Boolean(result.Item.ok),
  };
}

export function getStateTtl() {
  return nowEpochSeconds() + config.cognitoStateTtlSeconds;
}

export function getSessionTtl() {
  return nowEpochSeconds() + config.bridgeSessionTtlSeconds;
}

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
