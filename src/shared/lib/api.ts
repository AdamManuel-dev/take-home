import { expireSession, sessionSnapshot } from "../../features/auth/session";
import { z } from "zod";
import {
  API_ERROR_MESSAGES,
  ApiError,
  ERROR_MESSAGES,
} from "../../../shared/contracts/errors";

// Keep transport details outside the presentation components.
/** Sends a JSON API request and converts transport, response-format, and server errors into readable failures. */
export async function api<T>(
  path: string,
  schema: z.ZodType<T>,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const auth = sessionSnapshot();
  let response: Response;

  try {
    response = await fetch(`/api${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(auth.csrfToken ? { "X-CSRF-Token": auth.csrfToken } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(API_ERROR_MESSAGES.unreachable);
  }

  if (auth.generation !== sessionSnapshot().generation)
    throw new ApiError("This request belongs to a previous session.");
  if (response.status === 401) expireSession(auth.generation);

  let data: unknown;

  try {
    data = await response.json();
  } catch {
    throw new ApiError(API_ERROR_MESSAGES.unexpectedResponse);
  }

  if (auth.generation !== sessionSnapshot().generation)
    throw new ApiError("This request belongs to a previous session.");

  if (!response.ok) {
    /** Server-provided error text when available, otherwise a safe fallback message. */
    const error = z.object({ error: z.string() }).safeParse(data);
    const message = error.success
      ? error.data.error
      : API_ERROR_MESSAGES.requestFailed;
    throw new ApiError(message, response.status);
  }

  const result = schema.safeParse(data);

  if (!result.success)
    throw new ApiError(API_ERROR_MESSAGES.unexpectedResponse);

  return result.data;
}

/** Extracts readable feedback from a caught value without assuming it is an Error instance. */
export const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : ERROR_MESSAGES.unexpected;
