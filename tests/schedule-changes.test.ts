import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { Store } from "../server/store.js";
import request, { createApp } from "./support/auth.js";
const actor = { id: "actor", name: "Original actor" };
const windows = [{ start: 540, end: 600 }];
function setup(t: TestContext) {
  const directory = mkdtempSync(join(tmpdir(), "schedule-events-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const path = join(directory, "schedules.json");
  const store = new Store(path, () => new Date("2026-09-30T12:00:00.000Z"));
  const staff = store.create("Original staff");
  return { store, staff, path };
}

test("weekly events preserve each committed edit, normalized values, actor snapshots and sequences", (t) => {
  const { store, staff, path } = setup(t);
  store.update(
    staff.id,
    (record) => {
      record.weekly[1] = [
        { start: 570, end: 600 },
        { start: 540, end: 570 },
      ];
    },
    actor,
  );
  store.update(
    staff.id,
    (record) => {
      record.weekly[1] = windows;
    },
    actor,
  );
  store.update(
    staff.id,
    (record) => {
      record.weekly[1] = [{ start: 540, end: 660 }];
    },
    actor,
  );
  store.update(
    staff.id,
    (record) => {
      record.weekly[1] = windows;
    },
    actor,
  );
  store.update(
    staff.id,
    (record) => {
      record.weekly[1] = [];
    },
    actor,
  );
  const changes = store.reportingSnapshot().changes;
  assert.deepEqual(
    changes.map((event) => event.operation),
    ["created", "updated", "updated", "deleted"],
  );
  assert.deepEqual(
    changes.map((event) => event.sequence),
    [1, 2, 3, 4],
  );
  assert.equal(new Set(changes.map((event) => event.id)).size, 4);
  assert.deepEqual(changes[0].after, windows);
  assert.deepEqual(changes[0].actor, actor);
  assert.deepEqual(changes[0].staff, { id: staff.id, name: "Original staff" });
  assert.equal(changes[0].occurredAt, "2026-09-30T12:00:00.000Z");
  changes[0].actor.name = "Tampered";
  assert.equal(
    store.reportingSnapshot().changes[0].actor.name,
    "Original actor",
  );
  assert.equal(JSON.parse(readFileSync(path, "utf8")).nextChangeSequence, 5);
  assert.deepEqual(
    new Store(path).reportingSnapshot(),
    store.reportingSnapshot(),
  );
});

test("overrides classify existence separately from windows and capture all modes and removals", (t) => {
  const { store, staff } = setup(t);
  const date = "2026-10-01";
  store.update(
    staff.id,
    (record) => {
      record.overrides = [{ date, mode: "unavailable", windows: [] }];
    },
    actor,
  );
  store.update(
    staff.id,
    (record) => {
      record.overrides = [{ date, mode: "replace", windows }];
    },
    actor,
  );
  store.update(
    staff.id,
    (record) => {
      record.overrides = [{ date, mode: "add", windows }];
    },
    actor,
  );
  store.update(
    staff.id,
    (record) => {
      record.overrides = [];
    },
    actor,
  );
  store.update(
    staff.id,
    (record) => {
      record.overrides = [];
    },
    actor,
  );
  const changes = store.reportingSnapshot().changes;
  assert.deepEqual(
    changes.map((event) => event.operation),
    ["created", "updated", "updated", "deleted"],
  );
  assert.deepEqual(changes[0].before, null);
  assert.deepEqual(changes[0].after, { mode: "unavailable", windows: [] });
  assert.deepEqual(changes[3].after, null);
});

test("appointments are excluded, missing actors rejected, and failed persistence publishes neither edits nor events", (t) => {
  const { store, staff, path } = setup(t);
  assert.throws(() =>
    store.update(staff.id, (record) => {
      record.weekly[1] = windows;
    }),
  );
  assert.deepEqual(store.get(staff.id)!.weekly[1], []);
  store.update(staff.id, (record) => {
    record.appointments = [
      {
        id: "booking",
        title: "Meeting",
        date: "2026-10-01",
        start: 540,
        end: 570,
      },
    ];
  });
  assert.equal(store.reportingSnapshot().changes.length, 0);
  store.update(
    staff.id,
    (record) => {
      record.weekly[1] = windows;
    },
    actor,
  );
  const before = store.get(staff.id);
  const history = store.reportingSnapshot();
  rmSync(path);
  mkdirSync(path);
  assert.throws(() =>
    store.update(
      staff.id,
      (record) => {
        record.weekly[1] = [];
        record.overrides = [
          { date: "2026-10-01", mode: "unavailable", windows: [] },
        ];
      },
      actor,
    ),
  );
  assert.deepEqual(store.get(staff.id), before);
  assert.deepEqual(store.reportingSnapshot(), history);
});

test("HTTP edits use trusted session actor and searches never append events", async (t) => {
  const { store, staff } = setup(t);
  const app = createApp(store);
  await request(app)
    .put(`/api/staff/${staff.id}/weekly/1`)
    .send({ windows, actor: { id: "forged", name: "Attacker" } })
    .expect(200);
  await request(app)
    .put(`/api/staff/${staff.id}/overrides/2026-10-01`)
    .send({ mode: "unavailable", windows: [], actor: { id: "forged" } })
    .expect(200);
  await request(app)
    .post(`/api/staff/${staff.id}/availability`)
    .send({ start: "2026-10-01", end: "2026-10-01", duration: 30 })
    .expect(200);
  await request(app)
    .delete(`/api/staff/${staff.id}/overrides/2026-10-02`)
    .expect(200);
  assert.equal(store.reportingSnapshot().changes.length, 2);
  assert.ok(
    store
      .reportingSnapshot()
      .changes.every(
        (event) =>
          event.actor.id === "test-manager" &&
          event.actor.name === "Test Manager",
      ),
  );
});
