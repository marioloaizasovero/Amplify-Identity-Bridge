import { defineBackend } from "@aws-amplify/backend";
import { RemovalPolicy } from "aws-cdk-lib";
import {
  AttributeType,
  BillingMode,
  Table,
} from "aws-cdk-lib/aws-dynamodb";
import { cognitoTokenExchange } from "./functions/cognito-token-exchange/resource";

const backend = defineBackend({
  cognitoTokenExchange,
});

const bridgeStack = backend.createStack("identity-bridge-state");

const stateTable = new Table(bridgeStack, "BridgeStateTable", {
  tableName: "toyota-identity-bridge-state-develop",
  partitionKey: {
    name: "pk",
    type: AttributeType.STRING,
  },
  sortKey: {
    name: "sk",
    type: AttributeType.STRING,
  },
  billingMode: BillingMode.PAY_PER_REQUEST,
  timeToLiveAttribute: "ttl",
  removalPolicy: RemovalPolicy.DESTROY,
});

backend.addOutput({
  custom: {
    bridgeStateTableName: stateTable.tableName,
    cognitoTokenExchangeFunctionName:
      backend.cognitoTokenExchange.resources.lambda.functionName,
  },
});
