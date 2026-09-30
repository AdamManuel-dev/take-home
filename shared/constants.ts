/** Single scheduling timezone used for display and the default query date. */
export const TIMEZONE = "America/Chicago";

/** Weekday labels indexed from Sunday = 0 through Saturday = 6. */
export const WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

/** Appointment lengths supported by both the interface and server validation. */
export const DURATIONS = [15, 30, 45, 60] as const;
