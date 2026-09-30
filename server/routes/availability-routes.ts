import type { Express } from "express";
import type { StaffRepository } from "../../shared/contracts/persistence.js";
import { calculateAvailability } from "../scheduling.js";

/** Registers availability endpoints against the injected repository. */
export function registerAvailabilityRoutes(
  app: Express,
  store: StaffRepository,
) {
  app.post(
    "/api/staff/:id/availability",
    /** Calculates date-grouped availability from the saved schedule and submitted query. */ (
      req,
      res,
    ) => {
      res.json(
        calculateAvailability(
          store.get(req.params.id)!,
          req.body?.start,
          req.body?.end,
          req.body?.duration,
        ),
      );
    },
  );
}
