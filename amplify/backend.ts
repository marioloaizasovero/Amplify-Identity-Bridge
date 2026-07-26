import { defineBackend } from "@aws-amplify/backend";
import { createBridgeStateTable } from "./custom/bridge-state/resource";
import { cognitoTokenExchange } from "./functions/cognito-token-exchange/resource";

const backend = defineBackend({
  cognitoTokenExchange,
});

const bridgeStack = backend.createStack("identity-bridge-state");
const stateTable = createBridgeStateTable(bridgeStack);

backend.addOutput({
  custom: {
    bridgeStateTableName: stateTable.tableName,
    cognitoTokenExchangeFunctionName:
      backend.cognitoTokenExchange.resources.lambda.functionName,
  },
});