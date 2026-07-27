import { RemovalPolicy } from "aws-cdk-lib";
import {
  AttributeType,
  BillingMode,
  Table,
} from "aws-cdk-lib/aws-dynamodb";
import type { Construct } from "constructs";

export function createBridgeStateTable(scope: Construct) {
  return new Table(scope, "BridgeStateTable", {
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
}
