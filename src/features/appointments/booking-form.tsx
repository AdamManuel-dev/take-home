import type { BookingFormProps } from "../../../shared/contracts/component-props";
import { dateLabel } from "../../../shared/dates";
import { formatTime } from "../../../shared/time";

/** Confirms the currently selected slot without owning availability or persistence. */
export function BookingForm({ staff, booking, saving }: BookingFormProps) {
  const { selected, title, setTitle, submitBooking } = booking;

  if (!selected) return null;

  return (
    <form className="booking-form" onSubmit={submitBooking}>
      <h3>Confirm appointment for {staff.name}</h3>
      <p>
        {dateLabel(selected.date)} · {formatTime(selected.start)}–
        {formatTime(selected.end)}
      </p>
      <label>
        Appointment title
        <input
          required
          maxLength={100}
          value={title}
          disabled={saving}
          placeholder="e.g. Project consultation"
          onChange={
            /** Keeps the appointment's descriptive title in the booking draft. */
            (event) => setTitle(event.target.value)
          }
        />
      </label>
      <button className="primary" type="submit" disabled={saving}>
        {saving ? "Booking…" : "Book appointment"}
      </button>
    </form>
  );
}
