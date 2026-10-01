import { z } from "zod";
import { TIMEZONE } from "../constants.js";

export const reportTimeSchema = z
  .string()
  .regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, "Report time must use HH:mm");
export const reportSettingsSchema = z.object({
  localTime: reportTimeSchema,
  timezone: z.literal(TIMEZONE),
});
export const reportSettingsInputSchema = z
  .object({
    localTime: reportTimeSchema,
    timezone: z.literal(TIMEZONE).optional(),
  })
  .strict();
export type ReportSettings = z.infer<typeof reportSettingsSchema>;
export interface ReportSettingsController {
  getSettings(): ReportSettings;
  updateSettings(localTime: string): ReportSettings;
}
