import { StoredDataError } from "../shared/contracts/errors.js";
import type { StoredData } from "../shared/contracts/persistence.js";
import { storedDataSchema } from "../shared/schemas.js";
import { parseInput } from "../shared/validation.js";

/**
 * Validates the persistence boundary using shared domain schemas, keeping filesystem concerns
 * outside the domain. Checks identities, dates, window shapes and booking overlaps.
 * Existing bookings need not fit working hours that may have changed since booking.
 * Valid data retains its original ordering, text and legacy appointment omissions.
 */
export function parseStoredData(input: unknown): StoredData {
  try {
    return parseInput(storedDataSchema, input);
  } catch (error) {
    throw new StoredDataError(error);
  }
}
