import { createHash } from "node:crypto";
import { DateTime } from "luxon";
import type { AccountRepository } from "../auth/accounts.js";
import {
  REPORT_DEFAULTS,
  type ReportModel,
  type ReportRecipient,
} from "./contracts.js";
import type { ReportRenderer } from "./pdf.js";
import type { ReportMailer } from "./mail.js";
import type { ReportRepository } from "./store.js";

const cycleAttempts = (recipient: ReportRecipient) =>
  recipient.attempts - (recipient.retryBase ?? 0);
const exhausted = (recipient: ReportRecipient) => cycleAttempts(recipient) >= 4;
const stableMessageId = (reportId: string, accountId: string) =>
  `<${createHash("sha256")
    .update(JSON.stringify([reportId, accountId]))
    .digest("hex")}@open-hours.local>`;

export class ReportDelivery {
  private running = new Map<string, Promise<void>>();
  constructor(
    private reports: ReportRepository,
    private accounts: AccountRepository,
    private renderer: ReportRenderer,
    private mailer: ReportMailer,
    private now: () => Date = () => new Date(),
  ) {}

  /** Persist snapshots before any rendering or sending; retries never rebuild recipients/model. */
  createJob(model: ReportModel) {
    return this.reports.create({
      id: model.id,
      cutoff: model.interval.end,
      model,
      recipients: this.accounts
        .list()
        .filter((account) => account.active && account.role === "manager")
        .map((account) => ({
          accountId: account.id,
          email: account.email!,
          status: "pending",
          attempts: 0,
        })),
    });
  }

  /** Invoke once on process startup, before starting sends. Interrupted acceptance is ambiguous. */
  recoverInterrupted() {
    for (const job of this.reports.list())
      for (const recipient of job.recipients)
        if (recipient.status === "sending") {
          this.reports.updateRecipient(
            job.id,
            recipient.accountId,
            (current) => {
              current.status = "failed";
              current.error =
                "Delivery interrupted; provider acceptance is unknown";
              const delay =
                REPORT_DEFAULTS.retryDelaysMs[cycleAttempts(current) - 1];
              current.nextAttemptAt =
                delay === undefined
                  ? undefined
                  : new Date(
                      Date.parse(
                        current.attemptedAt ?? this.now().toISOString(),
                      ) + delay,
                    ).toISOString();
            },
          );
        }
  }

  async runDue() {
    const jobs = this.reports
      .list()
      .sort((a, b) => Date.parse(a.cutoff) - Date.parse(b.cutoff));
    const tasks: Promise<void>[] = [];
    for (const job of jobs)
      for (const recipient of job.recipients) {
        const key = JSON.stringify([job.id, recipient.accountId]);
        const due =
          recipient.status === "pending" ||
          (recipient.status === "failed" &&
            recipient.nextAttemptAt &&
            Date.parse(recipient.nextAttemptAt) <= this.now().getTime());
        if (!due || exhausted(recipient) || this.running.has(key)) continue;
        const task = this.deliver(job.id, recipient.accountId).finally(() =>
          this.running.delete(key),
        );
        this.running.set(key, task);
        tasks.push(task);
      }
    await Promise.all(tasks);
  }

  private eligible(accountId: string) {
    const account = this.accounts.get(accountId);
    return account?.active && account.role === "manager";
  }
  private async deliver(jobId: string, accountId: string) {
    const job = this.reports.get(jobId)!;
    if (!this.eligible(accountId)) {
      this.reports.updateRecipient(jobId, accountId, (recipient) => {
        recipient.status = "failed";
        recipient.error = "Recipient is no longer an active manager";
        recipient.nextAttemptAt = undefined;
      });
      return;
    }
    this.reports.updateRecipient(jobId, accountId, (recipient) => {
      recipient.status = "sending";
      recipient.attempts++;
      recipient.attemptedAt = this.now().toISOString();
      recipient.nextAttemptAt = undefined;
      recipient.error = undefined;
    });
    try {
      const content = await this.renderer.render(job.model);
      if (!this.eligible(accountId)) {
        this.reports.updateRecipient(jobId, accountId, (recipient) => {
          recipient.status = "failed";
          recipient.error = "Recipient is no longer an active manager";
          recipient.nextAttemptAt = undefined;
        });
        return;
      }
      const recipient = job.recipients.find(
        (item) => item.accountId === accountId,
      )!;
      const date = DateTime.fromISO(job.cutoff, { zone: "utc" })
        .setZone(job.model.timezone)
        .toISODate()!;
      const weekly = job.model.changes.filter(
        (change) => change.entityType === "weekly",
      ).length;
      const result = await this.mailer.send({
        reportId: job.id,
        messageId: stableMessageId(job.id, accountId),
        to: recipient.email,
        subject: `Daily schedule changes - ${date}`,
        text: `${job.model.changes.length} schedule changes: ${weekly} weekly availability and ${job.model.changes.length - weekly} override changes. See the attached report.`,
        attachment: {
          filename: `schedule-changes-${date}.pdf`,
          contentType: "application/pdf",
          content,
        },
      });
      this.reports.updateRecipient(jobId, accountId, (current) => {
        current.status = "sent";
        current.responseId = result.responseId;
        current.error = undefined;
        current.nextAttemptAt = undefined;
      });
    } catch {
      this.reports.updateRecipient(jobId, accountId, (recipient) => {
        recipient.status = "failed";
        recipient.error = "Report rendering or delivery failed";
        const delay =
          REPORT_DEFAULTS.retryDelaysMs[cycleAttempts(recipient) - 1];
        recipient.nextAttemptAt =
          delay === undefined
            ? undefined
            : new Date(this.now().getTime() + delay).toISOString();
      });
    }
  }

  async drain() {
    await Promise.all([...this.running.values()]);
  }
}

/** Offline administrator operation: preserve totals and untouched recipient progress. */
export function retryExhaustedReports(
  reports: ReportRepository,
  now: Date,
  jobId?: string,
) {
  let count = 0;
  for (const job of reports.list()) {
    if (jobId && job.id !== jobId) continue;
    for (const recipient of job.recipients)
      if (recipient.status === "failed" && exhausted(recipient)) {
        reports.updateRecipient(job.id, recipient.accountId, (current) => {
          current.retryBase = current.attempts;
          current.status = "pending";
          current.nextAttemptAt = now.toISOString();
          current.error = undefined;
        });
        count++;
      }
  }
  return count;
}
