import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import request from "supertest";
import { createApp } from "../server/app.js";
import { Store } from "../server/store.js";
import { AccountStore } from "../server/auth/accounts.js";
import { AuthService } from "../server/auth/service.js";
import { hashPassword } from "../server/auth/passwords.js";
import { ReportStore } from "../server/reports/store.js";
import { ReportDelivery } from "../server/reports/delivery.js";
import { FileCaptureMailer } from "../server/reports/mail.js";
import { pdfReportRenderer } from "../server/reports/pdf.js";
import { ReportingService } from "../server/reports/service.js";

test("fixed-9am release workflow covers role permissions, real PDF capture, partial failure restart and no-change day", async (t) => {
  const directory = mkdtempSync(join(tmpdir(), "report-release-"));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  let instant = "2026-09-30T13:30:00.000Z";
  const clock = () => new Date(instant);
  const schedulePath = join(directory, "schedules.json"),
    reportPath = join(directory, "reports.json");
  const store = new Store(schedulePath, clock);
  const alice = store.create("Alice"),
    bob = store.create("Bob");
  const accounts = new AccountStore(
    (id) => Boolean(store.get(id)),
    join(directory, "users.json"),
  );
  const password = "release-test-password";
  const passwordHash = await hashPassword(password);
  for (const [username, staff] of [
    ["alice", alice],
    ["bob", bob],
  ] as const)
    accounts.create({
      username,
      displayName: staff.name,
      role: "user",
      staffId: staff.id,
      active: true,
      passwordHash,
    });
  for (const username of ["manager", "second"])
    accounts.create({
      username,
      displayName: username,
      role: "manager",
      email: `${username}@example.com`,
      active: true,
      passwordHash,
    });
  const app = createApp(store, {
    service: new AuthService(accounts),
    allowedOrigins: ["http://localhost"],
  });
  async function login(username: string) {
    const response = await request(app)
      .post("/api/auth/login")
      .set("Origin", "http://localhost")
      .send({ username, password })
      .expect(200);
    return request.agent(app).set({
      Cookie: response.headers["set-cookie"][0].split(";")[0],
      Origin: "http://localhost",
      "X-CSRF-Token": response.body.csrfToken,
    });
  }
  const user = await login("alice"),
    secondUser = await login("bob"),
    manager = await login("manager");
  await user.get(`/api/staff/${bob.id}/schedule`).expect(200);
  await secondUser.get(`/api/staff/${alice.id}/schedule`).expect(200);
  await user
    .put(`/api/staff/${bob.id}/weekly/1`)
    .send({ windows: [] })
    .expect(403);
  await secondUser
    .put(`/api/staff/${alice.id}/weekly/1`)
    .send({ windows: [] })
    .expect(403);
  const windows = [{ start: 540, end: 600 }];
  await user
    .put(`/api/staff/${alice.id}/weekly/1`)
    .send({ windows })
    .expect(200);
  await secondUser
    .put(`/api/staff/${bob.id}/weekly/1`)
    .send({ windows })
    .expect(200);
  await manager
    .put(`/api/staff/${bob.id}/overrides/2026-10-01`)
    .send({ mode: "unavailable", windows: [] })
    .expect(200);
  await user
    .post(`/api/staff/${alice.id}/appointments`)
    .send({
      date: "2026-10-05",
      title: "Kept booking",
      start: 540,
      duration: 30,
    })
    .expect(201);
  assert.equal(store.reportingSnapshot().changes.length, 3);
  const captureDirectory = join(directory, "captures");
  const capture = new FileCaptureMailer(captureDirectory);
  let fail = true;
  const mailer = {
    send: async (message: Parameters<FileCaptureMailer["send"]>[0]) => {
      if (fail && message.to === "second@example.com")
        throw new Error("Controlled failure");
      return capture.send(message);
    },
  };
  let reports = new ReportStore(reportPath);
  let delivery = new ReportDelivery(
    reports,
    accounts,
    pdfReportRenderer,
    mailer,
    clock,
  );
  let service = new ReportingService(
    store,
    reports,
    delivery,
    { schedule: () => () => {} },
    clock,
  );
  service.start();
  instant = "2026-09-30T14:00:00.000Z";
  service.tick();
  await delivery.drain();
  assert.deepEqual(
    reports.list()[0].recipients.map((recipient) => recipient.status),
    ["sent", "failed"],
  );
  assert.equal(readdirSync(captureDirectory).length, 1);
  await service.stop();
  const restartedStore = new Store(schedulePath);
  assert.equal(restartedStore.get(alice.id)!.appointments!.length, 1);
  reports = new ReportStore(reportPath);
  delivery = new ReportDelivery(
    reports,
    accounts,
    pdfReportRenderer,
    mailer,
    clock,
  );
  service = new ReportingService(
    restartedStore,
    reports,
    delivery,
    { schedule: () => () => {} },
    clock,
  );
  service.start();
  fail = false;
  instant = "2026-09-30T14:01:00.000Z";
  service.tick();
  await delivery.drain();
  assert.equal(readdirSync(captureDirectory).length, 2);
  instant = "2026-10-01T14:00:00.000Z";
  service.tick();
  await delivery.drain();
  await service.stop();
  assert.deepEqual(
    reports.list().map((job) => job.model.changes.length),
    [3, 0],
  );
  assert.equal(readdirSync(captureDirectory).length, 4);
  for (const folder of readdirSync(captureDirectory)) {
    const metadata = JSON.parse(
      readFileSync(join(captureDirectory, folder, "message.json"), "utf8"),
    );
    assert.ok(
      ["manager@example.com", "second@example.com"].includes(metadata.to),
    );
    assert.equal(metadata.attachment.contentType, "application/pdf");
    const pdf = readFileSync(join(captureDirectory, folder, "attachment.pdf"));
    assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
    assert.ok(pdf.length > 1000);
  }
});
