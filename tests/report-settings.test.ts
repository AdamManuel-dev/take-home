import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import request from "supertest";
import { localCutoff, nextLocalCutoff } from "../server/reports/cutoffs.js";
import { ReportStore } from "../server/reports/store.js";
import { ReportDelivery } from "../server/reports/delivery.js";
import { ReportingService } from "../server/reports/service.js";
import { CaptureMailer } from "../server/reports/mail.js";
import { Store } from "../server/store.js";
import { createApp } from "../server/app.js";
import { AuthService, SESSION_COOKIE } from "../server/auth/service.js";
import { testAccounts } from "./support/auth.js";
import type { ReportScheduler } from "../server/reports/scheduler.js";
class Scheduler implements ReportScheduler {
  tasks: { callback: () => void; active: boolean; expression: string }[] = [];
  schedule(expression: string, _zone: string, callback: () => void) {
    const task = { callback, active: true, expression };
    this.tasks.push(task);
    return () => {
      task.active = false;
    };
  }
  fire() {
    this.tasks.filter((task) => task.active).forEach((task) => task.callback());
  }
}
function setup(t: TestContext) {
  const directory = mkdtempSync(join(tmpdir(), "report-settings-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  let instant = "2026-09-29T14:00:00.000Z";
  const clock = () => new Date(instant);
  const advance = (value: string) => {
    instant = value;
  };
  const store = new Store(join(directory, "schedules.json"), clock);
  instant = "2026-09-30T12:00:00.000Z";
  const path = join(directory, "reports.json"),
    reports = new ReportStore(path),
    accounts = testAccounts(),
    mailer = new CaptureMailer(),
    scheduler = new Scheduler();
  const renderer = { render: async () => Buffer.from("%PDF-test") };
  const delivery = new ReportDelivery(
    reports,
    accounts,
    renderer,
    mailer,
    clock,
  );
  const service = new ReportingService(
    store,
    reports,
    delivery,
    scheduler,
    clock,
  );
  return {
    store,
    path,
    reports,
    accounts,
    mailer,
    scheduler,
    renderer,
    delivery,
    service,
    clock,
    advance,
  };
}

test("explicit Chicago DST policy chooses first fold occurrence and first valid minute after a gap", () => {
  assert.equal(localCutoff("2026-03-08", "02:30"), "2026-03-08T08:00:00.000Z");
  assert.equal(localCutoff("2026-11-01", "01:30"), "2026-11-01T06:30:00.000Z");
  assert.equal(
    nextLocalCutoff("2026-11-01T06:45:00.000Z", "01:30"),
    "2026-11-02T07:30:00.000Z",
  );
  assert.equal(
    nextLocalCutoff("2026-09-30T14:00:00.000Z", "09:00"),
    "2026-10-01T14:00:00.000Z",
  );
});

test("time changes cancel old callbacks, never send at save, and keep contiguous intervals in either direction", async (t) => {
  const state = setup(t);
  state.service.start();
  const staff = state.store.create("Tracked staff");
  const actor = { id: "actor", name: "Actor" };
  state.store.update(
    staff.id,
    (record) => {
      record.weekly[1] = [{ start: 540, end: 600 }];
    },
    actor,
  );
  const obsolete = state.scheduler.tasks[0].callback;
  state.service.updateSettings("10:00");
  assert.equal(state.reports.list().length, 0);
  assert.equal(
    state.reports.getSettings()!.nextCutoff,
    "2026-09-30T15:00:00.000Z",
  );
  assert.equal(state.scheduler.tasks.filter((task) => task.active).length, 2);
  state.advance("2026-09-30T14:00:00.000Z");
  obsolete();
  assert.equal(state.reports.list().length, 0);
  state.advance("2026-09-30T14:30:00.000Z");
  state.store.update(
    staff.id,
    (record) => {
      record.weekly[1] = [{ start: 540, end: 660 }];
    },
    actor,
  );
  state.advance("2026-09-30T15:00:00.000Z");
  state.scheduler.fire();
  await state.delivery.drain();
  const first = state.reports.list()[0];
  assert.equal(first.cutoff, "2026-09-30T15:00:00.000Z");
  assert.equal(first.model.changes.length, 2);
  state.service.updateSettings("08:00");
  assert.equal(state.reports.list().length, 1);
  assert.equal(
    state.reports.getSettings()!.nextCutoff,
    "2026-10-01T13:00:00.000Z",
  );
  state.advance("2026-10-01T12:30:00.000Z");
  state.store.update(
    staff.id,
    (record) => {
      record.weekly[1] = [];
    },
    actor,
  );
  state.advance("2026-10-01T13:00:00.000Z");
  state.scheduler.fire();
  await state.delivery.drain();
  const second = state.reports.list()[1];
  assert.equal(second.model.interval.start, first.cutoff);
  assert.equal(second.model.changes.length, 1);
  assert.equal(second.cutoff, "2026-10-01T13:00:00.000Z");
  assert.equal(state.reports.list()[0].recipients[0].attempts, 1);
  assert.equal(state.mailer.messages.length, 2);
  await state.service.stop();
});

test("restart uses the persisted intended cutoff and catches up the configured schedule", async (t) => {
  const state = setup(t);
  state.service.start();
  state.service.updateSettings("08:00");
  const intended = state.reports.getSettings()!.nextCutoff;
  await state.service.stop();
  state.advance("2026-10-02T14:00:00.000Z");
  const reports = new ReportStore(state.path);
  const delivery = new ReportDelivery(
    reports,
    state.accounts,
    state.renderer,
    state.mailer,
    state.clock,
  );
  const service = new ReportingService(
    state.store,
    reports,
    delivery,
    new Scheduler(),
    state.clock,
  );
  service.start();
  await delivery.drain();
  assert.equal(reports.list()[0].cutoff, intended);
  assert.deepEqual(
    reports.list().map((job) => job.cutoff),
    [
      "2026-09-30T13:00:00.000Z",
      "2026-10-01T13:00:00.000Z",
      "2026-10-02T13:00:00.000Z",
    ],
  );
  await service.stop();
});

test("failed settings persistence preserves active revision/time and cancels provisional timers", async (t) => {
  const state = setup(t);
  state.service.start();
  const before = state.reports.getSettings();
  const active = state.scheduler.tasks.filter((task) => task.active);
  rmSync(state.path);
  mkdirSync(state.path);
  assert.throws(() => state.service.updateSettings("10:00"));
  assert.deepEqual(state.reports.getSettings(), before);
  assert.deepEqual(
    state.scheduler.tasks.filter((task) => task.active),
    active,
  );
  await state.service.stop();
});

test("manager settings API validates time/timezone, rejects Users and fails closed when disabled", async (t) => {
  const state = setup(t);
  const staff = state.store.create("User staff");
  const manager = state.accounts.list()[0],
    user = {
      ...manager,
      id: "user",
      username: "user",
      role: "user" as const,
      staffId: staff.id,
    };
  const accounts = {
    ...state.accounts,
    get: (id: string) => (id === "user" ? user : state.accounts.get(id)),
  };
  const auth = new AuthService(accounts);
  const options = { service: auth, allowedOrigins: ["http://localhost"] };
  const app = createApp(state.store, options, state.service);
  function client(id: string, target = app) {
    const session = auth.startSession(id);
    return request.agent(target).set({
      Cookie: `${SESSION_COOKIE}=${session.token}`,
      Origin: "http://localhost",
      "X-CSRF-Token": session.csrfToken,
    });
  }
  await request(app).get("/api/report-settings").expect(401);
  const unprotected = auth.startSession(manager.id);
  await request(app)
    .put("/api/report-settings")
    .set({
      Cookie: `${SESSION_COOKIE}=${unprotected.token}`,
      Origin: "http://localhost",
    })
    .send({ localTime: "08:00" })
    .expect(403);
  await client("user").get("/api/report-settings").expect(403);
  await client("user")
    .put("/api/report-settings")
    .send({ localTime: "08:00" })
    .expect(403);
  assert.deepEqual(
    (await client(manager.id).get("/api/report-settings").expect(200)).body,
    { localTime: "09:00", timezone: "America/Chicago" },
  );
  for (const localTime of ["9:00", "24:00", "10:60", "", null])
    await client(manager.id)
      .put("/api/report-settings")
      .send({ localTime })
      .expect(400);
  await client(manager.id)
    .put("/api/report-settings")
    .send({ localTime: "08:00", timezone: "UTC" })
    .expect(400);
  await client(manager.id)
    .put("/api/report-settings")
    .send({ localTime: "08:00", timezone: "America/Chicago" })
    .expect(200);
  assert.equal(
    JSON.parse(readFileSync(state.path, "utf8")).settings.localTime,
    "08:00",
  );
  await client(manager.id, createApp(state.store, options))
    .get("/api/report-settings")
    .expect(503);
});

test("scheduler preparation failure leaves persisted settings and previous timers active", async (t) => {
  const state = setup(t);
  state.service.start();
  const before = state.reports.getSettings();
  const active = state.scheduler.tasks.filter((task) => task.active);
  const schedule = state.scheduler.schedule.bind(state.scheduler);
  state.scheduler.schedule = (expression, timezone, callback) => {
    if (expression === "* * * * *")
      throw new Error("Cannot prepare minute callback");
    return schedule(expression, timezone, callback);
  };
  assert.throws(() => state.service.updateSettings("10:00"));
  assert.deepEqual(state.reports.getSettings(), before);
  assert.deepEqual(
    state.scheduler.tasks.filter((task) => task.active),
    active,
  );
  await state.service.stop();
});

test("restart repairs a job-committed next-cutoff-write failure without duplicate jobs or delivery", async (t) => {
  const state = setup(t);
  const service = new ReportingService(
    state.store,
    state.reports,
    state.delivery,
    state.scheduler,
    state.clock,
    undefined,
    () => {},
  );
  service.start();
  const persist = state.reports.setSettings.bind(state.reports);
  let fail = true;
  state.reports.setSettings = (settings) => {
    if (fail) {
      fail = false;
      throw new Error("Simulated next cutoff write failure");
    }
    persist(settings);
  };
  state.advance("2026-09-30T14:00:00.000Z");
  state.scheduler.tasks[0].callback();
  assert.equal(state.reports.list().length, 1);
  assert.equal(
    state.reports.getSettings()!.nextCutoff,
    state.reports.list()[0].cutoff,
  );
  await service.stop();
  const reports = new ReportStore(state.path);
  const delivery = new ReportDelivery(
    reports,
    state.accounts,
    state.renderer,
    state.mailer,
    state.clock,
  );
  const restarted = new ReportingService(
    state.store,
    reports,
    delivery,
    new Scheduler(),
    state.clock,
  );
  restarted.start();
  await delivery.drain();
  assert.equal(reports.list().length, 1);
  assert.equal(reports.getSettings()!.nextCutoff, "2026-10-01T14:00:00.000Z");
  assert.equal(state.mailer.messages.length, 1);
  assert.equal(reports.list()[0].recipients[0].attempts, 1);
  await restarted.stop();
});
