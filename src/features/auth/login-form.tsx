import { useState, type FormEvent } from "react";
import type { useAuth } from "./use-auth";
export function LoginForm({ auth }: { auth: ReturnType<typeof useAuth> }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault();
    const submitted = password;
    setPassword("");
    await auth.login(username, submitted);
  }
  return (
    <section className="card login-card">
      <h2>Sign in</h2>
      <p>Sign in to view staff schedules and manage your availability.</p>
      {auth.error && (
        <p className="error" role="alert">
          {auth.error}
        </p>
      )}
      <form onSubmit={(event) => void submit(event)}>
        <fieldset disabled={auth.busy}>
          <label htmlFor="username">Username</label>
          <input
            id="username"
            autoComplete="username"
            required
            value={username}
            onChange={(event) => setUsername(event.target.value)}
          />
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <button type="submit">
            {auth.busy ? "Please wait…" : "Sign in"}
          </button>
        </fieldset>
      </form>
      {auth.retryLogout && (
        <button disabled={auth.busy} onClick={() => void auth.logout()}>
          Retry sign out
        </button>
      )}
    </section>
  );
}
