import type { z } from "zod";
import type { appointmentInputSchema } from "../schemas.js";

export type Window = { start: number; end: number };

export type OverrideMode = "unavailable" | "replace" | "add";

export type Override = { date: string; mode: OverrideMode; windows: Window[] };

export type Appointment = Window & { id: string; date: string; title: string };

export type Schedule = {
  weekly: Window[][];
  overrides: Override[];
  appointments?: Appointment[];
};

export type Staff = { id: string; name: string };

export type DayResult = {
  date: string;
  source: "weekly" | "override" | "combined" | "none";
  mode?: OverrideMode;
  windows: Window[];
  slots: Window[];
  reason?: string;
};

/** Editable wall-clock fields, kept separate from validated minute boundaries. */
export type DraftWindow = { start: string; end: string };

export type AppointmentInput = z.infer<typeof appointmentInputSchema>;

export type SelectedSlot = Window & { date: string };

/** A booking selection belongs to exactly one availability response. */
export type BookingSelection = SelectedSlot & { results: DayResult[] | null };

export type ScheduleView = "availability" | "schedule";

export type ResolvedDayWindows = {
  windows: Window[];
  source: DayResult["source"];
};

/** All schedule changes pass through the workspace's serialized mutation boundary. */
export type ScheduleMutation = (
  path: string,
  method: string,
  body?: unknown,
) => Promise<void>;

export type HttpError = Error & { status?: number };
