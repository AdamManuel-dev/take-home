import type { StaffPickerProps } from "../../../shared/contracts/component-props";

/** Selects staff and creates new identities without switching during a schedule save. */
export function StaffPicker({ staffState, savingSchedule }: StaffPickerProps) {
  const {
    staff,
    selected,
    setSelected,
    name,
    setName,
    loading,
    creating,
    createStaff,
  } = staffState;

  return (
    <section className="staff-bar" aria-label="Staff selection">
      <div className="staff-selector">
        <label htmlFor="staff">WHO’S ON THE SCHEDULE?</label>
        <select
          id="staff"
          disabled={loading || creating || savingSchedule || staff.length === 0}
          value={selected}
          onChange={
            /** Switches the active workspace to the selected staff ID. */ (
              e,
            ) => setSelected(e.target.value)
          }
        >
          {staff.length === 0 && (
            <option value="">
              {loading ? "Loading staff…" : "Add your first staff member"}
            </option>
          )}
          {staff.map(
            /** Renders a staff option with an ID suffix when names are duplicated. */ (
              s,
            ) => (
              <option key={s.id} value={s.id}>
                {s.name}{" "}
                {staff.filter(
                  /** Finds duplicate display names so same-name staff can be distinguished. */ (
                    other,
                  ) => other.name === s.name,
                ).length > 1
                  ? `(${s.id.slice(0, 6)})`
                  : ""}
              </option>
            ),
          )}
        </select>
      </div>
      <form className="new-staff" onSubmit={createStaff}>
        <label htmlFor="name">Add someone new</label>
        <div className="inline-form">
          <input
            id="name"
            placeholder="Staff member’s name"
            required
            maxLength={100}
            value={name}
            disabled={creating || loading || savingSchedule}
            onChange={
              /** Updates the unsaved staff name from the input field. */ (e) =>
                setName(e.target.value)
            }
          />
          <button
            className="secondary"
            disabled={creating || loading || savingSchedule || !name.trim()}
          >
            {creating ? "Adding…" : "+ Add staff"}
          </button>
        </div>
      </form>
    </section>
  );
}
