import type { Appointment, Schedule } from "../shared/contracts/types.js";
import { appointmentInputSchema } from "../shared/schemas.js";
import { parseInput } from "../shared/validation.js";
import { calculateAvailability } from "./scheduling.js";

import { BookingConflictError } from "../shared/contracts/errors.js";

/** Validates a booking against the current schedule inside the persistence transaction. */
export function validateAppointment(
  schedule: Schedule,
  input: unknown,
): Omit<Appointment, "id"> {
  /** Untrusted booking fields checked before any schedule changes are committed. */
  const { date, title, start, duration } = parseInput(
    appointmentInputSchema,
    input,
  );

  /** Current offered slots already account for saved appointments and date overrides. */
  const [day] = calculateAvailability(schedule, date, date, duration);

  if (
    !day.slots.some(
      /** Requires an exact offered start rather than accepting arbitrary times. */ (
        slot,
      ) => slot.start === start,
    )
  ) {
    throw new BookingConflictError();
  }

  return { date, title: title.trim(), start, end: start + duration };
}
