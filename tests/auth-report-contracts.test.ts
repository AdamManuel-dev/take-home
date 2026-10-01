import assert from "node:assert/strict";
import test from "node:test";
import {
  accountProfileSchema,
  canEditSchedule,
  isManager,
} from "../shared/contracts/auth.js";
import {
  reportModelSchema,
  scheduleChangeSchema,
} from "../server/reports/contracts.js";

const user = {
  id: "u1",
  username: "user",
  displayName: "User",
  role: "user" as const,
  staffId: "s1",
};
const manager = { ...user, role: "manager" as const, staffId: undefined };
const event = {
  id: "e1",
  sequence: 1,
  occurredAt: "2026-09-30T13:00:00.000Z",
  actor: { id: "u1", name: "User" },
  staff: { id: "s1", name: "Staff" },
  entityType: "weekly",
  weekday: 1,
  operation: "created",
  before: [],
  after: [{ start: 540, end: 600 }],
};

test("profiles strip secrets and enforce the user staff link", () => {
  assert.deepEqual(
    accountProfileSchema.parse({
      ...user,
      passwordHash: "secret",
      sessionToken: "secret",
      email: "private@example.com",
    }),
    user,
  );
  assert.equal(
    accountProfileSchema.safeParse({ ...user, staffId: undefined }).success,
    false,
  );
  assert.equal(accountProfileSchema.safeParse(manager).success, true);
});

test("schedule edits require ownership or manager role", () => {
  assert.equal(canEditSchedule(user, "s1"), true);
  assert.equal(canEditSchedule(user, "s2"), false);
  assert.equal(canEditSchedule(manager, "s2"), true);
  assert.equal(isManager(user), false);
  assert.equal(isManager(manager), true);
});

test("events exclude no-ops, incorrect classifications and non-normalized windows", () => {
  assert.equal(scheduleChangeSchema.safeParse(event).success, true);
  assert.equal(
    scheduleChangeSchema.safeParse({ ...event, after: [] }).success,
    false,
  );
  assert.equal(
    scheduleChangeSchema.safeParse({ ...event, operation: "deleted" }).success,
    false,
  );
  assert.equal(
    scheduleChangeSchema.safeParse({
      ...event,
      after: [
        { start: 600, end: 660 },
        { start: 540, end: 600 },
      ],
    }).success,
    false,
  );
  assert.equal(
    scheduleChangeSchema.safeParse({
      ...event,
      entityType: "override",
      date: "2026-09-30",
      before: null,
      after: { mode: "unavailable", windows: [] },
    }).success,
    true,
  );
});

test("frozen reports enforce half-open intervals and retain reverted edits", () => {
  const model = {
    id: "report",
    interval: { start: event.occurredAt, end: "2026-09-30T14:00:00.000Z" },
    timezone: "America/Chicago",
    generatedAt: "2026-09-30T14:00:00.000Z",
    changes: [
      event,
      {
        ...event,
        id: "e2",
        sequence: 2,
        operation: "deleted",
        before: event.after,
        after: [],
      },
    ],
  };
  assert.equal(reportModelSchema.safeParse(model).success, true);
  assert.equal(
    reportModelSchema.safeParse({
      ...model,
      changes: [{ ...event, occurredAt: model.interval.end }],
    }).success,
    false,
  );
  assert.equal(
    reportModelSchema.safeParse({ ...model, changes: [] }).success,
    true,
  );
});
