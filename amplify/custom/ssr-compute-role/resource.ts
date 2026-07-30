import type { ITable } from "aws-cdk-lib/aws-dynamodb";
import {
  Effect,
  PolicyStatement,
  Role,
  ServicePrincipal,
} from "aws-cdk-lib/aws-iam";
import type { IFunction } from "aws-cdk-lib/aws-lambda";
import type { Construct } from "constructs";

type SsrComputeRoleResources = {
  stateTable: ITable;
  tokenExchangeFunction: IFunction;
};

export function createSsrComputeRole(
  scope: Construct,
  resources: SsrComputeRoleResources,
) {
  const role = new Role(scope, "SsrComputeRole", {
    assumedBy: new ServicePrincipal("amplify.amazonaws.com"),
    description:
      "Allows the Amplify SSR runtime to use the identity bridge resources.",
  });

  role.addToPolicy(
    new PolicyStatement({
      actions: [
        "dynamodb:GetItem",
        "dynamodb:PutItem",
        "dynamodb:DeleteItem",
      ],
      effect: Effect.ALLOW,
      resources: [resources.stateTable.tableArn],
    }),
  );

  role.addToPolicy(
    new PolicyStatement({
      actions: ["lambda:InvokeFunction"],
      effect: Effect.ALLOW,
      resources: [resources.tokenExchangeFunction.functionArn],
    }),
  );

  return role;
}
