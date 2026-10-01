import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import { ReportDelivery } from "../server/reports/delivery.js";
import { CaptureMailer } from "../server/reports/mail.js";
import {
  ReportingService,
  nextDailyCutoff,
} from "../server/reports/service.js";
import { ReportStore } from "../server/reports/store.js";
import type { ReportScheduler } from "../server/reports/scheduler.js";
import type { ScheduleChange } from "../shared/contracts/change-events.js";
import { testAccounts } from "./support/auth.js";
class FakeScheduler implements ReportScheduler {
  tasks: {
    expression: string;
    timezone: string;
    callback: () => void;
    active: boolean;
  }[] = [];
  schedule(expression: string, timezone: string, callback: () => void) {
    const task = { expression, timezone, callback, active: true };
    this.tasks.push(task);
    return () => {
      task.active = false;
    };
  }
  fire() {
    this.tasks.filter((task) => task.active).forEach((task) => task.callback());
  }
}
function setup(
  t: TestContext,
  baseline = "2026-09-28T14:00:00.000Z",
  current = "2026-09-30T14:00:00.000Z",
) {
  const directory = mkdtempSync(join(tmpdir(), "report-service-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const path = join(directory, "reports.json");
  const reports = new ReportStore(path);
  let now = current;
  const clock = () => new Date(now);
  const advance = (instant: string) => {
    now = instant;
  };
  const scheduler = new FakeScheduler();
  const mailer = new CaptureMailer();
  const changes: ScheduleChange[] = [
    {
      id: "e1",
      sequence: 1,
      occurredAt: "2026-09-29T14:00:00.000Z",
      actor: { id: "a", name: "Actor" },
      staff: { id: "s", name: "Staff" },
      entityType: "weekly",
      weekday: 1,
      operation: "created",
      before: [],
      after: [{ start: 540, end: 600 }],
    },
  ];
  const history = {
    reportingSnapshot: () => ({ reportingStartedAt: baseline, changes }),
  };
  const renderer = { render: async () => Buffer.from("%PDF-test") };
  const accounts = testAccounts();
  const delivery = new ReportDelivery(
    reports,
    accounts,
    renderer,
    mailer,
    clock,
  );
  const service = new ReportingService(
    history,
    reports,
    delivery,
    scheduler,
    clock,
  );
  return {
    path,
    reports,
    clock,
    advance,
    scheduler,
    mailer,
    changes,
    history,
    renderer,
    accounts,
    delivery,
    service,
  };
}

test("startup catches up all local cutoffs chronologically, exact-boundary edits belong once, repeated callbacks reuse jobs", async (t) => {
  const state = setup(t);
  state.service.start();
  await state.delivery.drain();
  const jobs = state.reports.list();
  assert.deepEqual(
    jobs.map((job) => job.cutoff),
    ["2026-09-29T14:00:00.000Z", "2026-09-30T14:00:00.000Z"],
  );
  assert.deepEqual(
    jobs.map((job) => job.model.changes.length),
    [0, 1],
  );
  assert.equal(
    jobs[0].model.interval.start,
    state.history.reportingSnapshot().reportingStartedAt,
  );
  state.scheduler.fire();
  state.scheduler.fire();
  await state.delivery.drain();
  assert.equal(state.reports.list().length, 2);
  assert.equal(state.mailer.messages.length, 2);
  assert.deepEqual(
    state.scheduler.tasks.map((task) => [task.expression, task.timezone]),
    [
      ["0 9 * * *", "America/Chicago"],
      ["* * * * *", "America/Chicago"],
    ],
  );
  await state.service.stop();
  const reports = new ReportStore(state.path);
  const delivery = new ReportDelivery(
    reports,
    state.accounts,
    state.renderer,
    state.mailer,
    state.clock,
  );
  const restarted = new ReportingService(
    state.history,
    reports,
    delivery,
    new FakeScheduler(),
    state.clock,
  );
  restarted.start();
  await delivery.drain();
  assert.equal(state.mailer.messages.length, 2);
  await restarted.stop();
});

test("next cutoff uses Chicago calendar days and runs after, never at, the migration baseline", () => {
  assert.equal(
    nextDailyCutoff("2026-03-07T15:00:00.000Z"),
    "2026-03-08T14:00:00.000Z",
  );
  assert.equal(
    nextDailyCutoff("2026-10-31T14:00:00.000Z"),
    "2026-11-01T15:00:00.000Z",
  );
  assert.equal(
    nextDailyCutoff("2026-09-30T13:59:59.000Z"),
    "2026-09-30T14:00:00.000Z",
  );
  assert.equal(
    nextDailyCutoff("2026-09-30T14:00:00.000Z"),
    "2026-10-01T14:00:00.000Z",
  );
});

test("unfinished sends cannot block next day's durable job and shutdown is bounded", async (t) => {
  const state = setup(t, "2026-09-29T14:00:00.000Z");
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const renderer = {
    render: async () => {
      await gate;
      return Buffer.from("%PDF-test");
    },
  };
  const delivery = new ReportDelivery(
    state.reports,
    state.accounts,
    renderer,
    state.mailer,
    state.clock,
  );
  const service = new ReportingService(
    state.history,
    state.reports,
    delivery,
    state.scheduler,
    state.clock,
  );
  service.start();
  state.advance("2026-10-01T14:00:00.000Z");
  state.scheduler.fire();
  assert.equal(state.reports.list().length, 2);
  assert.equal(await service.stop(5), false);
  assert.ok(state.scheduler.tasks.every((task) => !task.active));
  state.advance("2026-10-02T14:00:00.000Z");
  state.scheduler.fire();
  service.tick();
  assert.equal(state.reports.list().length, 2);
  release();
  await delivery.drain();
  assert.equal(state.mailer.messages.length, 2);
  assert.equal(await service.stop(), true);
});

test("saved retry deadlines drive minute callbacks independently of new daily jobs", async (t) => {
  const state = setup(t, "2026-09-29T14:00:00.000Z");
  let fail = true;
  const mailer = {
    send: async (message: Parameters<CaptureMailer["send"]>[0]) => {
      if (fail) throw new Error("mock failure");
      return state.mailer.send(message);
    },
  };
  const delivery = new ReportDelivery(
    state.reports,
    state.accounts,
    state.renderer,
    mailer,
    state.clock,
  );
  const service = new ReportingService(
    state.history,
    state.reports,
    delivery,
    state.scheduler,
    state.clock,
  );
  service.start();
  await delivery.drain();
  state.advance("2026-09-30T14:00:59.000Z");
  state.scheduler.fire();
  await delivery.drain();
  assert.equal(state.reports.list()[0].recipients[0].attempts, 1);
  fail = false;
  state.advance("2026-09-30T14:01:00.000Z");
  state.scheduler.fire();
  await delivery.drain();
  assert.equal(state.reports.list()[0].recipients[0].attempts, 2);
  assert.equal(state.mailer.messages.length, 1);
  await service.stop();
});

test("empty-manager jobs are durable, logged, and still advance the reporting interval", async (t) => {
  const state = setup(t);
  const accounts = {
    list: () => [],
    get: () => undefined,
    findByUsername: () => undefined,
  };
  const logs: string[] = [];
  const delivery = new ReportDelivery(
    state.reports,
    accounts,
    state.renderer,
    state.mailer,
    state.clock,
  );
  const service = new ReportingService(
    state.history,
    state.reports,
    delivery,
    state.scheduler,
    state.clock,
    undefined,
    (message) => logs.push(message),
  );
  service.start();
  await delivery.drain();
  assert.equal(state.reports.list().length, 2);
  assert.ok(state.reports.list().every((job) => job.recipients.length === 0));
  assert.equal(logs.length, 2);
  assert.equal(state.mailer.messages.length, 0);
  await service.stop();
});
