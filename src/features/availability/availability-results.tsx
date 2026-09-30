import type { AvailabilityResultsProps } from "../../../shared/contracts/component-props";
import { AvailabilityDay } from "./availability-day";

/** Summarizes the current response and preserves loading and empty-state feedback. */
export function AvailabilityResults({
  results,
  selected,
  saving,
  searching,
  resultNote,
  onSelect,
}: AvailabilityResultsProps) {
  return (
    <div aria-live="polite" className="results">
      {results ? (
        <>
          <div className="results-summary">
            <strong>
              {results.reduce(
                /** Counts available slots across all returned dates. */ (
                  total,
                  day,
                ) => total + day.slots.length,
                0,
              )}{" "}
              available slots
            </strong>
            <span>
              {results.length} {results.length === 1 ? "day" : "days"}
            </span>
          </div>
          {results.map(
            /** Renders one date with its source, effective hours, slots, or empty-state explanation. */ (
              day,
            ) => (
              <AvailabilityDay
                key={day.date}
                day={day}
                selected={selected}
                saving={saving}
                onSelect={onSelect}
              />
            ),
          )}
        </>
      ) : (
        <div className="results-empty">
          <span className="empty-symbol" aria-hidden="true">
            ◷
          </span>
          <h3>
            {searching ? "Checking the schedule" : "Room for what’s next"}
          </h3>
          <p>
            {searching
              ? "Resolving weekly hours and date overrides…"
              : resultNote}
          </p>
        </div>
      )}
    </div>
  );
}
