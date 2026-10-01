import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { AccountStore } from "../server/auth/accounts.js";
import { hashPassword, verifyPassword } from "../server/auth/passwords.js";

const passwordHash = await hashPassword("test password only");
const input = {
  username: " Alice ",
  displayName: "Alice",
  email: "alice@example.com",
  role: "user" as const,
  staffId: "s1",
  active: true,
  passwordHash,
};
function setup(t: TestContext) {
  const directory = mkdtempSync(join(tmpdir(), "accounts-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const path = join(directory, "users.json");
  const store = new AccountStore((id) => id === "s1", path);
  return { directory, path, store };
}

test("passwords use random salts, bounded work and constant-time matching", async () => {
  const second = await hashPassword("test password only");
  assert.notEqual(second.salt, passwordHash.salt);
  assert.notEqual(second.hash, passwordHash.hash);
  assert.equal(await verifyPassword("test password only", passwordHash), true);
  assert.equal(await verifyPassword("incorrect password", passwordHash), false);
  await assert.rejects(
    verifyPassword("test password only", {
      ...passwordHash,
      N: 2 ** 30,
    } as never),
  );
  await assert.rejects(hashPassword("short"));
});

test("account store normalizes uniqueness, validates staff and required manager emails", (t) => {
  const { store, path } = setup(t);
  const account = store.create(input);
  assert.equal(account.username, "alice");
  assert.equal(store.findByUsername(" ALICE ")?.id, account.id);
  assert.throws(() => store.create({ ...input, username: "ALICE" }));
  assert.throws(() =>
    store.create({ ...input, username: "other", staffId: "missing" }),
  );
  assert.throws(() =>
    store.create({
      ...input,
      username: "other",
      role: "manager",
      email: undefined,
    }),
  );
  assert.throws(() =>
    store.create({ ...input, username: "other", staffId: undefined }),
  );
  const manager = store.create({
    ...input,
    username: "manager",
    role: "manager",
    staffId: undefined,
  });
  assert.equal(manager.role, "manager");
  assert.equal(statSync(path).mode & 0o777, 0o600);
  account.displayName = "Tampered";
  assert.equal(store.get(account.id)?.displayName, "Alice");
  assert.equal(new AccountStore(() => true, path).list().length, 2);
  assert.equal(
    readFileSync(path, "utf8").includes("test password only"),
    false,
  );
});

test("failed writes roll back state and clean temporary credential files", (t) => {
  const { store, path, directory } = setup(t);
  const account = store.create(input);
  rmSync(path);
  mkdirSync(path);
  assert.throws(() =>
    store.update(account.id, (user) => {
      user.active = false;
    }),
  );
  assert.equal(store.get(account.id)?.active, true);
  assert.deepEqual(readdirSync(directory), ["users.json"]);
});

test("startup rejects corrupt, unknown version and dangling account records", (t) => {
  const { store, path } = setup(t);
  const account = store.create(input);
  for (const value of [
    { version: 2, users: [] },
    { version: 1, users: [{ ...account, username: "ALICE" }] },
    { version: 1, users: [{ ...account, staffId: "missing" }] },
  ]) {
    const text = JSON.stringify(value);
    writeFileSync(path, text);
    assert.throws(() => new AccountStore((id) => id === "s1", path));
    assert.equal(readFileSync(path, "utf8"), text);
  }
  writeFileSync(path, "{");
  assert.throws(() => new AccountStore(() => true, path));
});
