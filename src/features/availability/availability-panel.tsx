import type { AvailabilityPanelProps } from "../../../shared/contracts/component-props";
import { BookingForm } from "../appointments/booking-form";
import { useBooking } from "../appointments/use-booking";
import { AvailabilityResults } from "./availability-results";
import { AvailabilitySearchForm } from "./availability-search-form";

/** Renders saved availability search controls and date-grouped results with source explanations. */
export function AvailabilityPanel({
  staff,
  saving,
  availability,
  book,
}: AvailabilityPanelProps) {
  /** Query state and actions provided by the staff-scoped availability hook. */
  const { results, searchError, searching, resultNote } = availability;
  const booking = useBooking(staff, results, saving, book);

  return (
    <section className="card availability">
      <div className="section-heading">
        <div>
          <span className="eyebrow">03 / FIND A TIME</span>
          <h2>Available slots</h2>
        </div>
        <span className="live-dot" />
      </div>
      <p className="section-description">
        Explore {staff.name}’s saved availability, then select a time to book.
      </p>

      <AvailabilitySearchForm availability={availability} saving={saving} />
      {searchError && (
        <p className="error" role="alert">
          {searchError}
        </p>
      )}
      {booking.bookingError && (
        <p className="error" role="alert">
          {booking.bookingError}
        </p>
      )}
      {booking.bookingMessage && (
        <p className="success" role="status">
          {booking.bookingMessage}
        </p>
      )}
      <BookingForm staff={staff} booking={booking} saving={saving} />
      <AvailabilityResults
        results={results}
        selected={booking.selected}
        saving={saving}
        searching={searching}
        resultNote={resultNote}
        onSelect={booking.selectSlot}
      />
    </section>
  );
}
