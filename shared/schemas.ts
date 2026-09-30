import { z } from "zod";
import { DURATIONS } from "./constants.js";
import { ERROR_MESSAGES } from "./contracts/errors.js";
import type { Window } from "./contracts/types.js";
import { calendarDate } from "./dates.js";

/** Rejects malformed or impossible dates instead of accepting date rollover. */
export const dateSchema = z.iso
  .date({ error: ERROR_MESSAGES.invalidDateFormat })
  .refine((date) => date >= "0001-01-01", ERROR_MESSAGES.invalidDate);

/** Appointment lengths supported by both the interface and server validation. */
export const durationSchema = z
  .number()
  .refine(
    (duration) => DURATIONS.some((supported) => supported === duration),
    ERROR_MESSAGES.unsupportedDuration,
  );

/** Whole-minute boundaries within one day; 24:00 is allowed only at the end. */
export const windowSchema = z
  .object({
    start: z.number().int().min(0).max(1439),
    end: z.number().int().min(1).max(1440),
  })
  .refine((window) => window.start < window.end, ERROR_MESSAGES.reversedWindow);

/** Check a detached sorted copy so persistence validation preserves original ordering. */
function hasNoOverlaps(windows: Window[]) {
  const sorted = [...windows].sort((left, right) => left.start - right.start);

  return sorted.every(
    (window, index) => index === 0 || window.start >= sorted[index - 1].end,
  );
}

/** Rejects overlapping input while allowing touching windows. */
export const windowsSchema = z
  .array(windowSchema)
  .max(96, ERROR_MESSAGES.tooManyWindows)
  .refine(hasNoOverlaps, ERROR_MESSAGES.overlappingWindows);

/** Enforces the window requirements of the selected override mode. */
export const overrideInputSchema = z
  .object({
    mode: z.enum(["unavailable", "replace", "add"]),
    windows: windowsSchema,
  })
  .refine(
    (override) =>
      override.mode !== "unavailable" || override.windows.length === 0,
    ERROR_MESSAGES.unavailableWithWindows,
  )
  .refine(
    (override) =>
      override.mode === "unavailable" || override.windows.length > 0,
    ERROR_MESSAGES.missingOverrideWindows,
  );

export const overrideSchema = overrideInputSchema.safeExtend({
  date: dateSchema,
});

/** Validates the duration and inclusive date range, allowing at most 90 calendar dates. */
export const availabilityQuerySchema = z
  .object({
    start: dateSchema,
    end: dateSchema,
    duration: durationSchema,
  })
  .refine((query) => query.start <= query.end, ERROR_MESSAGES.reversedRange)
  .refine(
    (query) =>
      calendarDate(query.end).diff(calendarDate(query.start), "days").days < 90,
    ERROR_MESSAGES.rangeTooLong,
  );

/** Names and titles are trimmed at the request boundary before persistence. */
export const staffNameSchema = z
  .string()
  .trim()
  .min(1, ERROR_MESSAGES.invalidStaffName)
  .max(100, ERROR_MESSAGES.invalidStaffName);

export const appointmentTitleSchema = z
  .string()
  .trim()
  .min(1, ERROR_MESSAGES.invalidAppointmentTitle)
  .max(100, ERROR_MESSAGES.invalidAppointmentTitle);

/** Booking shape is checked before consulting the current offered slots. */
export const appointmentInputSchema = z
  .object({
    date: dateSchema,
    title: appointmentTitleSchema,
    start: z.number().int().min(0).max(1439),
    duration: durationSchema,
  })
  .refine(
    (appointment) => appointment.start + appointment.duration <= 1440,
    ERROR_MESSAGES.invalidAppointmentStart,
  );

/** Persisted text keeps its original whitespace while rejecting blank values. */
const storedTextSchema = z
  .string()
  .refine((text) => text.trim().length > 0, ERROR_MESSAGES.blankText);

export const staffSchema = z.object({
  id: storedTextSchema,
  name: storedTextSchema.max(100),
});

export const appointmentSchema = windowSchema
  .safeExtend({
    id: storedTextSchema,
    title: storedTextSchema.max(100),
    date: dateSchema,
  })
  .refine(
    (appointment) =>
      durationSchema.safeParse(appointment.end - appointment.start).success,
    ERROR_MESSAGES.unsupportedDuration,
  );

/** Existing bookings remain valid even if their working hours have since changed. */
const appointmentsSchema = z
  .array(appointmentSchema)
  .refine(
    (appointments) =>
      new Set(appointments.map((appointment) => appointment.id)).size ===
      appointments.length,
    ERROR_MESSAGES.duplicateAppointmentIds,
  )
  .refine((appointments) => {
    const dates = new Set(appointments.map((appointment) => appointment.date));

    return [...dates].every((date) =>
      hasNoOverlaps(
        appointments.filter((appointment) => appointment.date === date),
      ),
    );
  }, ERROR_MESSAGES.overlappingAppointments);

export const scheduleSchema = z.object({
  weekly: z.array(windowsSchema).length(7, ERROR_MESSAGES.invalidWeek),
  overrides: z
    .array(overrideSchema)
    .refine(
      (overrides) =>
        new Set(overrides.map((override) => override.date)).size ===
        overrides.length,
      ERROR_MESSAGES.duplicateOverrideDates,
    ),
  appointments: appointmentsSchema.optional(),
});

/** Legacy version-one files may omit appointments; validation does not add defaults. */
export const storedDataSchema = z.object({
  version: z.literal(1),
  staff: z
    .array(staffSchema.extend(scheduleSchema.shape))
    .refine(
      (staff) =>
        new Set(staff.map((person) => person.id)).size === staff.length,
      ERROR_MESSAGES.duplicateStaffIds,
    ),
});

/** Availability responses are checked before the client offers bookable slots. */
export const dayResultSchema = z.object({
  date: dateSchema,
  source: z.enum(["weekly", "override", "combined", "none"]),
  mode: z.enum(["unavailable", "replace", "add"]).optional(),
  windows: z.array(windowSchema),
  slots: z.array(windowSchema),
  reason: z.string().optional(),
});

export const staffListSchema = z.array(staffSchema);

export const availabilityResultsSchema = z.array(dayResultSchema);
