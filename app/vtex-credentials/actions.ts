"use server";

import "server-only";
import { config } from "@/lib/config";
import {
  generateVtexCredentials,
  isVtexCredentialEnvironment,
  type GeneratedVtexCredentials,
} from "@/lib/vtex-credentials";

export type CredentialGeneratorState = {
  credentials?: GeneratedVtexCredentials;
  error?: string;
};

export async function generateVtexCredentialsAction(
  _previousState: CredentialGeneratorState,
  formData: FormData,
): Promise<CredentialGeneratorState> {
  if (!config.enableVtexCredentialGenerator) {
    return {
      error: "El generador de credenciales no está habilitado.",
    };
  }

  const environment = formData.get("environment");

  if (!isVtexCredentialEnvironment(environment)) {
    return {
      error: "Selecciona un ambiente válido.",
    };
  }

  return {
    credentials: generateVtexCredentials(environment),
  };
}
