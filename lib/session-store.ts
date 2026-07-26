import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DeleteCommand,
  DynamoDBDocumentClient,
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

let dynamo: DynamoDBDocumentClient | undefined;

function getDynamoClient() {
  dynamo ??= DynamoDBDocumentClient.from(
    new DynamoDBClient({
      region: config.awsRegion,
    }),
    {
      marshallOptions: {
        removeUndefinedValues: true,
      },
    },
  );

  return dynamo;
}

function isConditionalCheckFailure(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "name" in error &&
    error.name === "ConditionalCheckFailedException"
  );
}

function optionalString(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

function readClaims(value: unknown): CognitoClaims | undefined {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }

  const claims = value as Record<string, unknown>;

  return {
    sub: optionalString(claims.sub),
    email: optionalString(claims.email),
    name: optionalString(claims.name),
    username: optionalString(claims.username),
  };
}

function getTableName() {
  return getBridgeStateTableName();
}

export async function saveOAuthState(input: {
  state: string;
  nonce: string;
  ttl: number;
}) {
  await getDynamoClient().send(
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
  try {
    const result = await getDynamoClient().send(
      new DeleteCommand({
        TableName: getTableName(),
        Key: {
          pk: `state#${state}`,
          sk: "oauth",
        },
        ConditionExpression: "#ttl > :now",
        ExpressionAttributeNames: {
          "#ttl": "ttl",
        },
        ExpressionAttributeValues: {
          ":now": nowEpochSeconds(),
        },
        ReturnValues: "ALL_OLD",
      }),
    );
    const nonce = optionalString(result.Attributes?.nonce);
    const storedState = optionalString(result.Attributes?.state);

    if (!nonce || storedState !== state) {
      return null;
    }

    return {
      nonce,
      state: storedState,
    };
  } catch (error) {
    if (isConditionalCheckFailure(error)) {
      return null;
    }

    throw error;
  }
}

export async function saveCognitoResult(input: {
  sessionId: string;
  claims?: CognitoClaims;
  error?: string;
  detail?: string;
  ttl: number;
}) {
  await getDynamoClient().send(
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

export async function consumeCognitoResult(sessionId: string) {
  try {
    const result = await getDynamoClient().send(
      new DeleteCommand({
        TableName: getTableName(),
        Key: {
          pk: `session#${sessionId}`,
          sk: "cognito",
        },
        ConditionExpression: "#ttl > :now",
        ExpressionAttributeNames: {
          "#ttl": "ttl",
        },
        ExpressionAttributeValues: {
          ":now": nowEpochSeconds(),
        },
        ReturnValues: "ALL_OLD",
      }),
    );

    if (!result.Attributes || typeof result.Attributes.ok !== "boolean") {
      return null;
    }

    return {
      claims: readClaims(result.Attributes.claims),
      createdAt: optionalString(result.Attributes.createdAt),
      detail: optionalString(result.Attributes.detail),
      error: optionalString(result.Attributes.error),
      ok: result.Attributes.ok,
    };
  } catch (error) {
    if (isConditionalCheckFailure(error)) {
      return null;
    }

    throw error;
  }
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
