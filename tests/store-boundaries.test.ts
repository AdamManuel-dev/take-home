import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { Store } from "../server/store.js";

/** Provides a repository in an isolated directory cleaned up after the regression test. */
function setup(t: TestContext) {
  /** Test-specific directory containing both saved and temporary data files. */
  const directory = mkdtempSync(join(tmpdir(), "store-boundaries-"));
  t.after(
    /** Removes only files created by this test. */ () =>
      rmSync(directory, { recursive: true, force: true }),
  );

  /** Persistent destination whose replacement failure can be simulated safely. */
  const file = join(directory, "schedules.json");

  return { directory, file, store: new Store(file) };
}

test("mutation results cannot alter committed schedules or leak into later saves", /** Mutates every returned collection and verifies both memory and restarted storage stay intact. */ (t) => {
  /** Isolated repository and saved-file location for the defensive-copy regression. */
  const { store, file } = setup(t);

  /** Stable identity whose returned schedule will be deliberately modified. */
  const staff = store.create("Taylor");

  /** Detached schedule returned to a caller after a successful transaction. */
  const returned = store.update(
    staff.id,
    /** Seeds a valid weekly interval. */ (record) => {
      record.weekly[1] = [{ start: 540, end: 600 }];
    },
    { id: "test-actor", name: "Test actor" },
  );
  returned.weekly[1][0].start = 0;
  returned.overrides.push({
    date: "2026-09-28",
    mode: "unavailable",
    windows: [],
  });
  returned.appointments!.push({
    id: "injected",
    title: "Not saved",
    date: "2026-09-28",
    start: 540,
    end: 570,
  });
  assert.deepEqual(store.get(staff.id)!.weekly[1], [{ start: 540, end: 600 }]);
  assert.deepEqual(store.get(staff.id)!.overrides, []);
  assert.deepEqual(store.get(staff.id)!.appointments, []);
  store.create("Morgan");
  assert.deepEqual(new Store(file).get(staff.id), store.get(staff.id));
});

test("failed replacement cleans up its temporary file and preserves committed memory", /** Forces rename failure by replacing the destination with a directory. */ (t) => {
  /** Repository and directory used to inspect failed-write leftovers. */
  const { directory, file, store } = setup(t);

  /** Saved identity whose hours must remain unchanged when persistence fails. */
  const staff = store.create("Taylor");
  rmSync(file);
  mkdirSync(file);
  assert.throws(
    /** Attempts a write to an invalid destination. */ () =>
      store.update(
        staff.id,
        /** Changes only the uncommitted working copy. */ (record) => {
          record.weekly[1] = [{ start: 540, end: 600 }];
        },
        { id: "test-actor", name: "Test actor" },
      ),
  );
  assert.deepEqual(readdirSync(directory), ["schedules.json"]);
  assert.deepEqual(store.get(staff.id)!.weekly[1], []);
});

test("startup rejects malformed nested records without rewriting the saved file", /** Exercises validation through the real filesystem repository boundary. */ (t) => {
  /** Isolated file used to represent externally damaged but syntactically valid JSON. */
  const { file } = setup(t);

  /** Invalid weekly shape that must stop startup rather than enter live application state. */
  const damaged = JSON.stringify({
    version: 1,
    staff: [{ id: "staff-1", name: "Taylor", weekly: [], overrides: [] }],
  });
  writeFileSync(file, damaged);
  assert.throws(
    /** Loads the malformed persisted document through the production constructor. */ () =>
      new Store(file),
    /Invalid schedule data file:.*seven weekday/,
  );
  assert.equal(readFileSync(file, "utf8"), damaged);
});
