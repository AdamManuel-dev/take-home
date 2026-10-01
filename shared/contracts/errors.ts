/** A readable validation failure shared by forms and the HTTP error boundary. */
export class ValidationError extends Error {}

/** Signals that a previously offered slot is no longer bookable. */
export class BookingConflictError extends Error {
  constructor() {
    super(
      "This time is no longer available. Search again and choose an available slot.",
    );
  }
}

/** Prevents competing mutations before React has rendered disabled controls. */
export class OperationInProgressError extends Error {
  constructor() {
    super("Please wait for the current operation to finish.");
  }
}

/** API failures carry readable feedback without exposing transport implementation details. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
  }
}

export const API_ERROR_MESSAGES = {
  unreachable:
    "Unable to reach the server. Check your connection and try again.",
  unexpectedResponse:
    "The server returned an unexpected response. Please try again.",
  requestFailed: "Request failed. Please try again.",
} as const;

/** Invalid saved data stops startup and retains the underlying cause for diagnosis. */
export class StoredDataError extends Error {
  constructor(cause: unknown) {
    super(
      `Invalid schedule data file: ${cause instanceof Error ? cause.message : "Malformed schedule records."}`,
      { cause },
    );
  }
}

/** A test server must bind a TCP address before the browser can access it. */
export class TestServerAddressError extends Error {
  constructor() {
    super("Missing test server port.");
  }
}

/** Shared validation and HTTP feedback; wording stays consistent across boundaries. */
export const ERROR_MESSAGES = {
  invalidDateFormat: "Enter a real calendar date in YYYY-MM-DD format.",
  invalidDate: "Enter a real calendar date.",
  unsupportedDuration: "Duration must be 15, 30, 45, or 60 minutes.",
  reversedWindow: "Window times must have start before end.",
  tooManyWindows: "Provide an array of at most 96 availability windows.",
  overlappingWindows:
    "Windows cannot overlap or duplicate each other. Touching windows are allowed.",
  unavailableWithWindows: "Unavailable overrides must have no windows.",
  missingOverrideWindows: "Add and replace overrides need at least one window.",
  reversedRange: "Start date must be on or before end date.",
  rangeTooLong: "Choose a range of at most 90 dates.",
  invalidStaffName: "Enter a staff name of 1 to 100 characters.",
  invalidAppointmentTitle: "Enter an appointment title of 1 to 100 characters.",
  invalidAppointmentStart:
    "Appointment start must be a whole minute within the day.",
  blankText: "Expected a nonblank string.",
  duplicateAppointmentIds: "Appointment IDs must be unique per staff member.",
  overlappingAppointments: "Appointments cannot overlap on the same day.",
  invalidWeek: "Weekly hours must contain exactly seven weekday arrays.",
  duplicateOverrideDates: "Override dates must be unique per staff member.",
  duplicateStaffIds: "Staff IDs must be unique.",
  invalidTime: "Enter times in HH:MM format. Use 24:00 only for an end time.",
  invalidWeekday: "Weekday must be an integer from 0 (Sunday) to 6 (Saturday).",
  staffNotFound: "Staff member not found.",
  appointmentNotFound: "Appointment not found for this staff member.",
  routeNotFound: "API route not found.",
  persistenceFailed: "Could not save or load data. Please try again.",
  unexpected: "Something went wrong.",
} as const;
