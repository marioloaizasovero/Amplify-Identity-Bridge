import { InvokeCommand, LambdaClient } from "@aws-sdk/client-lambda";
import { config } from "@/lib/config";
import { getCognitoTokenExchangeFunctionName } from "@/lib/amplify-outputs";
import type { CognitoResult } from "@/lib/session-store";

const lambda = new LambdaClient({
  region: config.awsRegion,
});

export async function invokeCognitoTokenExchange(input: {
  code: string;
  redirectUri: string;
  expectedNonce: string;
}): Promise<CognitoResult> {
  const response = await lambda.send(
    new InvokeCommand({
      FunctionName: getCognitoTokenExchangeFunctionName(),
      InvocationType: "RequestResponse",
      Payload: Buffer.from(JSON.stringify(input)),
    }),
  );

  if (response.FunctionError) {
    return {
      ok: false,
      error: "token_exchange_function_error",
      detail: response.FunctionError,
    };
  }

  if (!response.Payload) {
    return {
      ok: false,
      error: "empty_token_exchange_response",
    };
  }

  return JSON.parse(Buffer.from(response.Payload).toString("utf-8"));
}
