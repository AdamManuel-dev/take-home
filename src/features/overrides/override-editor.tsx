import type { OverrideEditorProps } from "../../../shared/contracts/component-props";
import type { OverrideMode } from "../../../shared/contracts/types";
import { WindowInputs } from "../../shared/components/window-inputs";
import { OverrideList } from "./override-list";
import { useOverrideEditor } from "./use-override-editor";

/** Edits one date exception and lists saved overrides with edit and removal controls. */
export function OverrideEditor({ overrides, mutate }: OverrideEditorProps) {
  const {
    date,
    setDate,
    mode,
    setMode,
    windows,
    setWindows,
    error,
    status,
    editing,
    change,
    saveOverride,
    editOverride,
    removeOverride,
  } = useOverrideEditor(mutate);

  return (
    <>
      <form className="override-form" onSubmit={saveOverride}>
        <div className="form-grid">
          <label>
            Date
            <input
              type="date"
              required
              value={date}
              onChange={
                /** Changes the draft date and marks the form as unsaved. */ (
                  e,
                ) => {
                  setDate(e.target.value);
                  change();
                }
              }
            />
          </label>
          <label>
            Override mode
            <select
              value={mode}
              onChange={
                /** Changes the override mode and marks the form as unsaved. */ (
                  e,
                ) => {
                  setMode(e.target.value as OverrideMode);
                  change();
                }
              }
            >
              <option value="unavailable">Unavailable</option>
              <option value="replace">Replace hours</option>
              <option value="add">Add hours</option>
            </select>
          </label>
        </div>
        <p className="hint">
          {mode === "unavailable"
            ? "Make this date a day off, regardless of weekly hours."
            : mode === "replace"
              ? "Use only these hours instead of the recurring schedule."
              : "Extend existing availability. Overlapping or touching hours are combined."}
        </p>
        {mode !== "unavailable" && (
          <WindowInputs
            value={windows}
            onChange={
              /** Replaces the draft window list and marks the form as unsaved. */ (
                value,
              ) => {
                setWindows(value);
                change();
              }
            }
            label="Override"
          />
        )}
        <div className="form-footer">
          <span className="muted">
            {editing
              ? "Unsaved override"
              : overrides.some(
                    /** Checks whether saving the selected date will replace an existing exception. */ (
                      o,
                    ) => o.date === date,
                  )
                ? "Saving replaces this date’s existing override."
                : "One override per date."}
          </span>
          <button type="submit" className="secondary">
            Save override
          </button>
        </div>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {status && (
          <p className="success" role="status">
            {status}
          </p>
        )}
      </form>
      <OverrideList
        overrides={overrides}
        onEdit={editOverride}
        onRemove={removeOverride}
      />
    </>
  );
}
