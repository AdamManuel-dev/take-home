import type { Express } from "express";
import {
  reportSettingsInputSchema,
  type ReportSettingsController,
} from "../../shared/contracts/report-settings.js";
import { parseInput } from "../../shared/validation.js";
import { sessionProfile } from "../auth/http.js";

export function registerReportSettingsRoutes(
  app: Express,
  settings?: ReportSettingsController,
) {
  app.use("/api/report-settings", (_req, res, next) => {
    if (sessionProfile(res).role !== "manager") {
      res.status(403).json({ error: "Permission denied" });
      return;
    }
    if (!settings) {
      res.status(503).json({ error: "Reporting is disabled" });
      return;
    }
    next();
  });
  app.get("/api/report-settings", (_req, res) =>
    res.json(settings!.getSettings()),
  );
  app.put("/api/report-settings", (req, res) => {
    const input = parseInput(reportSettingsInputSchema, req.body);
    res.json(settings!.updateSettings(input.localTime));
  });
}
