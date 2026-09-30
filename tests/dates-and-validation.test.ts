import { DateTime, Settings } from "luxon";
import assert from "node:assert/strict";
import test from "node:test";
import { dateLabel, nextDate, today, weekdayIndex } from "../shared/dates.js";
import { availabilityQuerySchema, staffListSchema } from "../shared/schemas.js";
import { parseInput } from "../shared/validation.js";
import { api } from "../src/shared/lib/api.js";
import { parseWindows } from "../src/shared/lib/windows.js";

test("today and labels use Chicago even when the host is in another timezone", (t) => {
  const originalNow = Settings.now;
  const originalZone = Settings.defaultZone;
  t.after(() => {
    Settings.now = originalNow;
    Settings.defaultZone = originalZone;
  });
  Settings.defaultZone = "Asia/Tokyo";
  const fixedNow = DateTime.fromISO("2026-10-01T02:00:00Z").toMillis();
  Settings.now = () => fixedNow;
  assert.equal(today(), "2026-09-30");
  assert.equal(dateLabel("2026-09-30"), "Wed, Sep 30, 2026");
  assert.equal(weekdayIndex("2026-09-27"), 0);
});

test("calendar days cross both DST changes without skipping or repeating dates", () => {
  assert.equal(nextDate("2026-03-08"), "2026-03-09");
  assert.equal(nextDate("2026-11-01"), "2026-11-02");
  assert.equal(nextDate("2024-02-28"), "2024-02-29");
  assert.equal(nextDate("2026-12-31"), "2027-01-01");
});

test("inclusive 90-day limits remain calendar-based across DST", () => {
  for (const [start, end, tooLate] of [
    ["2026-02-01", "2026-05-01", "2026-05-02"],
    ["2026-09-01", "2026-11-29", "2026-11-30"],
  ]) {
    assert.doesNotThrow(() =>
      parseInput(availabilityQuerySchema, { start, end, duration: 30 }),
    );
    assert.throws(
      () =>
        parseInput(availabilityQuerySchema, {
          start,
          end: tooLate,
          duration: 30,
        }),
      /90/,
    );
  }
});

test("draft parsing allows 24:00 only at the end and rejects loose time formats", () => {
  assert.deepEqual(parseWindows([{ start: "23:00", end: "24:00" }]), [
    { start: 1380, end: 1440 },
  ]);

  for (const start of ["24:00", "9:00", "09:60", "09:00:00", " 09:00"]) {
    assert.throws(() => parseWindows([{ start, end: "24:00" }]));
  }
});

test("draft windows share server ordering and overlap rules", () => {
  assert.throws(
    () => parseWindows([{ start: "10:00", end: "09:00" }]),
    /before/,
  );
  assert.throws(
    () =>
      parseWindows([
        { start: "09:00", end: "10:00" },
        { start: "09:30", end: "10:30" },
      ]),
    /overlap/,
  );
  assert.deepEqual(
    parseWindows([
      { start: "10:00", end: "11:00" },
      { start: "09:00", end: "10:00" },
    ]),
    [
      { start: 600, end: 660 },
      { start: 540, end: 600 },
    ],
  );
});

test("successful HTTP responses must still satisfy the expected data contract", async (t) => {
  t.mock.method(globalThis, "fetch", async () =>
    Response.json([{ id: 42, name: "Taylor" }]),
  );
  await assert.rejects(api("/staff", staffListSchema), /unexpected response/);
});

test("API validation preserves server error messages", async (t) => {
  t.mock.method(globalThis, "fetch", async () =>
    Response.json({ error: "Choose another time." }, { status: 409 }),
  );
  await assert.rejects(api("/staff", staffListSchema), /Choose another time/);
});

test("valid API responses are parsed and retain supported fields", async (t) => {
  t.mock.method(globalThis, "fetch", async () =>
    Response.json([{ id: "staff-1", name: "Taylor" }]),
  );
  assert.deepEqual(await api("/staff", staffListSchema), [
    { id: "staff-1", name: "Taylor" },
  ]);
});
