import { useState } from "react";
import { TIMEZONE } from "../../../shared/constants";
import type { AppointmentAgendaProps } from "../../../shared/contracts/component-props";
import type { Appointment } from "../../../shared/contracts/types";
import { dateLabel } from "../../../shared/dates";
import { formatTime } from "../../../shared/time";
import { errorMessage } from "../../shared/lib/api";

/** Presents staff-scoped bookings; persistence remains in the workspace adapter. */
export function AppointmentAgenda({
  staff,
  appointments,
  saving,
  cancel,
}: AppointmentAgendaProps) {
  /** Optional inclusive lower date bound; blank includes earlier appointments. */
  const [start, setStart] = useState("");

  /** Optional inclusive upper date bound; blank includes later appointments. */
  const [end, setEnd] = useState("");

  /** Cancellation failure shown without removing the saved appointment. */
  const [error, setError] = useState("");

  /** Confirmation for the most recently canceled appointment. */
  const [message, setMessage] = useState("");

  /** Invalid ranges are explained instead of appearing to contain no bookings. */
  const invalidRange = Boolean(start && end && start > end);

  /** Filtered copies preserve the authoritative schedule order and content. */
  const visible = appointments
    .filter(
      /** Keeps appointments within both optional inclusive date bounds. */
      (appointment) =>
        (!start || appointment.date >= start) &&
        (!end || appointment.date <= end),
    )
    .sort(
      /** Sorts the agenda chronologically, including multiple appointments on one day. */
      (a, b) => a.date.localeCompare(b.date) || a.start - b.start,
    );

  /** Cancels through the shared mutation guard and displays the committed outcome. */
  async function cancelAppointment(appointment: Appointment) {
    setError("");
    setMessage("");

    try {
      await cancel(appointment.id);
      setMessage(
        `Canceled ${appointment.title}. Its time is available again when working hours allow.`,
      );
    } catch (failure) {
      setError(errorMessage(failure));
    }
  }

  return (
    <section
      className="card agenda"
      aria-label={`${staff.name}'s booked schedule`}
    >
      <div className="section-heading">
        <div>
          <span className="eyebrow">BOOKED APPOINTMENTS</span>
          <h2>{staff.name}’s schedule</h2>
        </div>
        <span className="count">{appointments.length}</span>
      </div>
      <p className="section-description">
        Confirmed appointments for this staff member. All times are
        {TIMEZONE}.
      </p>
      <div className="form-grid">
        <label>
          Schedule from
          <input
            type="date"
            value={start}
            onChange={
              /** Updates the agenda's optional lower bound. */
              (event) => setStart(event.target.value)
            }
          />
        </label>
        <label>
          Schedule through
          <input
            type="date"
            value={end}
            onChange={
              /** Updates the agenda's optional upper bound. */
              (event) => setEnd(event.target.value)
            }
          />
        </label>
      </div>
      {(start || end) && (
        <button
          className="text-button agenda-reset"
          onClick={
            /** Restores the complete schedule across all dates. */
            () => {
              setStart("");
              setEnd("");
            }
          }
        >
          Show all dates
        </button>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className="success" role="status">
          {message}
        </p>
      )}
      {invalidRange ? (
        <p className="error" role="alert">
          The end date must be on or after the start date.
        </p>
      ) : visible.length ? (
        <ul className="appointment-list">
          {visible.map(
            /** Displays a booked interval and its staff-scoped cancellation control. */
            (appointment) => (
              <li className="appointment-item" key={appointment.id}>
                <div>
                  <h3>{appointment.title}</h3>
                  <p>{dateLabel(appointment.date)}</p>
                  <strong>
                    {formatTime(appointment.start)}–
                    {formatTime(appointment.end)}
                  </strong>
                </div>
                <button
                  className="small-button danger"
                  disabled={saving}
                  aria-label={`Cancel ${appointment.title} on ${dateLabel(appointment.date)} at ${formatTime(appointment.start)}`}
                  onClick={
                    /** Requests cancellation while keeping error handling inside the agenda. */
                    () => void cancelAppointment(appointment)
                  }
                >
                  Cancel appointment
                </button>
              </li>
            ),
          )}
        </ul>
      ) : (
        <div className="results-empty">
          <h3>
            No appointments {start || end ? "in this date range" : "booked yet"}
          </h3>
          <p>
            Find an available time and book an appointment for {staff.name}.
          </p>
        </div>
      )}
    </section>
  );
}
