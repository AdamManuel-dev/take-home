import type { ReportSettingsController } from "../shared/contracts/report-settings.js";
import { registerReportSettingsRoutes } from "./routes/report-settings-routes.js";
import { registerAuthentication, type AuthOptions } from "./auth/http.js";
import express from "express";
import { resolve } from "node:path";
import {
  BookingConflictError,
  ERROR_MESSAGES,
  ValidationError,
} from "../shared/contracts/errors.js";
import type { StaffRepository } from "../shared/contracts/persistence.js";
import type { HttpError } from "../shared/contracts/types.js";
import { registerAppointmentsRoutes } from "./routes/appointments-routes.js";
import { registerAvailabilityRoutes } from "./routes/availability-routes.js";
import { registerScheduleRoutes } from "./routes/schedule-routes.js";
import { registerStaffRoutes } from "./routes/staff-routes.js";

/** Builds the HTTP adapter around an injected repository without opening a listening socket. */
export function createApp(
  store: StaffRepository,
  auth: AuthOptions,
  reportSettings?: ReportSettingsController,
) {
  /** Express instance shared by the API routes and production static-file handler. */
  const app = express();
  app.disable("x-powered-by");
  app.set("case sensitive routing", true);
  app.use(express.json({ limit: "100kb" }));

  registerAuthentication(app, auth);
  registerReportSettingsRoutes(app, reportSettings);

  // Register the staff lookup guard before any staff-scoped endpoints.
  registerStaffRoutes(app, store);
  registerScheduleRoutes(app, store);
  registerAvailabilityRoutes(app, store);
  registerAppointmentsRoutes(app, store);

  app.use(
    "/api",
    /** Returns a JSON not-found error for unmatched API routes. */ (
      _req,
      res,
    ) => {
      res.status(404).json({ error: ERROR_MESSAGES.routeNotFound });
    },
  );

  app.use(express.static(resolve("dist")));

  app.use(
    /** Translates validation, parser, and persistence failures into JSON errors. */
    (
      error: HttpError,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      /** HTTP status that distinguishes invalid input from an internal failure. */
      const status =
        error instanceof BookingConflictError
          ? 409
          : error instanceof ValidationError
            ? 400
            : error.status === 400 || error.status === 413
              ? error.status
              : 500;

      if (status === 500) console.error(error);

      res.status(status).json({
        error:
          status === 500 ? ERROR_MESSAGES.persistenceFailed : error.message,
      });
    },
  );

  return app;
}
