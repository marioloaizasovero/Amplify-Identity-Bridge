export type DummyAuthProvider = "cognito" | "vtex";

export type DummyAuthState = {
  provider: DummyAuthProvider;
  mode: "dummy";
};
