/** Creates a separate, validated demo file without replacing existing data. */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { parseStoredData } from "../server/stored-data.js";

const path = resolve(process.env.DATA_FILE || "data/demo-schedules.json");
const data = parseStoredData({
  version: 1,
  staff: [
    {
      id: "demo-jane-smith",
      name: "Jane Smith",
      weekly: [
        [],
        [{ start: 540, end: 660 }],
        [],
        [{ start: 540, end: 1020 }],
        [{ start: 540, end: 1020 }],
        [{ start: 540, end: 600 }],
        [],
      ],
      overrides: [
        { date: "2026-05-27", mode: "unavailable", windows: [] },
        {
          date: "2026-05-28",
          mode: "replace",
          windows: [{ start: 600, end: 840 }],
        },
        {
          date: "2026-05-29",
          mode: "add",
          windows: [{ start: 1020, end: 1140 }],
        },
      ],
      appointments: [],
    },
  ],
});

try {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(data, null, 2) + "\n", {
    encoding: "utf8",
    flag: "wx",
    mode: 0o600,
  });
  console.log(`Created demo data: ${path}`);
  console.log("Use this file as DATA_FILE, then search May 25-29, 2026.");
} catch (error) {
  if ((error as NodeJS.ErrnoException).code === "EEXIST") {
    console.error(`Data already exists at ${path}. No changes made.`);
    console.error("Choose a new DATA_FILE path to create another demo.");
    process.exitCode = 1;
  } else {
    throw error;
  }
}
