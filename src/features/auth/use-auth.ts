import { useEffect, useRef, useState } from "react";
import {
  sessionResponseSchema,
  type SessionResponse,
} from "../../../shared/contracts/auth";
import { onSessionExpired, replaceSession } from "./session";

const LOGGED_OUT = "open-hours-logged-out";
export function useAuth() {
  const [session, setSession] = useState<SessionResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [identity, setIdentity] = useState(0);
  const version = useRef(0);
  const pendingLogout = useRef<string | undefined>(undefined);
  function accept(value: SessionResponse | null) {
    setIdentity(replaceSession(value));
    setSession(value);
  }
  useEffect(() => {
    let active = true;
    const operation = ++version.current;
    const cleanup = onSessionExpired(() => {
      version.current++;
      accept(null);
      setBusy(false);
      setError("Your session expired. Please sign in again.");
    });
    if (sessionStorage.getItem(LOGGED_OUT)) {
      setLoading(false);
      return cleanup;
    }
    void fetch("/api/auth/me")
      .then(async (response) => {
        if (response.status === 401) return null;
        if (!response.ok)
          throw new Error(
            "Unable to check your session. Please sign in again.",
          );
        return sessionResponseSchema.parse(await response.json());
      })
      .then((value) => {
        if (active && operation === version.current) accept(value);
      })
      .catch(() => {
        if (active && operation === version.current)
          setError("Unable to check your session. Please sign in again.");
      })
      .finally(() => {
        if (active && operation === version.current) setLoading(false);
      });
    return () => {
      active = false;
      cleanup();
    };
  }, []);

  async function login(username: string, password: string) {
    const operation = ++version.current;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      if (!response.ok)
        throw new Error(
          response.status === 429
            ? "Too many login attempts. Please try again later."
            : "Invalid username or password.",
        );
      const value = sessionResponseSchema.parse(await response.json());
      if (operation !== version.current) return;
      pendingLogout.current = undefined;
      sessionStorage.removeItem(LOGGED_OUT);
      accept(value);
    } catch (error) {
      if (operation === version.current)
        setError(error instanceof Error ? error.message : "Unable to sign in.");
    } finally {
      if (operation === version.current) setBusy(false);
    }
  }
  async function logout() {
    const csrf = pendingLogout.current ?? session?.csrfToken;
    const operation = ++version.current;
    pendingLogout.current = csrf;
    sessionStorage.setItem(LOGGED_OUT, "true");
    accept(null);
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/auth/logout", {
        method: "POST",
        headers: { "X-CSRF-Token": csrf ?? "" },
      });
      if (!response.ok && response.status !== 401)
        throw new Error(
          "Sign-out could not be confirmed. Retry sign out or sign in to replace the previous session.",
        );
      if (operation === version.current) pendingLogout.current = undefined;
    } catch {
      if (operation === version.current)
        setError(
          "Sign-out could not be confirmed. Retry sign out or sign in to replace the previous session.",
        );
    } finally {
      if (operation === version.current) setBusy(false);
    }
  }
  return {
    session,
    identity,
    loading,
    busy,
    error,
    login,
    logout,
    retryLogout: Boolean(pendingLogout.current),
  };
}
