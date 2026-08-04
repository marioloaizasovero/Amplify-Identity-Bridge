import { randomBytes } from "crypto";

export const vtexCredentialEnvironments = [
  "dev",
  "qa",
  "stage",
  "prod",
] as const;

export type VtexCredentialEnvironment =
  (typeof vtexCredentialEnvironments)[number];

export type GeneratedVtexCredentials = {
  clientId: string;
  clientSecret: string;
  environment: VtexCredentialEnvironment;
  providerName: string;
};

const providerNames: Record<VtexCredentialEnvironment, string> = {
  dev: "ToyotaCognitoDev",
  qa: "ToyotaCognitoQA",
  stage: "ToyotaCognitoStage",
  prod: "ToyotaCognito",
};

export function isVtexCredentialEnvironment(
  value: unknown,
): value is VtexCredentialEnvironment {
  return (
    typeof value === "string" &&
    vtexCredentialEnvironments.some((environment) => environment === value)
  );
}

export function generateVtexCredentials(
  environment: VtexCredentialEnvironment,
): GeneratedVtexCredentials {
  const clientIdSuffix = randomBytes(12).toString("base64url");
  const clientSecret = randomBytes(48).toString("base64url");

  return {
    clientId: `toyota-vtex-${environment}-${clientIdSuffix}`,
    clientSecret,
    environment,
    providerName: providerNames[environment],
  };
}
