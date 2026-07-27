import outputs from "@/amplify_outputs.json";

function requiredCustomOutput(
  name:
    | "bridgeStateTableName"
    | "cognitoTokenExchangeFunctionName",
) {
  const value = outputs.custom?.[name];

  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Missing required Amplify output: custom.${name}`);
  }

  return value;
}

export function getBridgeStateTableName() {
  return requiredCustomOutput("bridgeStateTableName");
}

export function getCognitoTokenExchangeFunctionName() {
  return requiredCustomOutput("cognitoTokenExchangeFunctionName");
}
