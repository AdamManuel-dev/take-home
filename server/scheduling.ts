import type {
  DayResult,
  Override,
  ResolvedDayWindows,
  Schedule,
  Window,
} from "../shared/contracts/types.js";
import { nextDate, weekdayIndex } from "../shared/dates.js";
import {
  availabilityQuerySchema,
  dateSchema,
  overrideInputSchema,
  windowsSchema,
} from "../shared/schemas.js";
import { parseInput } from "../shared/validation.js";

export { nextDate } from "../shared/dates.js";

/** Rejects malformed or impossible dates instead of accepting date rollover. */
export function validateDate(value: unknown): asserts value is string {
  parseInput(dateSchema, value);
}

/** Validates the duration and inclusive date range, returning at most 90 calendar dates. */
export function validateQuery(
  start: unknown,
  end: unknown,
  duration: unknown,
): string[] {
  const query = parseInput(availabilityQuerySchema, { start, end, duration });

  /** Inclusive calendar dates accumulated until the requested end date is reached. */
  const dates: string[] = [];

  for (let date = query.start; ; date = nextDate(date)) {
    dates.push(date);

    // Do not advance beyond the supported final date, 9999-12-31.
    if (date === query.end) break;
  }

  return dates;
}

/** Validates minute boundaries and rejects overlapping input while allowing touching windows. */
export function validateWindows(input: unknown): Window[] {
  /** Detached, validated windows sorted by start time after checking overlaps. */
  const windows = parseInput(windowsSchema, input);

  return windows.sort((left, right) => left.start - right.start);
}

/** Validates a date exception and enforces the window requirements of its selected mode. */
export function validateOverride(date: unknown, input: unknown): Override {
  validateDate(date);

  /** Validated mode and windows, stripped of unsupported request fields. */
  const override = parseInput(overrideInputSchema, input);

  return { date, ...override, windows: validateWindows(override.windows) };
}

/** Returns the union of overlapping or touching windows without changing the input. */
export function normalize(windows: Window[]): Window[] {
  /** Detached continuous windows built in chronological order. */
  const result: Window[] = [];

  for (/** Next source window to merge into the chronological union. */ const window of [
    ...windows,
  ].sort(
    /** Processes earlier starts first so each merge only needs the last output window. */ (
      a,
      b,
    ) => a.start - b.start,
  )) {
    /** Last continuous window, extended when the next source overlaps or touches it. */
    const previous = result.at(-1);

    if (previous && window.start <= previous.end)
      previous.end = Math.max(previous.end, window.end);
    else result.push({ ...window });
  }

  return result;
}

/** Resolves a day's effective windows before slot generation preserves their common grid. */
function resolveDayWindows(
  weekly: Window[],
  override?: Override,
): ResolvedDayWindows {
  if (!override)
    return {
      windows: normalize(weekly),
      source: weekly.length ? "weekly" : "none",
    };

  if (override.mode === "unavailable")
    return { windows: [], source: "override" };

  if (override.mode === "replace")
    return { windows: normalize(override.windows), source: "override" };

  return {
    windows: normalize([...weekly, ...override.windows]),
    source: weekly.length ? "combined" : "override",
  };
}

/** Generates duration-spaced slots that never cross an unavailable gap. */
function generateSlots(windows: Window[], duration: number): Window[] {
  /** Fitting appointment windows accumulated from normalized continuous availability. */
  const slots: Window[] = [];

  for (/** Continuous availability interval whose boundaries constrain appointment slots. */ const window of windows) {
    for (
      let minute = window.start;
      minute + duration <= window.end;
      minute += duration
    ) {
      slots.push({ start: minute, end: minute + duration });
    }
  }

  return slots;
}

/** Explains whether working hours, overrides, duration, or existing bookings prevent a slot. */
function emptyResultReason(
  windows: Window[],
  slots: Window[],
  availableSlots: Window[],
  override?: Override,
): string | undefined {
  if (availableSlots.length) return undefined;

  if (override?.mode === "unavailable")
    return "Unavailable because of a date override.";

  if (slots.length) return "All fitting slots overlap scheduled appointments.";

  if (windows.length)
    return "Available windows are too short for this appointment duration.";

  return "No recurring availability for this day.";
}

/** Resolves one day's effective windows, generates fitting slots, and explains empty results. */
function calculateDay(
  schedule: Schedule,
  date: string,
  duration: number,
  override?: Override,
): DayResult {
  /** Recurring windows selected with the Sunday-zero weekday convention in the scheduling timezone. */
  const weekly = schedule.weekly[weekdayIndex(date)];
  const { windows, source } = resolveDayWindows(weekly, override);
  const slots = generateSlots(windows, duration);

  /** Appointments for this date block overlaps but allow touching boundaries. */
  const booked = (schedule.appointments ?? []).filter(
    /** Isolates bookings to the calendar date being calculated. */
    (appointment) => appointment.date === date,
  );

  /** Keep the original duration grid and remove any slot intersecting a booking. */
  const availableSlots = slots.filter(
    /** Uses half-open interval overlap so adjacent appointments remain available. */
    (slot) =>
      !booked.some(
        /** Detects a booking occupying any part of this candidate slot. */
        (appointment) =>
          slot.start < appointment.end && slot.end > appointment.start,
      ),
  );

  return {
    date,
    source,
    mode: override?.mode,
    windows,
    slots: availableSlots,
    reason: emptyResultReason(windows, slots, availableSlots, override),
  };
}

/** Resolves overrides before generating duration-spaced slots that never cross an unavailable gap. */
export function calculateAvailability(
  schedule: Schedule,
  start: string,
  end: string,
  duration: number,
): DayResult[] {
  /** Validated inclusive dates for which the calculation must return a result. */
  const dates = validateQuery(start, end, duration);

  /** Date-indexed exceptions that avoid rescanning all overrides for each calendar date. */
  const overrides = new Map(
    schedule.overrides.map(
      /** Indexes each override by its calendar date. */
      (override) => [override.date, override],
    ),
  );

  return dates.map((date) =>
    calculateDay(schedule, date, duration, overrides.get(date)),
  );
}
