import { randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import {
  reportsDataSchema,
  type ReportJob,
  type ReportRecipient,
  type ReportsData,
  type StoredReportSettings,
} from "./contracts.js";

export interface ReportRepository {
  getSettings(): StoredReportSettings | undefined;
  setSettings(settings: StoredReportSettings): void;
  list(): ReportJob[];
  get(id: string): ReportJob | undefined;
  create(job: ReportJob): ReportJob;
  updateRecipient(
    jobId: string,
    accountId: string,
    change: (recipient: ReportRecipient) => void,
  ): ReportJob;
}

/** Synchronous callbacks always merge against the latest committed recipient state. */
export class ReportStore implements ReportRepository {
  private data: ReportsData;
  constructor(
    private readonly path = resolve(
      process.env.REPORTS_FILE || "data/reports.json",
    ),
  ) {
    mkdirSync(dirname(path), { recursive: true });
    this.data = reportsDataSchema.parse(
      existsSync(path)
        ? JSON.parse(readFileSync(path, "utf8"))
        : { version: 1, jobs: [] },
    );
  }
  getSettings() {
    return structuredClone(this.data.settings);
  }
  setSettings(settings: StoredReportSettings) {
    this.commit({ ...this.data, settings });
  }
  list() {
    return structuredClone(this.data.jobs);
  }
  get(id: string) {
    return structuredClone(this.data.jobs.find((job) => job.id === id));
  }
  create(job: ReportJob) {
    const existing = this.data.jobs.find(
      (item) => Date.parse(item.cutoff) === Date.parse(job.cutoff),
    );
    if (existing) return structuredClone(existing);
    this.commit({ ...this.data, jobs: [...this.data.jobs, job] });
    return this.get(job.id)!;
  }
  updateRecipient(
    jobId: string,
    accountId: string,
    change: (recipient: ReportRecipient) => void,
  ) {
    const data = structuredClone(this.data);
    const job = data.jobs.find((item) => item.id === jobId);
    const recipient = job?.recipients.find(
      (item) => item.accountId === accountId,
    );
    if (!job || !recipient) throw new Error("Unknown report job or recipient");
    const identity = { accountId: recipient.accountId, email: recipient.email };
    change(recipient);
    if (
      recipient.accountId !== identity.accountId ||
      recipient.email !== identity.email
    )
      throw new Error("Recipient snapshot cannot change");
    this.commit(data);
    return this.get(jobId)!;
  }
  private commit(value: ReportsData) {
    const data = reportsDataSchema.parse(value);
    const temporary = `${this.path}.${randomUUID()}.tmp`;
    try {
      writeFileSync(temporary, JSON.stringify(data, null, 2), {
        encoding: "utf8",
        mode: 0o600,
        flag: "wx",
      });
      renameSync(temporary, this.path);
    } catch (error) {
      try {
        rmSync(temporary, { force: true });
      } catch {
        /* Preserve write failure. */
      }
      throw error;
    }
    this.data = data;
  }
}
