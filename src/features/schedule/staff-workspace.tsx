import { useState } from "react";
import type { StaffWorkspaceProps } from "../../../shared/contracts/component-props";
import type { ScheduleView } from "../../../shared/contracts/types";
import { AppointmentAgenda } from "../appointments/appointment-agenda";
import { AvailabilityPanel } from "../availability/availability-panel";
import { OverridesPanel } from "../overrides/overrides-panel";
import { useSchedule } from "./use-schedule";
import { WeeklyHoursPanel } from "./weekly-hours-panel";

/** Coordinates a selected staff member's saved schedule, editors, and availability searches. */
export function StaffWorkspace({
  staff,
  onSavingChange,
  creatingStaff,
}: StaffWorkspaceProps) {
  /** Selects between recurring availability editors and this person's booked agenda. */
  const [view, setView] = useState<ScheduleView>("availability");
  const {
    schedule,
    loadError,
    mutationError,
    setRetry,
    saving,
    availability,
    mutate,
  } = useSchedule(staff, creatingStaff, onSavingChange);

  if (loadError)
    return (
      <div className="card">
        <p className="error" role="alert">
          {loadError}
        </p>
        <button
          onClick={
            /** Requests another attempt to load the schedule. */ () =>
              setRetry(
                /** Increments the reload trigger without relying on a captured counter value. */ (
                  r,
                ) => r + 1,
              )
          }
        >
          Retry loading schedule
        </button>
      </div>
    );

  if (!schedule)
    return (
      <div className="card muted" role="status">
        Loading schedule…
      </div>
    );

  return (
    <div className="workspace">
      <div className="edit-column">
        <div className="view-switch" role="group" aria-label="Schedule view">
          <button
            aria-pressed={view === "availability"}
            onClick={
              /** Shows the saved availability editors without discarding their drafts. */
              () => setView("availability")
            }
          >
            Availability settings
          </button>
          <button
            aria-pressed={view === "schedule"}
            onClick={
              /** Shows the selected staff member's confirmed appointments. */
              () => setView("schedule")
            }
          >
            Booked schedule ({schedule.appointments?.length ?? 0})
          </button>
        </div>
        {mutationError && (
          <p className="error" role="alert">
            {mutationError}
          </p>
        )}
        {saving && (
          <p className="hint" role="status">
            Saving schedule…
          </p>
        )}
        <div className="edit-column" hidden={view !== "availability"}>
          <WeeklyHoursPanel
            staff={staff}
            schedule={schedule}
            disabled={saving || creatingStaff}
            mutate={mutate}
          />
          <OverridesPanel
            schedule={schedule}
            disabled={saving || creatingStaff}
            mutate={mutate}
          />
        </div>
        <div hidden={view !== "schedule"}>
          <AppointmentAgenda
            staff={staff}
            appointments={schedule.appointments ?? []}
            saving={saving || creatingStaff}
            cancel={
              /** Removes a booking through the same serialized schedule mutation path. */
              (id) => mutate(`/appointments/${id}`, "DELETE")
            }
          />
        </div>
      </div>
      <AvailabilityPanel
        staff={staff}
        saving={saving || creatingStaff}
        availability={availability}
        book={
          /** Commits a booking and invalidates all previous availability results. */
          (input) => mutate("/appointments", "POST", input)
        }
      />
    </div>
  );
}
