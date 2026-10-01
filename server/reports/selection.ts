import { DateTime } from "luxon";
import { TIMEZONE } from "../../shared/constants.js";
import { dateSchema } from "../../shared/schemas.js";
import { utcTimestampSchema } from "../../shared/contracts/change-events.js";
import type { ScheduleChange } from "../../shared/contracts/change-events.js";
import {
  reportIntervalSchema,
  reportModelSchema,
  type ReportInterval,
} from "./contracts.js";

/** Fixed phase-one local cutoff; calendar arithmetic avoids a 24-hour DST assumption. */
export function dailyCutoff(date: string) {
  dateSchema.parse(date);
  return DateTime.fromISO(date, { zone: TIMEZONE })
    .set({ hour: 9 })
    .toUTC()
    .toISO()!;
}

export function dailyInterval(
  cutoffDate: string,
  reportingStartedAt: string,
): ReportInterval {
  utcTimestampSchema.parse(reportingStartedAt);
  const end = dailyCutoff(cutoffDate);
  const previous = DateTime.fromISO(cutoffDate, { zone: TIMEZONE })
    .minus({ days: 1 })
    .toISODate()!;
  const start =
    Date.parse(reportingStartedAt) > Date.parse(dailyCutoff(previous))
      ? reportingStartedAt
      : dailyCutoff(previous);
  return reportIntervalSchema.parse({ start, end });
}

/** Freeze detached snapshots exactly once; later retries reuse the persisted model. */
export function buildReportModel(input: {
  id: string;
  interval: ReportInterval;
  changes: ScheduleChange[];
  generatedAt: string;
}) {
  const interval = reportIntervalSchema.parse(input.interval);
  const start = Date.parse(interval.start),
    end = Date.parse(interval.end);
  return reportModelSchema.parse({
    id: input.id,
    interval,
    timezone: TIMEZONE,
    generatedAt: input.generatedAt,
    changes: input.changes
      .filter(
        (change) =>
          Date.parse(change.occurredAt) >= start &&
          Date.parse(change.occurredAt) < end,
      )
      .sort((a, b) => a.sequence - b.sequence),
  });
}
