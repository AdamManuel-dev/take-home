import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import request from "supertest";
import { createApp } from "../server/app.js";
import { AccountStore } from "../server/auth/accounts.js";
import { AuthService, SESSION_COOKIE } from "../server/auth/service.js";
import { hashPassword } from "../server/auth/passwords.js";
import { Store } from "../server/store.js";
const password = "auth-test-password";
const passwordHash = await hashPassword(password);
const origin = "http://localhost";
function setup(t: TestContext) {
  const directory = mkdtempSync(join(tmpdir(), "auth-api-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const store = new Store(join(directory, "schedules.json"));
  const own = store.create("Own");
  const other = store.create("Other");
  const accounts = new AccountStore(
    (id) => Boolean(store.get(id)),
    join(directory, "users.json"),
  );
  const user = accounts.create({
    username: "user",
    displayName: "User",
    role: "user",
    staffId: own.id,
    active: true,
    passwordHash,
  });
  accounts.create({
    username: "manager",
    displayName: "Manager",
    role: "manager",
    email: "m@example.com",
    active: true,
    passwordHash,
  });
  let now = 0;
  const service = new AuthService(accounts, () => now);
  const app = createApp(store, { service, allowedOrigins: [origin] });
  return {
    app,
    store,
    accounts,
    user,
    own,
    other,
    advance: () => {
      now += 8 * 60 * 60 * 1000;
    },
  };
}
async function login(app: ReturnType<typeof createApp>, username = "user") {
  const response = await request(app)
    .post("/api/auth/login")
    .set("Origin", origin)
    .send({ username, password })
    .expect(200);
  return {
    cookie: response.headers["set-cookie"][0].split(";")[0],
    csrf: response.body.csrfToken,
    body: response.body,
  };
}

test("anonymous routes fail closed, profiles exclude secrets, login rotates and logout invalidates", async (t) => {
  const { app } = setup(t);
  for (const path of [
    "/api/staff",
    "/api/staff/unknown/schedule",
    "/api/auth/me",
  ])
    await request(app).get(path).expect(401);
  await request(app).post("/api/staff").send({ name: "Denied" }).expect(401);
  await request(app)
    .post("/api/auth/login")
    .send({ username: "user", password })
    .expect(403);
  const session = await login(app);
  assert.equal(JSON.stringify(session.body).includes("passwordHash"), false);
  const me = await request(app)
    .get("/api/auth/me")
    .set("Cookie", session.cookie)
    .expect(200);
  assert.equal(me.body.profile.role, "user");
  const rotated = await request(app)
    .post("/api/auth/login")
    .set("Origin", origin)
    .set("Cookie", session.cookie)
    .send({ username: "user", password })
    .expect(200);
  await request(app)
    .get("/api/auth/me")
    .set("Cookie", session.cookie)
    .expect(401);
  const cookie = rotated.headers["set-cookie"][0].split(";")[0];
  assert.notEqual(cookie, session.cookie);
  await request(app)
    .post("/api/auth/logout")
    .set("Origin", origin)
    .set("Cookie", cookie)
    .set("X-CSRF-Token", rotated.body.csrfToken)
    .expect(204);
  await request(app).get("/api/auth/me").set("Cookie", cookie).expect(401);
});

test("users read all staff but all write routes enforce ownership; managers edit everyone", async (t) => {
  const { app, own, other } = setup(t);
  const session = await login(app);
  const client = () =>
    request.agent(app).set({
      Cookie: session.cookie,
      Origin: origin,
      "X-CSRF-Token": session.csrf,
    });
  await client().get("/api/staff").expect(200);
  await client().get(`/api/staff/${other.id}/schedule`).expect(200);
  await request(app)
    .post(`/api/staff/${other.id}/availability`)
    .set("Cookie", session.cookie)
    .send({ start: "2026-09-28", end: "2026-09-28", duration: 30 })
    .expect(200);
  await request(app)
    .post(`/api/staff/${other.id}/availability/`)
    .set("Cookie", session.cookie)
    .send({ start: "2026-09-28", end: "2026-09-28", duration: 30 })
    .expect(200);
  await client().post("/api/staff").send({ name: "Denied" }).expect(403);
  await client()
    .put(`/api/staff/${other.id}/weekly/1`)
    .send({ windows: [] })
    .expect(403);
  await client()
    .put(`/api/staff/${other.id}/overrides/2026-09-28`)
    .send({ mode: "unavailable", windows: [] })
    .expect(403);
  await client()
    .delete(`/api/staff/${other.id}/overrides/2026-09-28`)
    .expect(403);
  await client()
    .post(`/api/staff/${other.id}/appointments`)
    .send({})
    .expect(403);
  await client()
    .delete(`/api/staff/${other.id}/appointments/unknown`)
    .expect(403);
  await client()
    .put("/api/staff/unknown/weekly/1")
    .send({ windows: [] })
    .expect(404);
  await client()
    .put(`/api/staff/${own.id}/weekly/1`)
    .send({ windows: [{ start: 540, end: 600 }] })
    .expect(200);
  const manager = await login(app, "manager");
  await request(app)
    .put(`/api/staff/${other.id}/weekly/1`)
    .set({
      Cookie: manager.cookie,
      Origin: origin,
      "X-CSRF-Token": manager.csrf,
    })
    .send({ windows: [] })
    .expect(200);
});

test("mutations require trusted origin and CSRF; roles, activation, expiry are checked on every request", async (t) => {
  const { app, accounts, user, own, advance } = setup(t);
  const session = await login(app);
  const path = `/api/staff/${own.id}/weekly/1`;
  await request(app)
    .put(path)
    .set("Cookie", session.cookie)
    .send({ windows: [] })
    .expect(403);
  await request(app)
    .put(path)
    .set({
      Cookie: session.cookie,
      Origin: "http://evil.example",
      "X-CSRF-Token": session.csrf,
    })
    .send({ windows: [] })
    .expect(403);
  await request(app)
    .put(path)
    .set({
      Cookie: session.cookie,
      Origin: origin,
      "X-CSRF-Token": "é".repeat(64),
    })
    .send({ windows: [] })
    .expect(403);
  accounts.update(user.id, (account) => {
    account.role = "manager";
    account.email = "new@example.com";
  });
  assert.equal(
    (
      await request(app)
        .get("/api/auth/me")
        .set("Cookie", session.cookie)
        .expect(200)
    ).body.profile.role,
    "manager",
  );
  accounts.update(user.id, (account) => {
    account.active = false;
  });
  await request(app)
    .get("/api/auth/me")
    .set("Cookie", session.cookie)
    .expect(401);
  const manager = await login(app, "manager");
  advance();
  await request(app)
    .get("/api/auth/me")
    .set("Cookie", manager.cookie)
    .expect(401);
  await request(app)
    .get("/api/auth/me")
    .set("Cookie", `${SESSION_COOKIE}=invalid`)
    .expect(401);
});

test("invalid login errors are generic and login attempts are bounded", async (t) => {
  const { app } = setup(t);
  let message;
  for (let i = 0; i < 10; i++) {
    const response = await request(app)
      .post("/api/auth/login")
      .set("Origin", origin)
      .send({ username: i % 2 ? "user" : "missing", password: "wrong" })
      .expect(401);
    message ??= response.body;
    assert.deepEqual(response.body, message);
  }
  await request(app)
    .post("/api/auth/login")
    .set("Origin", origin)
    .send({ username: "user", password })
    .expect(429);
});

test("concurrent password work is bounded and sessions do not survive a new service", async (t) => {
  const { accounts, user } = setup(t);
  const service = new AuthService(accounts);
  const results = await Promise.all(
    Array.from({ length: 5 }, (_, index) =>
      service.login("user", password, `ip-${index}`),
    ),
  );
  assert.equal(results.filter((result) => result.limited).length, 1);
  const session = service.startSession(user.id);
  assert.ok(service.resolve(session.token));
  assert.equal(new AuthService(accounts).resolve(session.token), undefined);
});
