import { sessionProfile } from "../auth/http.js";
import type { Express } from "express";
import { z } from "zod";
import { ERROR_MESSAGES } from "../../shared/contracts/errors.js";
import type { StaffRepository } from "../../shared/contracts/persistence.js";
import { parseInput } from "../../shared/validation.js";
import {
  validateDate,
  validateOverride,
  validateWindows,
} from "../scheduling.js";

/** Registers schedule endpoints against the injected repository. */
export function registerScheduleRoutes(app: Express, store: StaffRepository) {
  app.get(
    "/api/staff/:id/schedule",
    /** Returns the selected staff member's saved weekly hours and date exceptions. */ (
      req,
      res,
    ) => {
      /** Saved schedule fields exposed by the schedule endpoint. */
      const {
        weekly,
        overrides,
        appointments = [],
      } = store.get(req.params.id)!;
      res.json({ weekly, overrides, appointments });
    },
  );

  app.put(
    "/api/staff/:id/weekly/:day",
    /** Validates the weekday and windows before replacing one recurring day. */ (
      req,
      res,
    ) => {
      parseInput(
        z.enum(["0", "1", "2", "3", "4", "5", "6"], {
          error: ERROR_MESSAGES.invalidWeekday,
        }),
        req.params.day,
      );

      /** Validated, chronologically sorted windows ready for persistence. */
      const windows = validateWindows(req.body?.windows);
      res.json(
        store.update(
          req.params.id,
          /** Changes only the requested weekday in the repository's working copy. */ (
            staff,
          ) => {
            staff.weekly[Number(req.params.day)] = windows;
          },
          { id: sessionProfile(res).id, name: sessionProfile(res).displayName },
        ),
      );
    },
  );

  app.put(
    "/api/staff/:id/overrides/:date",
    /** Validates and upserts the exception for one calendar date. */ (
      req,
      res,
    ) => {
      /** Validated date exception whose window requirements match its mode. */
      const override = validateOverride(req.params.date, req.body);
      res.json(
        store.update(
          req.params.id,
          /** Replaces any exception for the same date and preserves chronological ordering. */ (
            staff,
          ) => {
            staff.overrides = [
              ...staff.overrides.filter(
                /** Keeps exceptions belonging to other dates during an upsert. */ (
                  item,
                ) => item.date !== override.date,
              ),
              override,
            ].sort(
              /** Orders ISO calendar dates chronologically for consistent responses. */ (
                a,
                b,
              ) => a.date.localeCompare(b.date),
            );
          },
          { id: sessionProfile(res).id, name: sessionProfile(res).displayName },
        ),
      );
    },
  );

  app.delete(
    "/api/staff/:id/overrides/:date",
    /** Removes a date exception so recurring availability applies again. */ (
      req,
      res,
    ) => {
      validateDate(req.params.date);
      res.json(
        store.update(
          req.params.id,
          /** Removes the selected date from the repository's working copy. */ (
            staff,
          ) => {
            staff.overrides = staff.overrides.filter(
              /** Keeps exceptions whose dates do not match the deletion request. */
              (item) => item.date !== req.params.date,
            );
          },
          { id: sessionProfile(res).id, name: sessionProfile(res).displayName },
        ),
      );
    },
  );
}
