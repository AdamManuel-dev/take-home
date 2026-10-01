/** Creates an isolated fixed-9am report demonstration using local mock email captures. */
import { randomBytes } from "node:crypto";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../server/store.js";
import { AccountStore } from "../server/auth/accounts.js";
import { hashPassword } from "../server/auth/passwords.js";
import { ReportStore } from "../server/reports/store.js";
import { ReportDelivery } from "../server/reports/delivery.js";
import { FileCaptureMailer } from "../server/reports/mail.js";
import { pdfReportRenderer } from "../server/reports/pdf.js";
import { ReportingService } from "../server/reports/service.js";

const directory = mkdtempSync(join(tmpdir(), "open-hours-report-demo-"));
let instant = "2026-09-30T13:30:00.000Z";
const clock = () => new Date(instant);
const store = new Store(join(directory, "schedules.json"), clock);
const staff = store.create("Taylor Chen"),
  other = store.create("Morgan Rivera");
const accounts = new AccountStore(
  (id) => Boolean(store.get(id)),
  join(directory, "users.json"),
);
const passwordHash = await hashPassword(randomBytes(32).toString("hex"));
const manager = accounts.create({
  username: "demo-manager",
  displayName: "Demo Manager",
  role: "manager",
  email: "manager@example.invalid",
  active: true,
  passwordHash,
});
for (const [index, person] of [staff, other].entries())
  accounts.create({
    username: `demo-user-${index + 1}`,
    displayName: person.name,
    role: "user",
    staffId: person.id,
    active: true,
    passwordHash,
  });
const reports = new ReportStore(join(directory, "reports.json"));
const delivery = new ReportDelivery(
  reports,
  accounts,
  pdfReportRenderer,
  new FileCaptureMailer(join(directory, "mail-capture")),
  clock,
);
const service = new ReportingService(
  store,
  reports,
  delivery,
  { schedule: () => () => {} },
  clock,
);
service.start();
instant = "2026-09-30T13:45:00.000Z";
const actor = { id: manager.id, name: manager.displayName };
store.update(
  staff.id,
  (record) => {
    record.weekly[1] = [
      { start: 540, end: 720 },
      { start: 780, end: 1020 },
    ];
  },
  actor,
);
store.update(
  other.id,
  (record) => {
    record.overrides = [
      { date: "2026-10-01", mode: "unavailable", windows: [] },
    ];
  },
  actor,
);
instant = "2026-09-30T14:00:00.000Z";
service.tick();
await delivery.drain();
instant = "2026-10-01T14:00:00.000Z";
service.tick();
await delivery.drain();
await service.stop();
writeFileSync(
  join(directory, "demo-summary.json"),
  JSON.stringify(
    {
      timezone: "America/Chicago",
      delivery: "mock capture only",
      jobs: reports.list().map((job) => ({
        id: job.id,
        cutoff: job.cutoff,
        changes: job.model.changes.length,
        recipients: job.recipients.map(({ email, status }) => ({
          email,
          status,
        })),
      })),
    },
    null,
    2,
  ),
  { mode: 0o600 },
);
console.log(`Created isolated report demo: ${directory}`);
console.log(
  "Two daily reports: schedule changes and a no-change day. Inspect mail-capture/*/attachment.pdf and message.json.",
);
console.log(
  "No real email was sent. Random demo account passwords are not displayed; these accounts are for this artifact demonstration only.",
);
