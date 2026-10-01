import { DateTime } from "luxon";
import { TIMEZONE } from "../../shared/constants.js";
import { dateSchema } from "../../shared/schemas.js";
import { utcTimestampSchema } from "../../shared/contracts/change-events.js";
import { reportTimeSchema } from "../../shared/contracts/report-settings.js";

/** Repeated wall times use their first occurrence; gaps advance to the first valid minute. */
export function localCutoff(date: string, localTime: string) {
  dateSchema.parse(date);
  reportTimeSchema.parse(localTime);
  const day = DateTime.fromISO(date, { zone: TIMEZONE });
  const [hour, minute] = localTime.split(":").map(Number);
  for (let wallMinute = hour * 60 + minute; wallMinute < 1440; wallMinute++) {
    const candidate = DateTime.fromObject(
      {
        year: day.year,
        month: day.month,
        day: day.day,
        hour: Math.floor(wallMinute / 60),
        minute: wallMinute % 60,
      },
      { zone: TIMEZONE },
    );
    if (
      candidate.hour !== Math.floor(wallMinute / 60) ||
      candidate.minute !== wallMinute % 60
    )
      continue;
    const first = candidate
      .getPossibleOffsets()
      .sort((a, b) => a.toMillis() - b.toMillis())[0];
    return first.toUTC().toISO()!;
  }
  throw new Error("No valid report time on local date");
}

export function nextLocalCutoff(after: string, localTime: string) {
  utcTimestampSchema.parse(after);
  reportTimeSchema.parse(localTime);
  let day = DateTime.fromISO(after, { zone: "utc" })
    .setZone(TIMEZONE)
    .startOf("day");
  let cutoff = localCutoff(day.toISODate()!, localTime);
  if (Date.parse(cutoff) <= Date.parse(after)) {
    day = day.plus({ days: 1 });
    cutoff = localCutoff(day.toISODate()!, localTime);
  }
  return cutoff;
}
