import { ReportSettingsPanel } from "./features/report-settings/report-settings-panel";
import { canEditSchedule, type AccountProfile } from "../shared/contracts/auth";
import { useAuth } from "./features/auth/use-auth";
import { LoginForm } from "./features/auth/login-form";
import { useState } from "react";
import { StaffWorkspace } from "./features/schedule/staff-workspace";
import { StaffPicker } from "./features/staff/staff-picker";
import { useStaff } from "./features/staff/use-staff";
import { AppLayout } from "./layout/app-layout";

/** Coordinates staff selection and creation while keeping each staff workspace isolated. */
export function App() {
  const auth = useAuth();
  return (
    <AppLayout>
      {auth.loading ? (
        <p role="status">Checking session…</p>
      ) : auth.session ? (
        <>
          <div className="session-bar">
            <span>
              Signed in as {auth.session.profile.displayName} (
              {auth.session.profile.role === "manager" ? "Manager" : "User"})
            </span>
            <button className="secondary" onClick={() => void auth.logout()}>
              Sign out
            </button>
          </div>
          <AuthenticatedWorkspace
            key={auth.identity}
            profile={auth.session.profile}
          />
        </>
      ) : (
        <LoginForm auth={auth} />
      )}
    </AppLayout>
  );
}

function AuthenticatedWorkspace({ profile }: { profile: AccountProfile }) {
  /** Workspace save state used to prevent switching staff before save feedback arrives. */
  const [savingSchedule, setSavingSchedule] = useState(false);

  const staffState = useStaff();
  const { staff, current, loading, creating, error, load } = staffState;

  return (
    <>
      <StaffPicker
        staffState={staffState}
        savingSchedule={savingSchedule}
        canCreate={profile.role === "manager"}
      />{" "}
      {profile.role === "manager" && <ReportSettingsPanel />}
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
          canEdit={canEditSchedule(profile, current.id)}
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
              {profile.role === "manager"
                ? "Add a staff member above, then set their weekly hours and find available times."
                : "Your manager can add staff to the schedule."}
            </p>
          </section>
        )
      )}
    </>
  );
}
