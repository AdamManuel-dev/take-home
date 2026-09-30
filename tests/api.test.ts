import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import request from "supertest";
import { createApp } from "../server/app.js";
import { Store } from "../server/store.js";

/** Creates an isolated temporary repository and Express app, with cleanup after the test. */
function setup(t: TestContext) {
  /** Unique temporary directory that keeps integration tests separate from application data. */
  const directory = mkdtempSync(join(tmpdir(), "open-hours-"));
  t.after(
    /** Removes this test's temporary storage after its assertions finish. */ () =>
      rmSync(directory, { recursive: true, force: true }),
  );

  /** Data-file path reused when testing a fresh store loading persisted state. */
  const file = join(directory, "schedules.json");

  return { file, app: createApp(new Store(file)) };
}

test("complete workflow persists on restart and isolates same-name staff", /** Verifies staff isolation, schedule mutations, override removal, and reopening persisted data. */ async (t) => {
  /** Isolated app and data file for the complete persistence workflow. */
  const { app, file } = setup(t);

  /** First persisted staff identity, created with surrounding whitespace to test trimming. */
  const first = (
    await request(app).post("/api/staff").send({ name: " Alex " }).expect(201)
  ).body;

  /** Second identity with the same name, used to prove schedules are keyed by ID. */
  const second = (
    await request(app).post("/api/staff").send({ name: "Alex" }).expect(201)
  ).body;
  assert.notEqual(first.id, second.id);
  assert.equal(first.name, "Alex");

  /** API prefix for the first staff member's schedule operations. */
  const base = `/api/staff/${first.id}`;
  await request(app)
    .put(`${base}/weekly/1`)
    .send({ windows: [{ start: 540, end: 600 }] })
    .expect(200);
  await request(app)
    .put(`${base}/overrides/2026-09-28`)
    .send({ mode: "add", windows: [{ start: 525, end: 555 }] })
    .expect(200);

  /** Single-Monday availability query used to compare saved and restarted behavior. */
  const query = { start: "2026-09-28", end: "2026-09-28", duration: 30 };

  /** Availability response after combining recurring and additive hours. */
  const result = (
    await request(app).post(`${base}/availability`).send(query).expect(200)
  ).body;
  assert.deepEqual(
    result[0].slots.map(
      /** Extracts slot starts for comparison with the expected additive anchoring. */ (slot: {
        start: number;
      }) => slot.start,
    ),
    [525, 555],
  );

  /** Second staff member's results, which must not inherit the first member's hours. */
  const other = (
    await request(app)
      .post(`/api/staff/${second.id}/availability`)
      .send(query)
      .expect(200)
  ).body;
  assert.deepEqual(other[0].slots, []);

  /** Fresh app and store loading the same file to verify restart persistence. */
  const restarted = createApp(new Store(file));
  assert.deepEqual(
    (
      await request(restarted)
        .post(`${base}/availability`)
        .send(query)
        .expect(200)
    ).body,
    result,
  );
  assert.equal(
    (await request(restarted).get("/api/staff").expect(200)).body.length,
    2,
  );
  await request(restarted).delete(`${base}/overrides/2026-09-28`).expect(200);
  assert.deepEqual(
    (
      await request(restarted)
        .post(`${base}/availability`)
        .send(query)
        .expect(200)
    ).body[0].slots.map(
      /** Extracts slot starts after removing the exception. */ (s: {
        start: number;
      }) => s.start,
    ),
    [540, 570],
  );
  await request(restarted)
    .put(`${base}/weekly/1`)
    .send({ windows: [{ start: 600, end: 660 }] })
    .expect(200);
  assert.deepEqual(
    (
      await request(restarted)
        .post(`${base}/availability`)
        .send(query)
        .expect(200)
    ).body[0].slots.map(
      /** Extracts slot starts after changing recurring hours. */ (s: {
        start: number;
      }) => s.start,
    ),
    [600, 630],
  );
});

test("failed validation never replaces saved weekly hours or overrides", /** Verifies invalid weekly and override submissions leave the saved file unchanged. */ async (t) => {
  /** Isolated app and data file used to inspect write preservation. */
  const { app, file } = setup(t);

  /** Stable ID for the staff member whose existing schedule must survive invalid input. */
  const { id } = (await request(app).post("/api/staff").send({ name: "Sam" }))
    .body;

  /** Staff-specific API prefix for the validation-preservation scenario. */
  const base = `/api/staff/${id}`;
  await request(app)
    .put(`${base}/weekly/1`)
    .send({ windows: [{ start: 540, end: 600 }] })
    .expect(200);
  await request(app)
    .put(`${base}/overrides/2026-09-28`)
    .send({ mode: "unavailable", windows: [] })
    .expect(200);

  /** Exact saved file contents before submitting invalid replacement data. */
  const saved = readFileSync(file, "utf8");
  await request(app)
    .put(`${base}/weekly/1`)
    .send({ windows: [{ start: 600, end: 540 }] })
    .expect(400);
  await request(app)
    .put(`${base}/overrides/2026-09-28`)
    .send({ mode: "add", windows: [] })
    .expect(400);
  assert.equal(readFileSync(file, "utf8"), saved);
});

