import type { Express } from "express";
import { ERROR_MESSAGES } from "../../shared/contracts/errors.js";
import type { StaffRepository } from "../../shared/contracts/persistence.js";
import { staffNameSchema } from "../../shared/schemas.js";
import { parseInput } from "../../shared/validation.js";

/** Registers staff endpoints against the injected repository. */
export function registerStaffRoutes(app: Express, store: StaffRepository) {
  app.get(
    "/api/staff",
    /** Returns staff identities without exposing their schedule records. */ (
      _req,
      res,
    ) => res.json(store.list()),
  );

  app.post(
    "/api/staff",
    /** Validates and trims a name before persisting a new staff member. */ (
      req,
      res,
    ) => {
      /** Untrusted name from the request, checked before calling the repository. */
      const name = parseInput(staffNameSchema, req.body?.name);
      res.status(201).json(store.create(name.trim()));
    },
  );

  app.use(
    "/api/staff/:id",
    /** Stops staff-specific requests early when their stable ID does not exist. */ (
      req,
      res,
      next,
    ) => {
      if (!store.get(req.params.id)) {
        res.status(404).json({ error: ERROR_MESSAGES.staffNotFound });

        return;
      }

      next();
    },
  );
}
