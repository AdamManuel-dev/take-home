import { z } from "zod";

export const roleSchema = z.enum(["user", "manager"]);
export type Role = z.infer<typeof roleSchema>;

const identitySchema = z.string().trim().min(1).max(100);

/** An allowlist: parsing an account strips credentials and other private fields. */
export const accountProfileSchema = z
  .object({
    id: identitySchema,
    username: identitySchema,
    displayName: identitySchema,
    role: roleSchema,
    staffId: identitySchema.optional(),
  })
  .refine((profile) => profile.role === "manager" || Boolean(profile.staffId), {
    message: "Users must be linked to a staff member",
    path: ["staffId"],
  });

export type AccountProfile = z.infer<typeof accountProfileSchema>;

export const loginInputSchema = z.object({
  username: identitySchema,
  password: z.string().min(1).max(1024),
});

export const sessionResponseSchema = z.object({
  profile: accountProfileSchema,
  csrfToken: z.string().min(1),
});
export type SessionResponse = z.infer<typeof sessionResponseSchema>;

/** Pure policy shared with UI; the API must independently enforce every operation. */
export function canEditSchedule(profile: AccountProfile, staffId: string) {
  return profile.role === "manager" || profile.staffId === staffId;
}

export function isManager(profile: AccountProfile) {
  return profile.role === "manager";
}

export const PERMISSIONS = {
  readSchedules: "authenticated",
  searchAvailability: "authenticated",
  editWeekly: "owner-or-manager",
  editOverrides: "owner-or-manager",
  createAppointment: "owner-or-manager",
  cancelAppointment: "owner-or-manager",
  createStaff: "manager",
  receiveReport: "manager",
  manageReportTime: "manager",
} as const;
