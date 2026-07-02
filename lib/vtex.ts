export function getDummyVtexConfig() {
  return {
    provider: "vtex",
    mode: "dummy",
  };
}

export function validateDummyVtexClient(clientId?: string) {
  return {
    valid: true,
    clientId: clientId ?? "dummy-vtex-client-id",
  };
}

export function mapDummyUserInfo() {
  return {
    userId: "dummy-user",
    email: "dummy@example.com",
    name: "Dummy User",
  };
}
