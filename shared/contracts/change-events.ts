import { z } from "zod";
import { dateSchema, overrideInputSchema, windowsSchema } from "../schemas.js";

const idSchema = z.string().min(1);
export const utcTimestampSchema = z.iso.datetime();
const snapshotSchema = z.object({ id: idSchema, name: z.string().min(1) });
export const changeActorSchema = snapshotSchema;
export type ChangeActor = z.infer<typeof changeActorSchema>;

const normalizedWindowsSchema = windowsSchema.refine(
  (windows) =>
    windows.every(
      (window, index) => index === 0 || windows[index - 1].end < window.start,
    ),
  "Event windows must be sorted and touching windows merged",
);
const overrideValueSchema = overrideInputSchema.safeExtend({
  windows: normalizedWindowsSchema,
});
const eventFields = {
  id: idSchema,
  sequence: z.number().int().positive(),
  occurredAt: utcTimestampSchema,
  actor: changeActorSchema,
  staff: snapshotSchema,
  operation: z.enum(["created", "updated", "deleted"]),
};

/** Domain contracts have no dependency on Express, filesystem storage, or email. */
export const scheduleChangeSchema = z
  .discriminatedUnion("entityType", [
    z.object({
      ...eventFields,
      entityType: z.literal("weekly"),
      weekday: z.number().int().min(0).max(6),
      before: normalizedWindowsSchema,
      after: normalizedWindowsSchema,
    }),
    z.object({
      ...eventFields,
      entityType: z.literal("override"),
      date: dateSchema,
      before: overrideValueSchema.nullable(),
      after: overrideValueSchema.nullable(),
    }),
  ])
  .refine((event) => {
    const beforeExists =
      event.entityType === "weekly"
        ? event.before.length > 0
        : event.before !== null;
    const afterExists =
      event.entityType === "weekly"
        ? event.after.length > 0
        : event.after !== null;
    if (JSON.stringify(event.before) === JSON.stringify(event.after))
      return false;
    return event.operation === "created"
      ? !beforeExists && afterExists
      : event.operation === "deleted"
        ? beforeExists && !afterExists
        : beforeExists && afterExists;
  }, "Event operation must describe a real change in before/after values");
export type ScheduleChange = z.infer<typeof scheduleChangeSchema>;
