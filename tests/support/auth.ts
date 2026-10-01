import request from "supertest";
import type { Express } from "express";
import { createApp as createServerApp } from "../../server/app.js";
import type { StaffRepository } from "../../shared/contracts/persistence.js";
import { AuthService, SESSION_COOKIE } from "../../server/auth/service.js";
import { hashPassword } from "../../server/auth/passwords.js";
import type { Account, AccountRepository } from "../../server/auth/accounts.js";

export const TEST_PASSWORD = "isolated-test-password";
const passwordHash = await hashPassword(TEST_PASSWORD);
export function testAccounts(): AccountRepository {
  const manager: Account = {
    id: "test-manager",
    username: "manager",
    displayName: "Test Manager",
    email: "manager@example.com",
    role: "manager",
    active: true,
    createdAt: "2026-01-01T00:00:00.000Z",
    passwordHash,
  };
  return {
    list: () => [structuredClone(manager)],
    get: (id) => (id === manager.id ? structuredClone(manager) : undefined),
    findByUsername: (username) =>
      username === "manager" ? structuredClone(manager) : undefined,
  };
}
const headers = new WeakMap<Express, Record<string, string>>();
export function createApp(store: StaffRepository) {
  const service = new AuthService(testAccounts());
  const session = service.startSession("test-manager");
  const app = createServerApp(store, {
    service,
    allowedOrigins: ["http://localhost"],
  });
  headers.set(app, {
    Cookie: `${SESSION_COOKIE}=${session.token}`,
    Origin: "http://localhost",
    "X-CSRF-Token": session.csrfToken,
  });
  return app;
}
export default function authenticatedRequest(app: Express) {
  const authHeaders = headers.get(app);
  if (!authHeaders) throw new Error("Missing authenticated test fixture");
  return request.agent(app).set(authHeaders);
}
