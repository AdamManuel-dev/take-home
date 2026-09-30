import type { WeeklyHoursPanelProps } from "../../../shared/contracts/component-props";
import { WeeklyDay } from "./weekly-day";

/** Presents Monday-first weekly editors and keeps each day's draft independent. */
export function WeeklyHoursPanel({
  staff,
  schedule,
  disabled,
  mutate,
}: WeeklyHoursPanelProps) {
  return (
    <section className="card">
      <div className="section-heading">
        <div>
          <span className="eyebrow">01 / RECURRING SCHEDULE</span>
          <h2>Weekly hours</h2>
        </div>
        <span className="pill">Repeats weekly</span>
      </div>
      <p className="section-description">
        Set the usual rhythm for {staff.name}. Save each day when you’re ready.
      </p>
      <p className="hint">
        Use 24-hour times (HH:MM). An end time of 24:00 is allowed.
      </p>
      <fieldset disabled={disabled} className="plain-fieldset">
        {[1, 2, 3, 4, 5, 6, 0].map(
          /** Renders weekday editors in Monday-first display order while retaining Sunday-zero IDs. */ (
            day,
          ) => (
            <WeeklyDay
              key={day}
              day={day}
              windows={schedule.weekly[day]}
              save={
                /** Saves one weekday through the shared guarded mutation path. */ (
                  day,
                  windows,
                ) => mutate(`/weekly/${day}`, "PUT", { windows })
              }
            />
          ),
        )}
      </fieldset>
    </section>
  );
}
