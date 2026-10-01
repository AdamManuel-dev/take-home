import type { ScheduleChange } from "../../shared/contracts/change-events.js";
import type { StaffRecord } from "../../shared/contracts/persistence.js";
import type { Override } from "../../shared/contracts/types.js";
import { normalize } from "../scheduling.js";

type ChangeValue =
  | Omit<
      Extract<ScheduleChange, { entityType: "weekly" }>,
      "id" | "sequence" | "occurredAt" | "actor" | "staff"
    >
  | Omit<
      Extract<ScheduleChange, { entityType: "override" }>,
      "id" | "sequence" | "occurredAt" | "actor" | "staff"
    >;
function overrideValue(override: Override | undefined) {
  return override
    ? { mode: override.mode, windows: normalize(override.windows) }
    : null;
}
/** Pure diff of committed values; equivalent normalized saves have no audit meaning. */
export function scheduleChanges(
  before: StaffRecord,
  after: StaffRecord,
): ChangeValue[] {
  const changes: ChangeValue[] = [];
  for (let weekday = 0; weekday < 7; weekday++) {
    const previous = normalize(before.weekly[weekday]);
    const next = normalize(after.weekly[weekday]);
    if (JSON.stringify(previous) === JSON.stringify(next)) continue;
    changes.push({
      entityType: "weekly",
      weekday,
      before: previous,
      after: next,
      operation:
        previous.length === 0
          ? "created"
          : next.length === 0
            ? "deleted"
            : "updated",
    });
  }
  const dates = [
    ...new Set(
      [...before.overrides, ...after.overrides].map(
        (override) => override.date,
      ),
    ),
  ].sort();
  for (const date of dates) {
    const previous = overrideValue(
      before.overrides.find((override) => override.date === date),
    );
    const next = overrideValue(
      after.overrides.find((override) => override.date === date),
    );
    if (JSON.stringify(previous) === JSON.stringify(next)) continue;
    changes.push({
      entityType: "override",
      date,
      before: previous,
      after: next,
      operation:
        previous === null ? "created" : next === null ? "deleted" : "updated",
    });
  }
  return changes;
}
