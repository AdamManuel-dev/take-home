import type { AvailabilityDayProps } from "../../../shared/contracts/component-props";
import type { DayResult } from "../../../shared/contracts/types";
import { dateLabel } from "../../../shared/dates";
import { formatTime } from "../../../shared/time";

/** Explains which saved rule supplied the day's effective availability. */
function availabilitySourceLabel(day: DayResult): string {
  if (day.source === "combined") return "Weekly + added";

  if (day.mode === "unavailable") return "Day off override";

  if (day.mode === "replace") return "Replaced hours";

  if (day.mode === "add") return "Added hours";

  return day.source === "weekly" ? "Weekly hours" : "Day off";
}

/** Renders one date with its source, effective hours, slots, or empty-state explanation. */
export function AvailabilityDay({
  day,
  selected,
  saving,
  onSelect,
}: AvailabilityDayProps) {
  return (
    <article className="result-day">
      <div className="result-heading">
        <h3>{dateLabel(day.date)}</h3>
        <span className={`source ${day.source}`}>
          {availabilitySourceLabel(day)}
        </span>
      </div>
      {day.windows.length > 0 && (
        <p className="hint">
          {day.windows
            .map(
              /** Formats one effective availability interval for display. */ (
                w,
              ) => `${formatTime(w.start)}–${formatTime(w.end)}`,
            )
            .join(" · ")}
        </p>
      )}
      {day.reason ? (
        <p className="empty-reason">{day.reason}</p>
      ) : (
        <div className="slots">
          {day.slots.map(
            /** Renders an available interval as a keyboard-accessible booking choice. */ (
              slot,
            ) => (
              <button
                type="button"
                className="slot"
                key={slot.start}
                disabled={saving}
                aria-pressed={
                  selected?.date === day.date && selected.start === slot.start
                }
                aria-label={`Select ${dateLabel(day.date)} at ${formatTime(slot.start)} to ${formatTime(slot.end)}`}
                onClick={() => onSelect({ date: day.date, ...slot })}
              >
                {formatTime(slot.start)} <span>– {formatTime(slot.end)}</span>
              </button>
            ),
          )}
        </div>
      )}
    </article>
  );
}
