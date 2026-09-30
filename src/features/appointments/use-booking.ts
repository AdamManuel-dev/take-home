import { useState, type FormEvent } from "react";
import type {
  AppointmentInput,
  BookingSelection,
  DayResult,
  SelectedSlot,
  Staff,
} from "../../../shared/contracts/types";
import { dateLabel } from "../../../shared/dates";
import { appointmentInputSchema } from "../../../shared/schemas";
import { formatTime } from "../../../shared/time";
import { parseInput } from "../../../shared/validation";
import { errorMessage } from "../../shared/lib/api";

/** Keeps booking drafts tied to the exact availability response that offered the slot. */
export function useBooking(
  staff: Staff,
  results: DayResult[] | null,
  saving: boolean,
  book: (input: AppointmentInput) => Promise<void>,
) {
  /** Response identity prevents selections from surviving changed queries or schedules. */
  const [selection, setSelection] = useState<BookingSelection | null>(null);

  /** Required human-readable purpose for this appointment. */
  const [title, setTitle] = useState("");

  /** Booking failures remain visible after availability has been invalidated. */
  const [bookingError, setBookingError] = useState("");

  /** Confirmation shown after the authoritative schedule is saved. */
  const [bookingMessage, setBookingMessage] = useState("");

  /** Only a slot from the currently displayed response can be submitted. */
  const selected = selection?.results === results && results ? selection : null;

  /** Books the selected interval through the workspace mutation boundary. */
  async function submitBooking(event: FormEvent) {
    event.preventDefault();

    if (!selected || saving) return;

    setBookingError("");
    setBookingMessage("");

    try {
      await book(
        parseInput(appointmentInputSchema, {
          date: selected.date,
          title: title.trim(),
          start: selected.start,
          duration: selected.end - selected.start,
        }),
      );
      setSelection(null);
      setTitle("");
      setBookingMessage(
        `Booked for ${staff.name} on ${dateLabel(selected.date)}, ${formatTime(selected.start)}–${formatTime(selected.end)}. View it in Booked schedule.`,
      );
    } catch (error) {
      setBookingError(errorMessage(error));
    }
  }

  /** Selects this response's slot without creating an appointment yet. */
  function selectSlot(slot: SelectedSlot) {
    setSelection({ ...slot, results });
    setBookingError("");
    setBookingMessage("");
  }

  return {
    selected,
    title,
    setTitle,
    bookingError,
    bookingMessage,
    submitBooking,
    selectSlot,
  };
}
