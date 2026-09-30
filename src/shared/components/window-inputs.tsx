import type { WindowInputsProps } from "../../../shared/contracts/component-props";

/** Renders labeled start/end fields and immutable add/remove controls for a draft window list. */
export function WindowInputs({ value, onChange, label }: WindowInputsProps) {
  return (
    <div className="window-editor">
      {value.length === 0 && (
        <span className="muted off-label">No hours set</span>
      )}
      {value.map(
        /** Renders one editable interval with position-specific accessible labels. */ (
          window,
          index,
        ) => (
          <div className="window-input" key={index}>
            <input
              aria-label={`${label} window ${index + 1} start`}
              placeholder="09:00"
              value={window.start}
              maxLength={5}
              onChange={
                /** Forwards a changed start time while preserving the remaining draft windows. */ (
                  e,
                ) =>
                  onChange(
                    value.map(
                      /** Replaces only the edited window's start field. */ (
                        w,
                        i,
                      ) => (i === index ? { ...w, start: e.target.value } : w),
                    ),
                  )
              }
            />
            <span className="muted">to</span>
            <input
              aria-label={`${label} window ${index + 1} end`}
              placeholder="17:00"
              value={window.end}
              maxLength={5}
              onChange={
                /** Forwards a changed end time while preserving the remaining draft windows. */ (
                  e,
                ) =>
                  onChange(
                    value.map(
                      /** Replaces only the edited window's end field. */ (
                        w,
                        i,
                      ) => (i === index ? { ...w, end: e.target.value } : w),
                    ),
                  )
              }
            />
            <button
              type="button"
              className="icon-button"
              aria-label={`Remove ${label} window ${index + 1}`}
              onClick={
                /** Removes the selected draft interval without mutating the input array. */ () =>
                  onChange(
                    value.filter(
                      /** Keeps every draft interval except the selected position. */ (
                        _,
                        i,
                      ) => i !== index,
                    ),
                  )
              }
            >
              ×
            </button>
          </div>
        ),
      )}
      <button
        type="button"
        className="text-button"
        onClick={
          /** Appends a default 09:00-17:00 interval for further editing. */ () =>
            onChange([...value, { start: "09:00", end: "17:00" }])
        }
      >
        + Add window
      </button>
    </div>
  );
}
