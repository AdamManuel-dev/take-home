import type { OverrideListProps } from "../../../shared/contracts/component-props";
import { dateLabel } from "../../../shared/dates";
import { formatTime } from "../../../shared/time";

/** Lists saved exceptions without sharing ownership of the editable draft. */
export function OverrideList({
  overrides,
  onEdit,
  onRemove,
}: OverrideListProps) {
  return (
    <div className="override-list">
      {overrides.length === 0 ? (
        <p className="empty-small">
          No exceptions yet. Your weekly hours apply.
        </p>
      ) : (
        overrides.map(
          /** Renders a saved date exception with its hours and editing actions. */ (
            override,
          ) => (
            <div className="override-item" key={override.date}>
              <div>
                <strong>{dateLabel(override.date)}</strong>
                <span className="muted">
                  {override.mode === "unavailable"
                    ? "Unavailable"
                    : `${override.mode === "add" ? "Add" : "Replace"} · ${override.windows.map(/** Formats one saved override interval for its summary. */ (w) => `${formatTime(w.start)}–${formatTime(w.end)}`).join(", ")}`}
                </span>
              </div>
              <div className="button-group">
                <button
                  type="button"
                  className="text-button"
                  aria-label={`Edit override ${override.date}`}
                  onClick={() => onEdit(override)}
                >
                  Edit
                </button>
                <button
                  type="button"
                  className="text-button danger"
                  aria-label={`Remove override ${override.date}`}
                  onClick={() => void onRemove(override)}
                >
                  Remove
                </button>
              </div>
            </div>
          ),
        )
      )}
    </div>
  );
}
