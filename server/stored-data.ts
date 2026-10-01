import { StoredDataError } from "../shared/contracts/errors.js";
import { z } from "zod";
import {
  scheduleChangeSchema,
  utcTimestampSchema,
} from "../shared/contracts/change-events.js";
import type {
  LegacyStoredData,
  StoredData,
} from "../shared/contracts/persistence.js";
import { storedDataSchema } from "../shared/schemas.js";
import { parseInput } from "../shared/validation.js";

/**
 * Validates the persistence boundary using shared domain schemas, keeping filesystem concerns
 * outside the domain. Checks identities, dates, window shapes and booking overlaps.
 * Existing bookings need not fit working hours that may have changed since booking.
 * Valid data retains its original ordering, text and legacy appointment omissions.
 */
export const storedDataV2Schema = storedDataSchema
  .extend({
    version: z.literal(2),
    reportingStartedAt: utcTimestampSchema,
    nextChangeSequence: z.number().int().positive(),
    changes: z.array(scheduleChangeSchema),
  })
  .refine(
    (data) =>
      data.changes.every(
        (event, index) =>
          event.sequence === index + 1 &&
          Date.parse(event.occurredAt) >= Date.parse(data.reportingStartedAt),
      ) &&
      data.nextChangeSequence === data.changes.length + 1 &&
      new Set(data.changes.map((event) => event.id)).size ===
        data.changes.length,
    "Invalid change history sequence, identity, or reporting baseline",
  );

export function parseStoredData(input: unknown): LegacyStoredData | StoredData {
  try {
    return input &&
      typeof input === "object" &&
      "version" in input &&
      input.version === 2
      ? parseInput(storedDataV2Schema, input)
      : parseInput(storedDataSchema, input);
  } catch (error) {
    throw new StoredDataError(error);
  }
}
