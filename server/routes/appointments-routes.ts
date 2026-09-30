import type { Express } from "express";
import { randomUUID } from "node:crypto";
import { ERROR_MESSAGES } from "../../shared/contracts/errors.js";
import type { StaffRepository } from "../../shared/contracts/persistence.js";
import { validateAppointment } from "../appointments.js";

/** Registers appointments endpoints against the injected repository. */
export function registerAppointmentsRoutes(
  app: Express,
  store: StaffRepository,
) {
  app.post(
    "/api/staff/:id/appointments",
    /** Checks current availability and persists the booking in one serialized update. */ (
      req,
      res,
    ) => {
      res.status(201).json(
        store.update(
          req.params.id,
          /** Validates against the working copy so simultaneous bookings cannot both succeed. */ (
            staff,
          ) => {
            /** Valid booking details checked against the latest committed staff schedule. */
            const appointment = validateAppointment(staff, req.body);
            staff.appointments = [
              ...(staff.appointments ?? []),
              { id: randomUUID(), ...appointment },
            ];
          },
        ),
      );
    },
  );

  app.delete(
    "/api/staff/:id/appointments/:appointmentId",
    /** Cancels a booking for the selected staff member and restores eligible slots. */ (
      req,
      res,
    ) => {
      /** Existing booking lookup scoped to the requested staff ID. */
      const staff = store.get(req.params.id)!;

      if (
        !(staff.appointments ?? []).some(
          /** Matches a booking by stable identity within this staff schedule. */ (
            appointment,
          ) => appointment.id === req.params.appointmentId,
        )
      ) {
        res.status(404).json({ error: ERROR_MESSAGES.appointmentNotFound });

        return;
      }

      res.json(
        store.update(
          req.params.id,
          /** Removes only the selected booking without changing recurring hours or overrides. */ (
            record,
          ) => {
            record.appointments = (record.appointments ?? []).filter(
              /** Keeps every appointment except the cancelled identity. */ (
                appointment,
              ) => appointment.id !== req.params.appointmentId,
            );
          },
        ),
      );
    },
  );
}
