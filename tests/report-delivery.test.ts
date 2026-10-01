import assert from "node:assert/strict";
import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import {
  ReportDelivery,
  retryExhaustedReports,
} from "../server/reports/delivery.js";
import {
  CaptureMailer,
  FileCaptureMailer,
  type ReportMail,
  type ReportMailer,
} from "../server/reports/mail.js";
import { ReportStore } from "../server/reports/store.js";
import { buildReportModel } from "../server/reports/selection.js";
import { testAccounts } from "./support/auth.js";

function setup(t: TestContext) {
  const directory = mkdtempSync(join(tmpdir(), "report-delivery-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const path = join(directory, "reports.json");
  const reports = new ReportStore(path);
  const managers = [
    testAccounts().list()[0],
    {
      ...testAccounts().list()[0],
      id: "second",
      username: "second",
      email: "second@example.com",
    },
  ];
  const accounts = {
    list: () => structuredClone(managers),
    get: (id: string) =>
      structuredClone(managers.find((account) => account.id === id)),
    findByUsername: () => undefined,
  };
  let now = Date.parse("2026-09-30T14:00:00.000Z");
  const clock = () => new Date(now);
  const advance = (ms: number) => {
    now += ms;
  };
  const model = buildReportModel({
    id: "report-1",
    interval: { start: "2026-09-29T14:00:00.000Z", end: clock().toISOString() },
    generatedAt: clock().toISOString(),
    changes: [],
  });
  const renderer = { render: async () => Buffer.from("%PDF-test") };
  return {
    directory,
    path,
    reports,
    accounts,
    managers,
    clock,
    advance,
    model,
    renderer,
  };
}

test("partial failure retries only failed recipient using frozen email and stable message identity", async (t) => {
  const state = setup(t);
  const capture = new CaptureMailer();
  let fail = true;
  const attempted: ReportMail[] = [];
  const mailer: ReportMailer = {
    async send(message) {
      attempted.push(message);
      assert.equal(
        new ReportStore(state.path)
          .get(state.model.id)!
          .recipients.find((r) => r.email === message.to)!.status,
        "sending",
      );
      if (message.to === "second@example.com" && fail)
        throw new Error("smtp password=secret@example.com");
      return capture.send(message);
    },
  };
  const service = new ReportDelivery(
    state.reports,
    state.accounts,
    state.renderer,
    mailer,
    state.clock,
  );
  service.createJob(state.model);
  await service.runDue();
  assert.deepEqual(
    state.reports.get("report-1")!.recipients.map((r) => r.status),
    ["sent", "failed"],
  );
  assert.equal(
    state.reports.get("report-1")!.recipients[1].error,
    "Report rendering or delivery failed",
  );
  state.managers[1].email = "changed@example.com";
  state.advance(59_999);
  await service.runDue();
  assert.equal(attempted.length, 2);
  state.advance(1);
  fail = false;
  await service.runDue();
  assert.equal(attempted.length, 3);
  assert.equal(attempted[2].to, "second@example.com");
  assert.equal(attempted[1].messageId, attempted[2].messageId);
  assert.equal(attempted[0].subject, "Daily schedule changes - 2026-09-30");
  assert.equal(
    attempted[0].attachment.filename,
    "schedule-changes-2026-09-30.pdf",
  );
  assert.equal(attempted[0].attachment.contentType, "application/pdf");
  assert.equal(capture.messages.length, 2);
  await service.runDue();
  assert.equal(capture.messages.length, 2);
});

test("retry deadlines survive restart, exhaust after 1/5/15 minutes, and admin retry only resets exhausted failures", async (t) => {
  const state = setup(t);
  let sends = 0;
  const mailer = {
    send: async () => {
      sends++;
      throw new Error("failed");
    },
  };
  let service = new ReportDelivery(
    state.reports,
    state.accounts,
    state.renderer,
    mailer,
    state.clock,
  );
  service.createJob(state.model);
  await service.runDue();
  for (const minutes of [1, 5, 15]) {
    state.advance(minutes * 60_000 - 1);
    const reports = new ReportStore(state.path);
    service = new ReportDelivery(
      reports,
      state.accounts,
      state.renderer,
      mailer,
      state.clock,
    );
    service.recoverInterrupted();
    await service.runDue();
    const before = sends;
    state.advance(1);
    await service.runDue();
    assert.equal(sends, before + 2);
  }
  const reports = new ReportStore(state.path);
  assert.ok(
    reports
      .get("report-1")!
      .recipients.every(
        (r) => r.attempts === 4 && !r.nextAttemptAt && r.status === "failed",
      ),
  );
  reports.updateRecipient("report-1", "second", (r) => {
    r.status = "sent";
  });
  assert.equal(retryExhaustedReports(reports, state.clock()), 1);
  assert.equal(reports.get("report-1")!.recipients[0].attempts, 4);
  assert.equal(reports.get("report-1")!.recipients[0].retryBase, 4);
  assert.equal(reports.get("report-1")!.recipients[1].status, "sent");
  const capture = new CaptureMailer();
  await new ReportDelivery(
    reports,
    state.accounts,
    state.renderer,
    capture,
    state.clock,
  ).runDue();
  assert.equal(capture.messages.length, 1);
  assert.equal(reports.get("report-1")!.recipients[0].attempts, 5);
});

test("startup recovers ambiguous sending attempts while successful recipients remain untouched", async (t) => {
  const state = setup(t);
  const capture = new CaptureMailer();
  const service = new ReportDelivery(
    state.reports,
    state.accounts,
    state.renderer,
    capture,
    state.clock,
  );
  service.createJob(state.model);
  state.reports.updateRecipient("report-1", "test-manager", (r) => {
    r.status = "sent";
    r.attempts = 1;
  });
  state.reports.updateRecipient("report-1", "second", (r) => {
    r.status = "sending";
    r.attempts = 1;
    r.attemptedAt = state.clock().toISOString();
  });
  const restarted = new ReportDelivery(
    new ReportStore(state.path),
    state.accounts,
    state.renderer,
    capture,
    state.clock,
  );
  restarted.recoverInterrupted();
  await restarted.runDue();
  assert.equal(capture.messages.length, 0);
  state.advance(60_000);
  await restarted.runDue();
  assert.equal(capture.messages.length, 1);
  assert.equal(capture.messages[0].to, "second@example.com");
});

test("jobs persist without managers and recipient eligibility is rechecked after rendering", async (t) => {
  const state = setup(t);
  const capture = new CaptureMailer();
  const renderer = {
    render: async () => {
      state.managers.forEach((m) => {
        m.active = false;
      });
      return Buffer.from("%PDF");
    },
  };
  const service = new ReportDelivery(
    state.reports,
    state.accounts,
    renderer,
    capture,
    state.clock,
  );
  service.createJob(state.model);
  await service.runDue();
  assert.equal(capture.messages.length, 0);
  const empty = service.createJob({
    ...state.model,
    id: "empty",
    interval: {
      start: state.model.interval.end,
      end: "2026-10-01T14:00:00.000Z",
    },
  });
  assert.equal(empty.recipients.length, 0);
  assert.ok(new ReportStore(state.path).get("empty"));
});

test("overlapping delivery callbacks cannot duplicate active sends", async (t) => {
  const state = setup(t);
  const capture = new CaptureMailer();
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const renderer = {
    render: async () => {
      await gate;
      return Buffer.from("%PDF");
    },
  };
  const service = new ReportDelivery(
    state.reports,
    state.accounts,
    renderer,
    capture,
    state.clock,
  );
  service.createJob(state.model);
  const first = service.runDue();
  await service.runDue();
  release();
  await first;
  await service.drain();
  assert.equal(capture.messages.length, 2);
});

test("default mail adapter writes private PDF and metadata captures, never duplicate message IDs", async (t) => {
  const state = setup(t);
  const directory = join(state.directory, "mail");
  const capture = new FileCaptureMailer(directory);
  const message: ReportMail = {
    reportId: "r",
    messageId: "<stable@local>",
    to: "manager@example.com",
    subject: "Daily report",
    text: "No changes",
    attachment: {
      filename: "report.pdf",
      contentType: "application/pdf",
      content: Buffer.from("%PDF-test"),
    },
  };
  const first = await capture.send(message);
  assert.deepEqual(await capture.send(message), first);
  const folders = readdirSync(directory);
  assert.equal(folders.length, 1);
  const folder = join(directory, folders[0]);
  assert.equal(
    readFileSync(join(folder, "attachment.pdf"), "utf8"),
    "%PDF-test",
  );
  const metadata = JSON.parse(
    readFileSync(join(folder, "message.json"), "utf8"),
  );
  assert.equal(metadata.to, message.to);
  assert.equal(metadata.attachment.content, undefined);
  assert.equal(metadata.attachment.contentType, "application/pdf");
  assert.equal(statSync(join(folder, "message.json")).mode & 0o777, 0o600);
});
