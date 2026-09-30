import { useState } from "react";
import { WEEKDAYS } from "../../../shared/constants";
import type { WeeklyDayProps } from "../../../shared/contracts/component-props";
import { WindowInputs } from "../../shared/components/window-inputs";
import { errorMessage } from "../../shared/lib/api";
import { draftWindows, parseWindows } from "../../shared/lib/windows";

/** Edits and explicitly saves one recurring weekday while showing unsaved changes and feedback. */
export function WeeklyDay({ day, windows, save }: WeeklyDayProps) {
  /** Editable time strings initialized from saved hours and kept separate until save succeeds. */
  const [draft, setDraft] = useState(
    /** Builds the initial draft once when this weekday editor mounts. */ () =>
      draftWindows(windows),
  );

  /** Success message for the most recent completed save. */
  const [status, setStatus] = useState("");

  /** Parsing, validation, or persistence error shown beside this weekday. */
  const [error, setError] = useState("");

  /** Whether the current draft differs from the saved weekly windows. */
  const dirty = JSON.stringify(draft) !== JSON.stringify(draftWindows(windows));

  return (
    <form
      className="weekday-row"
      onSubmit={
        /** Parses and saves this weekday, normalizing the displayed order after a successful response. */ async (
          e,
        ) => {
          e.preventDefault();
          setError("");
          setStatus("");

          try {
            /** Draft windows converted to integer-minute boundaries for server validation. */
            const parsed = parseWindows(draft);
            await save(day, parsed);
            setDraft(
              draftWindows(
                [...parsed].sort(
                  /** Sorts saved windows by their start time before rebuilding the draft. */ (
                    a,
                    b,
                  ) => a.start - b.start,
                ),
              ),
            );
            setStatus("Saved");
          } catch (error) {
            setError(errorMessage(error));
          }
        }
      }
    >
      <div className="day-name">
        {WEEKDAYS[day]}
        <span className="day-status">
          {dirty ? "Unsaved changes" : windows.length ? "Available" : "Day off"}
        </span>
      </div>
      <WindowInputs
        value={draft}
        onChange={
          /** Updates the unsaved draft and clears the previous success message. */ (
            value,
          ) => {
            setDraft(value);
            setStatus("");
          }
        }
        label={WEEKDAYS[day]}
      />
      <button className="small-button" disabled={!dirty} type="submit">
        Save
      </button>
      {error && (
        <p role="alert" className="error row-message">
          {error}
        </p>
      )}
      {status && !dirty && (
        <span role="status" className="success row-message">
          {status}
        </span>
      )}
    </form>
  );
}
