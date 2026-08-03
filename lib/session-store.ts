import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DeleteCommand,
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
} from "@aws-sdk/lib-dynamodb";
import { config } from "@/lib/config";
import { getBridgeStateTableName } from "@/lib/amplify-outputs";
import { nowEpochSeconds } from "@/lib/crypto";

export type CognitoClaims = {
  sub?: string;
  email?: string;
  emailVerified?: boolean;
  name?: string;
  username?: string;
};

export type CognitoResult = {
  ok: boolean;
  claims?: CognitoClaims;
  error?: string;
  detail?: string;
  diagnostics?: {
    lambdaRequestId?: string;
    tokenExpiresIn?: number;
    tokenType?: string;
  };
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

function optionalBoolean(value: unknown) {
  return typeof value === "boolean" ? value : undefined;
}

function optionalNumber(value: unknown) {
  return typeof value === "number" ? value : undefined;
}

function readClaims(value: unknown): CognitoClaims | undefined {
  if (typeof value !== "object" || value === null) {
    return undefined;
  }

  const claims = value as Record<string, unknown>;

  return {
    sub: optionalString(claims.sub),
    email: optionalString(claims.email),
    emailVerified: optionalBoolean(claims.emailVerified),
    name: optionalString(claims.name),
    username: optionalString(claims.username),
  };
}

function getTableName() {
  return getBridgeStateTableName();
}

export async function saveCognitoResult(input: {
  sessionId: string;
  correlationId: string;
  claims?: CognitoClaims;
  error?: string;
  detail?: string;
  diagnostics?: CognitoResult["diagnostics"];
  stage: string;
  ttl: number;
}) {
  await getDynamoClient().send(
    new PutCommand({
      TableName: getTableName(),
      Item: {
        pk: `session#${input.sessionId}`,
        sk: "cognito",
        claims: input.claims,
        correlationId: input.correlationId,
        detail: input.detail,
        diagnostics: input.diagnostics,
        error: input.error,
        ok: !input.error,
        stage: input.stage,
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
      correlationId: optionalString(result.Attributes.correlationId),
      createdAt: optionalString(result.Attributes.createdAt),
      detail: optionalString(result.Attributes.detail),
      diagnostics:
        typeof result.Attributes.diagnostics === "object" &&
        result.Attributes.diagnostics !== null
          ? {
              lambdaRequestId: optionalString(
                result.Attributes.diagnostics.lambdaRequestId,
              ),
              tokenExpiresIn: optionalNumber(
                result.Attributes.diagnostics.tokenExpiresIn,
              ),
              tokenType: optionalString(
                result.Attributes.diagnostics.tokenType,
              ),
            }
          : undefined,
      error: optionalString(result.Attributes.error),
      ok: result.Attributes.ok,
      stage: optionalString(result.Attributes.stage),
    };
  } catch (error) {
    if (isConditionalCheckFailure(error)) {
      return null;
    }

    throw error;
  }
}

export function getSessionTtl() {
  return nowEpochSeconds() + config.bridgeSessionTtlSeconds;
}

export async function saveBridgeSession(input: {
  sessionId: string;
  correlationId: string;
  claims: CognitoClaims;
  ttl: number;
}) {
  await getDynamoClient().send(
    new PutCommand({
      TableName: getTableName(),
      Item: {
        pk: `bridge-session#${input.sessionId}`,
        sk: "session",
        claims: input.claims,
        correlationId: input.correlationId,
        ttl: input.ttl,
        createdAt: new Date().toISOString(),
      },
      ConditionExpression: "attribute_not_exists(pk)",
    }),
  );
}

export async function consumeBridgeSession(sessionId: string) {
  try {
    const result = await getDynamoClient().send(
      new DeleteCommand({
        TableName: getTableName(),
        Key: {
          pk: `bridge-session#${sessionId}`,
          sk: "session",
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

    const claims = readClaims(result.Attributes?.claims);
    const correlationId = optionalString(result.Attributes?.correlationId);

    return claims && correlationId ? { claims, correlationId } : null;
  } catch (error) {
    if (isConditionalCheckFailure(error)) {
      return null;
    }

    throw error;
  }
}

export async function saveVtexAuthorizationCode(input: {
  codeHash: string;
  clientId: string;
  correlationId: string;
  redirectUri: string;
  claims: CognitoClaims;
  ttl: number;
}) {
  await getDynamoClient().send(
    new PutCommand({
      TableName: getTableName(),
      Item: {
        pk: `vtex-code#${input.codeHash}`,
        sk: "authorization-code",
        clientId: input.clientId,
        correlationId: input.correlationId,
        redirectUri: input.redirectUri,
        claims: input.claims,
        ttl: input.ttl,
        createdAt: new Date().toISOString(),
      },
      ConditionExpression: "attribute_not_exists(pk)",
    }),
  );
}

export async function consumeVtexAuthorizationCode(input: {
  codeHash: string;
  clientId: string;
  redirectUri: string;
}) {
  try {
    const result = await getDynamoClient().send(
      new DeleteCommand({
        TableName: getTableName(),
        Key: {
          pk: `vtex-code#${input.codeHash}`,
          sk: "authorization-code",
        },
        ConditionExpression:
          "#ttl > :now AND clientId = :clientId AND redirectUri = :redirectUri",
        ExpressionAttributeNames: {
          "#ttl": "ttl",
        },
        ExpressionAttributeValues: {
          ":now": nowEpochSeconds(),
          ":clientId": input.clientId,
          ":redirectUri": input.redirectUri,
        },
        ReturnValues: "ALL_OLD",
      }),
    );

    const claims = readClaims(result.Attributes?.claims);
    const correlationId = optionalString(result.Attributes?.correlationId);

    return claims && correlationId ? { claims, correlationId } : null;
  } catch (error) {
    if (isConditionalCheckFailure(error)) {
      return null;
    }

    throw error;
  }
}

export async function saveVtexAccessToken(input: {
  tokenHash: string;
  correlationId: string;
  claims: CognitoClaims;
  ttl: number;
}) {
  await getDynamoClient().send(
    new PutCommand({
      TableName: getTableName(),
      Item: {
        pk: `vtex-token#${input.tokenHash}`,
        sk: "access-token",
        claims: input.claims,
        correlationId: input.correlationId,
        ttl: input.ttl,
        createdAt: new Date().toISOString(),
      },
      ConditionExpression: "attribute_not_exists(pk)",
    }),
  );
}

export async function getVtexAccessToken(tokenHash: string) {
  const result = await getDynamoClient().send(
    new GetCommand({
      TableName: getTableName(),
      Key: {
        pk: `vtex-token#${tokenHash}`,
        sk: "access-token",
      },
      ConsistentRead: true,
    }),
  );

  const ttl =
    typeof result.Item?.ttl === "number" ? result.Item.ttl : undefined;

  if (!ttl || ttl <= nowEpochSeconds()) {
    return null;
  }

  const claims = readClaims(result.Item?.claims);
  const correlationId = optionalString(result.Item?.correlationId);

  return claims && correlationId ? { claims, correlationId } : null;
}
