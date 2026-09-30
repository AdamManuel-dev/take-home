import { DateTime } from "luxon";
import { TIMEZONE } from "./constants.js";

/** Interpret date-only values in the scheduling zone, never the machine's local zone. */
export const calendarDate = (date: string) =>
  DateTime.fromISO(date, { zone: TIMEZONE });

/** Returns the current calendar date in the scheduling timezone for native date inputs. */
export const today = () => DateTime.now().setZone(TIMEZONE).toISODate()!;

/** Formats a date-only value without shifting it to a neighboring calendar date. */
export const dateLabel = (date: string) =>
  calendarDate(date).setLocale("en-US").toFormat("ccc, LLL d, yyyy");

/** Advances by a calendar day rather than 24 elapsed hours across DST changes. */
export const nextDate = (date: string) =>
  calendarDate(date).plus({ days: 1 }).toISODate()!;

/** Converts Luxon's Monday-one convention to the schedule's Sunday-zero convention. */
export const weekdayIndex = (date: string) => calendarDate(date).weekday % 7;
