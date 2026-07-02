export async function getDummySecretString(secretId: string) {
  return `dummy-secret-value-for-${secretId}`;
}

export function getDummySecretName(name: string) {
  return `/toyota/vtex-bridge/dummy/${name}`;
}
