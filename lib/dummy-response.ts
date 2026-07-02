export function buildDummyResponse(endpoint: string) {
  return {
    ok: true,
    endpoint,
    mode: "dummy",
    message: "Hola mundo desde el scaffold inicial del identity bridge.",
  };
}