test("API rejects malformed parameters, missing fields and unknown staff", /** Checks HTTP error contracts for malformed fields, invalid routes, dates, and unknown staff. */ async (t) => {
  /** Isolated HTTP app used to exercise request validation. */
  const { app } = setup(t);
  await request(app).post("/api/staff").send({ name: "  " }).expect(400);
  await request(app).post("/api/staff").send({ name: 1 }).expect(400);

  /** Existing staff ID that lets these requests reach schedule-specific validation. */
  const { id } = (await request(app).post("/api/staff").send({ name: "Sam" }))
    .body;

  /** API prefix targeting the validation test's staff member. */
  const base = `/api/staff/${id}`;
  await request(app).put(`${base}/weekly/7`).send({ windows: [] }).expect(400);
  await request(app).put(`${base}/weekly/01`).send({ windows: [] }).expect(400);
  await request(app).put(`${base}/weekly/1`).send({}).expect(400);
  await request(app)
    .put(`${base}/overrides/2026-02-30`)
    .send({ mode: "unavailable", windows: [] })
    .expect(400);
  await request(app).delete(`${base}/overrides/not-a-date`).expect(400);
  await request(app)
    .post(`${base}/availability`)
    .send({ start: "2026-09-28", end: "2026-09-28", duration: "30" })
    .expect(400);
  await request(app).post(`${base}/availability`).send({}).expect(400);
  await request(app).get("/api/staff/missing/schedule").expect(404);
  await request(app)
    .post("/api/staff")
    .set("Content-Type", "application/json")
    .send("{broken")
    .expect(400);
});

test("disk write failure leaves previously committed in-memory state intact", /** Verifies a failed filesystem replacement does not publish uncommitted memory changes. */ (t) => {
  /** Temporary data-file path used to induce a controlled replacement failure. */
  const { file } = setup(t);

  /** Repository instance whose committed state must survive the simulated disk failure. */
  const store = new Store(file);

  /** Persisted staff identity used to inspect state after a failed update. */
  const staff = store.create("Sam");
  rmSync(file);
  mkdirSync(file);
  assert.throws(
    /** Attempts a write against the deliberately invalid destination and must throw. */ () =>
      store.update(
        staff.id,
        /** Mutates only the working copy so a failed commit must leave the saved weekday empty. */ (
          record,
        ) => {
          record.weekly[1] = [{ start: 540, end: 600 }];
        },
      ),
  );
  assert.deepEqual(store.get(staff.id)!.weekly[1], []);
});

test("PDF example: Jane Smith has weekly, unavailable, replacement, and added hours across May 25-29", /** Verifies the specification's date-range example through the complete HTTP workflow. */ async (t) => {
  /** Isolated API app ensures specification checks do not modify personal schedules. */
  const { app } = setup(t);

  /** Newly persisted staff identity used throughout the specification example. */
  const { id } = (
    await request(app)
      .post("/api/staff")
      .send({ name: "Jane Smith" })
      .expect(201)
  ).body;

  /** Staff-scoped routes for the example schedule. */
  const base = `/api/staff/${id}`;
  await request(app)
    .put(`${base}/weekly/1`)
    .send({
      windows: [
        { start: 540, end: 600 },
        { start: 600, end: 660 },
      ],
    })
    .expect(200);
  await request(app)
    .put(`${base}/weekly/3`)
    .send({ windows: [{ start: 540, end: 1020 }] })
    .expect(200);
  await request(app)
    .put(`${base}/weekly/4`)
    .send({ windows: [{ start: 540, end: 1020 }] })
    .expect(200);
  await request(app)
    .put(`${base}/weekly/5`)
    .send({ windows: [{ start: 540, end: 600 }] })
    .expect(200);
  await request(app)
    .put(`${base}/overrides/2026-05-27`)
    .send({ mode: "unavailable", windows: [] })
    .expect(200);
  await request(app)
    .put(`${base}/overrides/2026-05-28`)
    .send({ mode: "replace", windows: [{ start: 600, end: 840 }] })
    .expect(200);
  await request(app)
    .put(`${base}/overrides/2026-05-29`)
    .send({ mode: "add", windows: [{ start: 1020, end: 1140 }] })
    .expect(200);

  /** Five chronological results representing each availability source in the PDF. */
  const days = (
    await request(app)
      .post(`${base}/availability`)
      .send({ start: "2026-05-25", end: "2026-05-29", duration: 30 })
      .expect(200)
  ).body;
  assert.equal(days.length, 5);
  assert.deepEqual(days[0].slots, [
    { start: 540, end: 570 },
    { start: 570, end: 600 },
    { start: 600, end: 630 },
    { start: 630, end: 660 },
  ]);
  assert.equal(days[0].source, "weekly");
  assert.equal(days[1].source, "none");
  assert.deepEqual(days[1].slots, []);
  assert.match(days[1].reason, /No recurring availability/);
  assert.equal(days[2].source, "override");
  assert.deepEqual(days[2].slots, []);
  assert.match(days[2].reason, /date override/);
  assert.equal(days[3].mode, "replace");
  assert.deepEqual(days[3].windows, [{ start: 600, end: 840 }]);
  assert.equal(days[3].slots.length, 8);
  assert.equal(days[4].source, "combined");
  assert.deepEqual(days[4].windows, [
    { start: 540, end: 600 },
    { start: 1020, end: 1140 },
  ]);
  assert.equal(days[4].slots.length, 6);
});
