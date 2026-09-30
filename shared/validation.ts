import { z } from "zod";

import { ValidationError } from "./contracts/errors.js";

/** Parse untrusted input without leaking Zod's full diagnostic JSON into the UI. */
export function parseInput<T>(schema: z.ZodType<T>, input: unknown): T {
  const result = schema.safeParse(input);

  if (!result.success)
    throw new ValidationError(result.error.issues[0].message);

  return result.data;
}
