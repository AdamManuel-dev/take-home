import { z } from "zod";
import { ERROR_MESSAGES } from "../../../shared/contracts/errors";
import type { DraftWindow, Window } from "../../../shared/contracts/types";
import { windowsSchema } from "../../../shared/schemas";
import { formatTime } from "../../../shared/time";
import { parseInput } from "../../../shared/validation";

/** Strict 24-hour time text; only end boundaries may use the 24:00 sentinel. */
const timeSchema = z.iso.time({
  precision: -1,
  error: ERROR_MESSAGES.invalidTime,
});

const draftWindowSchema = z.object({
  start: timeSchema,
  end: z.union([timeSchema, z.literal("24:00")]),
});

/** Validated hour and minute components become minutes after midnight, not instants. */
function timeToMinutes(value: string): number {
  const [hours, minutes] = value.split(":").map(Number);

  return hours * 60 + minutes;
}

/** Converts saved minute boundaries into editable HH:MM strings. */
export const draftWindows = (windows: Window[]) =>
  windows.map(
    /** Formats both boundaries of a single saved interval. */ (w) => ({
      start: formatTime(w.start),
      end: formatTime(w.end),
    }),
  );

/** Parses editable times and shares boundary and overlap validation with the server. */
export function parseWindows(windows: DraftWindow[]): Window[] {
  const drafts = parseInput(z.array(draftWindowSchema), windows);
  const parsed = drafts.map(
    /** Parses each draft interval while applying different start and end boundary rules. */ ({
      start,
      end,
    }) => {
      return { start: timeToMinutes(start), end: timeToMinutes(end) };
    },
  );

  return parseInput(windowsSchema, parsed);
}
