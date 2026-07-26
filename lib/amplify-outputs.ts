import { createRequire } from "module";

type BridgeOutputs = {
  custom?: {
    bridgeStateTableName?: string;
    cognitoTokenExchangeFunctionName?: string;
  };
};

const require = createRequire(import.meta.url);

function readOutputs(): BridgeOutputs {
  try {
    return require("../amplify_outputs.json") as BridgeOutputs;
  } catch {
    return {};
  }
}

export function getBridgeStateTableName() {
  const tableName =
    readOutputs().custom?.bridgeStateTableName ??
    process.env.BRIDGE_STATE_TABLE_NAME;

  if (!tableName) {
    throw new Error("Missing bridge state table name output.");
  }

  return tableName;
}

export function getCognitoTokenExchangeFunctionName() {
  const functionName =
    readOutputs().custom?.cognitoTokenExchangeFunctionName ??
    process.env.COGNITO_TOKEN_EXCHANGE_FUNCTION_NAME;

  if (!functionName) {
    throw new Error("Missing Cognito token exchange function name output.");
  }

  return functionName;
}
