export function randomDummyToken(prefix = "dummy-token") {
  return `${prefix}-${Date.now()}`;
}

export function dummyHash(value: string) {
  return `dummy-hash-${value}`;
}

export function nowEpochSeconds() {
  return Math.floor(Date.now() / 1000);
}
