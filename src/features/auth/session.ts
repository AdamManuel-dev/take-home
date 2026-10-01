import type { SessionResponse } from "../../../shared/contracts/auth";

let generation = 0;
let session: SessionResponse | null = null;
let expired: (() => void) | undefined;
export function sessionSnapshot() {
  return { generation, csrfToken: session?.csrfToken };
}
export function replaceSession(value: SessionResponse | null) {
  generation++;
  session = value;
  return generation;
}
export function onSessionExpired(callback: () => void) {
  expired = callback;
  return () => {
    if (expired === callback) expired = undefined;
  };
}
export function expireSession(expected: number) {
  if (expected === generation) {
    replaceSession(null);
    expired?.();
  }
}
