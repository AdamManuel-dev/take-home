import { nextLocalCutoff } from "./cutoffs.js";
import {
  reportTimeSchema,
  type ReportSettingsController,
} from "../../shared/contracts/report-settings.js";
import { TIMEZONE } from "../../shared/constants.js";
import type { ChangeRepository } from "../../shared/contracts/persistence.js";
import type {
  ReportJob,
  ReportModel,
  StoredReportSettings,
} from "./contracts.js";
import { buildReportModel } from "./selection.js";
import type { ReportRepository } from "./store.js";
import type { ReportScheduler } from "./scheduler.js";

export interface DeliveryCoordinator {
  createJob(model: ReportModel): ReportJob;
  recoverInterrupted(): void;
  runDue(): Promise<void>;
  drain(): Promise<void>;
}

/** Finds the next local 09:00 strictly after the previous boundary, including DST days. */
export function nextDailyCutoff(after: string) {
  return nextLocalCutoff(after, "09:00");
}

/** Durable job creation is synchronous and independent from potentially slow mail sends. */
export class ReportingService implements ReportSettingsController {
  private activeRevision = 0;
  private stopped = true;
  private stopSchedules: (() => void)[] = [];
  constructor(
    private changes: ChangeRepository,
    private reports: ReportRepository,
    private delivery: DeliveryCoordinator,
    private scheduler: ReportScheduler,
    private now: () => Date = () => new Date(),
    private build: typeof buildReportModel = buildReportModel,
    private log: (message: string) => void = console.log,
  ) {}

  start() {
    if (!this.stopped) return;
    this.delivery.recoverInterrupted();
    this.reconcile();
    const settings = this.ensureSettings();
    const schedules = this.prepareSchedules(settings);
    this.stopped = false;
    this.activeRevision = settings.revision;
    this.stopSchedules = schedules;
    this.sendDue();
  }

  tick(revision = this.activeRevision) {
    if (
      this.stopped ||
      revision !== this.activeRevision ||
      revision !== this.ensureSettings().revision
    )
      return;
    try {
      this.reconcile();
      this.sendDue();
    } catch {
      this.log(
        "Reporting job creation failed; pending cutoffs will be retried",
      );
    }
  }
  private sendDue() {
    void this.delivery
      .runDue()
      .catch(() =>
        this.log(
          "Reporting delivery state could not be persisted; review report storage",
        ),
      );
  }
  private ensureSettings(): StoredReportSettings {
    const existing = this.reports.getSettings();
    if (existing) return existing;
    const last = this.reports
      .list()
      .sort((a, b) => Date.parse(b.cutoff) - Date.parse(a.cutoff))[0];
    const baseline =
      last?.cutoff ?? this.changes.reportingSnapshot().reportingStartedAt;
    const settings: StoredReportSettings = {
      localTime: "09:00",
      timezone: TIMEZONE,
      revision: 1,
      nextCutoff: nextLocalCutoff(baseline, "09:00"),
    };
    this.reports.setSettings(settings);
    return settings;
  }
  getSettings() {
    const { localTime, timezone } = this.ensureSettings();
    return { localTime, timezone };
  }
  private prepareSchedules(settings: StoredReportSettings) {
    const [hour, minute] = settings.localTime.split(":").map(Number);
    const stops: (() => void)[] = [];
    try {
      stops.push(
        this.scheduler.schedule(`${minute} ${hour} * * *`, TIMEZONE, () =>
          this.tick(settings.revision),
        ),
      );
      // Minute reconciliation enforces explicit gap/fold policy instead of relying on cron DST behavior.
      stops.push(
        this.scheduler.schedule("* * * * *", TIMEZONE, () =>
          this.tick(settings.revision),
        ),
      );
      return stops;
    } catch (error) {
      stops.forEach((stop) => stop());
      throw error;
    }
  }
  updateSettings(localTime: string) {
    reportTimeSchema.parse(localTime);
    const previous = this.ensureSettings();
    const settings = {
      ...previous,
      localTime,
      revision: previous.revision + 1,
      nextCutoff: nextLocalCutoff(this.now().toISOString(), localTime),
    };
    // New callbacks remain inert until persistence succeeds and activeRevision switches.
    const schedules = this.stopped ? [] : this.prepareSchedules(settings);
    try {
      this.reports.setSettings(settings);
    } catch (error) {
      schedules.forEach((stop) => stop());
      throw error;
    }
    this.stopSchedules.splice(0).forEach((stop) => stop());
    this.stopSchedules = schedules;
    this.activeRevision = settings.revision;
    return { localTime: settings.localTime, timezone: settings.timezone };
  }
  private reconcile() {
    const snapshot = this.changes.reportingSnapshot();
    const last = this.reports
      .list()
      .sort((a, b) => Date.parse(b.cutoff) - Date.parse(a.cutoff))[0];
    let start = last?.cutoff ?? snapshot.reportingStartedAt;
    let settings = this.ensureSettings();
    const now = this.now().toISOString();
    // A crash after job commit but before advancing nextCutoff reuses the durable job boundary.
    while (Date.parse(settings.nextCutoff) <= Date.parse(start)) {
      settings = {
        ...settings,
        nextCutoff: nextLocalCutoff(start, settings.localTime),
      };
      this.reports.setSettings(settings);
    }
    while (Date.parse(settings.nextCutoff) <= Date.parse(now)) {
      const cutoff = settings.nextCutoff;
      const model = this.build({
        id: `daily-${cutoff}`,
        interval: { start, end: cutoff },
        changes: snapshot.changes,
        generatedAt: now,
      });
      const job = this.delivery.createJob(model);
      if (!job.recipients.length)
        this.log(`Report ${job.id} created with no eligible recipients`);
      start = cutoff;
      settings = {
        ...settings,
        nextCutoff: nextLocalCutoff(cutoff, settings.localTime),
      };
      this.reports.setSettings(settings);
    }
  }

  /** Stops callbacks immediately and returns false if active sends exceed the bounded drain. */
  async stop(timeoutMs = 5000) {
    this.stopped = true;
    this.stopSchedules.splice(0).forEach((stop) => stop());
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        this.delivery.drain().then(
          () => true,
          () => false,
        ),
        new Promise<boolean>((resolve) => {
          timer = setTimeout(() => resolve(false), Math.max(0, timeoutMs));
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}
