import { useState } from "react";
import { StaffWorkspace } from "./features/schedule/staff-workspace";
import { StaffPicker } from "./features/staff/staff-picker";
import { useStaff } from "./features/staff/use-staff";
import { AppLayout } from "./layout/app-layout";

/** Coordinates staff selection and creation while keeping each staff workspace isolated. */
export function App() {
  /** Workspace save state used to prevent switching staff before save feedback arrives. */
  const [savingSchedule, setSavingSchedule] = useState(false);

  const staffState = useStaff();
  const { staff, current, loading, creating, error, load } = staffState;

  return (
    <AppLayout>
      <StaffPicker staffState={staffState} savingSchedule={savingSchedule} />{" "}
      {error && (
        <div className="error card" role="alert">
          {error}{" "}
          {staff.length === 0 && (
            <button
              onClick={
                /** Retries staff loading after a failed request. */ () =>
                  void load()
              }
            >
              Retry
            </button>
          )}
        </div>
      )}
      {current ? (
        <StaffWorkspace
          key={current.id}
          staff={current}
          creatingStaff={creating}
          onSavingChange={setSavingSchedule}
        />
      ) : (
        !loading && (
          <section className="card welcome">
            <span className="empty-symbol" aria-hidden="true">
              ＋
            </span>
            <h2>A good schedule starts with people.</h2>
            <p>
              Add a staff member above, then set their weekly hours and find
              available times.
            </p>
          </section>
        )
      )}
    </AppLayout>
  );
}
