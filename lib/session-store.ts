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

export type VtexSimulatorStage = {
  name: string;
  status: "success" | "error";
  durationMs?: number;
  detail?: string;
};

export type VtexSimulatorResult = {
  ok: boolean;
  correlationId?: string;
  provider?: string;
  returnUrl?: string;
  error?: string;
  detail?: string;
  token?: {
    expiresIn?: number;
    httpStatus?: number;
    tokenType?: string;
  };
  userInfo?: {
    userId?: string;
    email?: string;
    name?: string;
  };
  stages: VtexSimulatorStage[];
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

function readSimulatorStages(value: unknown): VtexSimulatorStage[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    if (
      typeof item !== "object" ||
      item === null ||
      typeof item.name !== "string" ||
      (item.status !== "success" && item.status !== "error")
    ) {
      return [];
    }

    return [
      {
        name: item.name,
        status: item.status,
        durationMs: optionalNumber(item.durationMs),
        detail: optionalString(item.detail),
      },
    ];
  });
}

function readSimulatorResult(
  value: Record<string, unknown>,
): VtexSimulatorResult | null {
  if (typeof value.ok !== "boolean") {
    return null;
  }

  const tokenValue =
    typeof value.token === "object" && value.token !== null
      ? (value.token as Record<string, unknown>)
      : undefined;
  const userInfoValue =
    typeof value.userInfo === "object" && value.userInfo !== null
      ? (value.userInfo as Record<string, unknown>)
      : undefined;
  const token = tokenValue
      ? {
          expiresIn: optionalNumber(tokenValue.expiresIn),
          httpStatus: optionalNumber(tokenValue.httpStatus),
          tokenType: optionalString(tokenValue.tokenType),
        }
      : undefined;
  const userInfo = userInfoValue
      ? {
          userId: optionalString(userInfoValue.userId),
          email: optionalString(userInfoValue.email),
          name: optionalString(userInfoValue.name),
        }
      : undefined;

  return {
    ok: value.ok,
    correlationId: optionalString(value.correlationId),
    provider: optionalString(value.provider),
    returnUrl: optionalString(value.returnUrl),
    error: optionalString(value.error),
    detail: optionalString(value.detail),
    token,
    userInfo,
    stages: readSimulatorStages(value.stages),
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

export async function saveVtexSimulatorState(input: {
  stateHash: string;
  sessionId: string;
  provider: string;
  returnUrl: string;
  ttl: number;
}) {
  await getDynamoClient().send(
    new PutCommand({
      TableName: getTableName(),
      Item: {
        pk: `vtex-simulator-state#${input.stateHash}`,
        sk: "state",
        sessionId: input.sessionId,
        provider: input.provider,
        returnUrl: input.returnUrl,
        ttl: input.ttl,
        createdAt: new Date().toISOString(),
      },
      ConditionExpression: "attribute_not_exists(pk)",
    }),
  );
}

export async function consumeVtexSimulatorState(stateHash: string) {
  try {
    const result = await getDynamoClient().send(
      new DeleteCommand({
        TableName: getTableName(),
        Key: {
          pk: `vtex-simulator-state#${stateHash}`,
          sk: "state",
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

    const sessionId = optionalString(result.Attributes?.sessionId);
    const provider = optionalString(result.Attributes?.provider);
    const returnUrl = optionalString(result.Attributes?.returnUrl);

    return sessionId && provider && returnUrl
      ? { sessionId, provider, returnUrl }
      : null;
  } catch (error) {
    if (isConditionalCheckFailure(error)) {
      return null;
    }

    throw error;
  }
}

export async function saveVtexSimulatorResult(input: {
  sessionId: string;
  result: VtexSimulatorResult;
  ttl: number;
}) {
  await getDynamoClient().send(
    new PutCommand({
      TableName: getTableName(),
      Item: {
        pk: `vtex-simulator-result#${input.sessionId}`,
        sk: "result",
        ...input.result,
        ttl: input.ttl,
        createdAt: new Date().toISOString(),
      },
    }),
  );
}

export async function getVtexSimulatorResult(sessionId: string) {
  const result = await getDynamoClient().send(
    new GetCommand({
      TableName: getTableName(),
      Key: {
        pk: `vtex-simulator-result#${sessionId}`,
        sk: "result",
      },
      ConsistentRead: true,
    }),
  );
  const ttl =
    typeof result.Item?.ttl === "number" ? result.Item.ttl : undefined;

  if (!result.Item || !ttl || ttl <= nowEpochSeconds()) {
    return null;
  }

  return readSimulatorResult(result.Item);
}
