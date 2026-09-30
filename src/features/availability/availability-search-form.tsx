import { DURATIONS } from "../../../shared/constants";
import type { AvailabilitySearchFormProps } from "../../../shared/contracts/component-props";

/** Edits search parameters, invalidating any results from the previous query. */
export function AvailabilitySearchForm({
  availability,
  saving,
}: AvailabilitySearchFormProps) {
  const { query, setQuery, invalidate, search, searching } = availability;

  return (
    <form onSubmit={search}>
      <div className="form-grid">
        <label>
          From
          <input
            type="date"
            required
            value={query.start}
            onChange={
              /** Invalidates old results before changing the inclusive start date. */ (
                e,
              ) => {
                invalidate("Dates changed. Search to see matching times.");
                setQuery({ ...query, start: e.target.value });
              }
            }
          />
        </label>
        <label>
          Through
          <input
            type="date"
            required
            value={query.end}
            onChange={
              /** Invalidates old results before changing the inclusive end date. */ (
                e,
              ) => {
                invalidate("Dates changed. Search to see matching times.");
                setQuery({ ...query, end: e.target.value });
              }
            }
          />
        </label>
      </div>
      <label className="duration-label">
        Appointment duration
        <select
          value={query.duration}
          onChange={
            /** Invalidates old results before selecting a supported appointment duration. */ (
              e,
            ) => {
              invalidate("Duration changed. Search to see matching times.");
              setQuery({ ...query, duration: Number(e.target.value) });
            }
          }
        >
          {DURATIONS.map(
            /** Renders one supported appointment length in the duration selector. */ (
              duration,
            ) => (
              <option key={duration} value={duration}>
                {duration} minutes
              </option>
            ),
          )}
        </select>
      </label>
      <p className="hint">Up to 90 dates, including both endpoints.</p>
      <button
        className="primary search-button"
        disabled={searching || saving}
        type="submit"
      >
        {searching ? "Finding times…" : "Find available times"}{" "}
        <span aria-hidden="true">↗</span>
      </button>
    </form>
  );
}
