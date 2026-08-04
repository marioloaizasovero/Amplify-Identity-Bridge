import { InvokeCommand, LambdaClient } from "@aws-sdk/client-lambda";
import { getCognitoTokenExchangeFunctionName } from "@/lib/amplify-outputs";
import { config } from "@/lib/config";
import type { CognitoResult } from "@/lib/session-store";

let lambda: LambdaClient | undefined;

function getLambdaClient() {
  lambda ??= new LambdaClient({
    region: config.awsRegion,
  });

  return lambda;
}

function isCognitoResult(value: unknown): value is CognitoResult {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const result = value as {
    ok?: unknown;
    claims?: {
      sub?: unknown;
      email?: unknown;
      emailVerified?: unknown;
    };
  };

  if (result.ok === false) {
    return true;
  }

  return (
    result.ok === true &&
    typeof result.claims?.sub === "string" &&
    typeof result.claims.email === "string" &&
    result.claims.emailVerified === true
  );
}

export async function invokeCognitoTokenExchange(input: {
  code: string;
  correlationId: string;
  expectedNonce?: string;
  redirectUri: string;
}): Promise<CognitoResult> {
  const response = await getLambdaClient().send(
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

  const result: unknown = JSON.parse(
    Buffer.from(response.Payload).toString("utf-8"),
  );

  if (!isCognitoResult(result)) {
    return {
      ok: false,
      error: "invalid_token_exchange_response",
    };
  }

  return result;
}
