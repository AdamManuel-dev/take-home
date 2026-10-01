import { reportSettingsSchema } from "../../shared/contracts/report-settings.js";
import { z } from "zod";
import { TIMEZONE } from "../../shared/constants.js";
import {
  scheduleChangeSchema,
  utcTimestampSchema,
} from "../../shared/contracts/change-events.js";
export {
  scheduleChangeSchema,
  utcTimestampSchema,
  changeActorSchema,
} from "../../shared/contracts/change-events.js";
export type {
  ScheduleChange,
  ChangeActor,
} from "../../shared/contracts/change-events.js";
const idSchema = z.string().min(1);

export const reportIntervalSchema = z
  .object({
    start: utcTimestampSchema,
    end: utcTimestampSchema,
  })
  .refine(
    (interval) => Date.parse(interval.start) < Date.parse(interval.end),
    "Report interval must increase",
  );
export type ReportInterval = z.infer<typeof reportIntervalSchema>;

export const reportModelSchema = z
  .object({
    id: idSchema,
    interval: reportIntervalSchema,
    timezone: z.literal(TIMEZONE),
    generatedAt: utcTimestampSchema,
    changes: z.array(scheduleChangeSchema),
  })
  .refine((model) => {
    const start = Date.parse(model.interval.start);
    const end = Date.parse(model.interval.end);
    return (
      model.changes.every(
        (change, index) =>
          Date.parse(change.occurredAt) >= start &&
          Date.parse(change.occurredAt) < end &&
          (index === 0 || change.sequence > model.changes[index - 1].sequence),
      ) &&
      new Set(model.changes.map((change) => change.id)).size ===
        model.changes.length
    );
  }, "Frozen report events must be unique, ordered, and within [start, end)");
export type ReportModel = z.infer<typeof reportModelSchema>;

export const reportRecipientSchema = z
  .object({
    accountId: idSchema,
    email: z.email(),
    status: z.enum(["pending", "sending", "sent", "failed"]),
    attempts: z.number().int().nonnegative(),
    retryBase: z.number().int().nonnegative().optional(),
    attemptedAt: utcTimestampSchema.optional(),
    nextAttemptAt: utcTimestampSchema.optional(),
    responseId: z.string().optional(),
    error: z.string().max(500).optional(),
  })
  .refine(
    (recipient) => (recipient.retryBase ?? 0) <= recipient.attempts,
    "Retry base cannot exceed attempt count",
  );
export type ReportRecipient = z.infer<typeof reportRecipientSchema>;

export const reportJobSchema = z
  .object({
    id: idSchema,
    cutoff: utcTimestampSchema,
    model: reportModelSchema,
    recipients: z.array(reportRecipientSchema),
  })
  .refine(
    (job) =>
      job.id === job.model.id &&
      Date.parse(job.cutoff) === Date.parse(job.model.interval.end) &&
      new Set(job.recipients.map((recipient) => recipient.accountId)).size ===
        job.recipients.length,
    "Job identity, cutoff, and unique recipients must match the frozen report",
  );
export type ReportJob = z.infer<typeof reportJobSchema>;

export const storedReportSettingsSchema = reportSettingsSchema.extend({
  revision: z.number().int().positive(),
  nextCutoff: utcTimestampSchema,
});
export type StoredReportSettings = z.infer<typeof storedReportSettingsSchema>;

export const reportsDataSchema = z
  .object({
    version: z.literal(1),
    jobs: z.array(reportJobSchema),
    settings: storedReportSettingsSchema.optional(),
  })
  .refine(
    (data) =>
      new Set(data.jobs.map((job) => job.id)).size === data.jobs.length &&
      new Set(data.jobs.map((job) => Date.parse(job.cutoff))).size ===
        data.jobs.length,
    "Report jobs must have unique IDs and cutoffs",
  );
export type ReportsData = z.infer<typeof reportsDataSchema>;

export const REPORT_DEFAULTS = {
  localTime: "09:00",
  timezone: TIMEZONE,
  retryDelaysMs: [60_000, 300_000, 900_000],
} as const;
