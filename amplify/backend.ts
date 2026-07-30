import { defineBackend } from "@aws-amplify/backend";
import { createBridgeStateTable } from "./custom/bridge-state/resource";
import { createSsrComputeRole } from "./custom/ssr-compute-role/resource";
import { cognitoTokenExchange } from "./functions/cognito-token-exchange/resource";

const backend = defineBackend({
  cognitoTokenExchange,
});

const bridgeStack = backend.createStack("identity-bridge-state");
const stateTable = createBridgeStateTable(bridgeStack);

const runtimeAccessStack = backend.createStack(
  "identity-bridge-runtime-access",
);
const ssrComputeRole = createSsrComputeRole(runtimeAccessStack, {
  stateTable,
  tokenExchangeFunction:
    backend.cognitoTokenExchange.resources.lambda,
});

backend.addOutput({
  custom: {
    bridgeStateTableName: stateTable.tableName,
    cognitoTokenExchangeFunctionName:
      backend.cognitoTokenExchange.resources.lambda.functionName,
    ssrComputeRoleArn: ssrComputeRole.roleArn,
  },
});
