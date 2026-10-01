import assert from "node:assert/strict";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { Store } from "../server/store.js";
import { ReportStore } from "../server/reports/store.js";
import type { ReportJob } from "../server/reports/contracts.js";
function setup(t: TestContext) {
  const directory = mkdtempSync(join(tmpdir(), "report-storage-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return { directory, path: join(directory, "data.json") };
}
const now = () => new Date("2026-09-30T12:00:00.000Z");
const legacy = {
  version: 1,
  staff: [
    {
      id: "staff",
      name: "Staff",
      weekly: [[], [], [], [], [], [], []],
      overrides: [],
      appointments: [
        {
          id: "booking",
          title: "Booked",
          date: "2026-09-30",
          start: 600,
          end: 630,
        },
      ],
    },
  ],
};

test("migration preserves schedules and exact backup, establishes baseline once, and recovers a restored backup", (t) => {
  const { path } = setup(t);
  const text = JSON.stringify(legacy);
  writeFileSync(path, text);
  const store = new Store(path, now);
  assert.deepEqual(store.get("staff"), legacy.staff[0]);
  assert.deepEqual(store.reportingSnapshot(), {
    reportingStartedAt: now().toISOString(),
    changes: [],
  });
  assert.equal(readFileSync(`${path}.v1.bak`, "utf8"), text);
  const migrated = readFileSync(path, "utf8");
  new Store(path, () => new Date("2027-01-01T00:00:00.000Z"));
  assert.equal(readFileSync(path, "utf8"), migrated);
  copyFileSync(`${path}.v1.bak`, path);
  assert.deepEqual(new Store(path, now).get("staff"), legacy.staff[0]);
});

test("failed migration backup and corrupt versions leave source unchanged", (t) => {
  const { path } = setup(t);
  const text = JSON.stringify(legacy);
  writeFileSync(path, text);
  writeFileSync(`${path}.v1.bak`, "different");
  assert.throws(() => new Store(path, now), /backup differs/);
  assert.equal(readFileSync(path, "utf8"), text);
  for (const value of [
    { version: 7, staff: [] },
    {
      version: 2,
      staff: [],
      reportingStartedAt: now().toISOString(),
      nextChangeSequence: 2,
      changes: [],
    },
  ]) {
    const invalid = JSON.stringify(value);
    writeFileSync(path, invalid);
    assert.throws(() => new Store(path, now));
    assert.equal(readFileSync(path, "utf8"), invalid);
  }
});

function job(): ReportJob {
  return {
    id: "report",
    cutoff: "2026-09-30T14:00:00.000Z",
    model: {
      id: "report",
      interval: { start: now().toISOString(), end: "2026-09-30T14:00:00.000Z" },
      timezone: "America/Chicago",
      generatedAt: "2026-09-30T14:00:00.000Z",
      changes: [],
    },
    recipients: [
      {
        accountId: "a",
        email: "a@example.com",
        status: "pending",
        attempts: 0,
      },
      {
        accountId: "b",
        email: "b@example.com",
        status: "pending",
        attempts: 0,
      },
    ],
  };
}

test("report updates merge recipients, persist across restart and reuse frozen cutoff", (t) => {
  const { path } = setup(t);
  const store = new ReportStore(path);
  store.create(job());
  store.updateRecipient("report", "a", (recipient) => {
    recipient.status = "sent";
    recipient.attempts = 1;
  });
  store.updateRecipient("report", "b", (recipient) => {
    recipient.status = "failed";
    recipient.attempts = 1;
  });
  const saved = new ReportStore(path).get("report")!;
  assert.deepEqual(
    saved.recipients.map((recipient) => recipient.status),
    ["sent", "failed"],
  );
  const duplicate = job();
  duplicate.model.generatedAt = "2026-09-30T15:00:00.000Z";
  assert.deepEqual(store.create(duplicate), saved);
  saved.model.changes.length = 0;
  saved.recipients[0].status = "pending";
  assert.equal(store.get("report")!.recipients[0].status, "sent");
  assert.throws(() =>
    store.updateRecipient("report", "a", (recipient) => {
      recipient.email = "changed@example.com";
    }),
  );
});

test("failed report writes preserve memory and remove temporary files", (t) => {
  const { path, directory } = setup(t);
  const store = new ReportStore(path);
  store.create(job());
  rmSync(path);
  mkdirSync(path);
  assert.throws(() =>
    store.updateRecipient("report", "a", (recipient) => {
      recipient.status = "sent";
    }),
  );
  assert.equal(store.get("report")!.recipients[0].status, "pending");
  assert.deepEqual(readdirSync(directory), ["data.json"]);
});

test("report store rejects unknown versions and malformed jobs", (t) => {
  const { path } = setup(t);
  for (const value of [
    { version: 2, jobs: [] },
    { version: 1, jobs: [{ ...job(), cutoff: "2027-01-01T00:00:00.000Z" }] },
  ]) {
    writeFileSync(path, JSON.stringify(value));
    assert.throws(() => new ReportStore(path));
  }
});
