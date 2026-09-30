import { randomUUID } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, resolve } from "node:path";
import type {
  StaffRecord,
  StaffRepository,
  StoredData,
} from "../shared/contracts/persistence.js";
import type { Schedule, Staff } from "../shared/contracts/types.js";
import { parseStoredData } from "./stored-data.js";

// Synchronous mutations keep each read-modify-write operation serialized in one Node process.
export class Store implements StaffRepository {
  private data: StoredData;

  /** Loads existing JSON data or starts empty; unsupported versions stop startup rather than reset data. */
  constructor(
    private path = resolve(process.env.DATA_FILE || "data/schedules.json"),
  ) {
    mkdirSync(dirname(path), { recursive: true });
    this.data = existsSync(path)
      ? parseStoredData(JSON.parse(readFileSync(path, "utf8")))
      : { version: 1, staff: [] };
  }

  /** Lists stable staff identities without exposing mutable schedule records. */
  list(): Staff[] {
    return this.data.staff.map(
      /** Projects each stored record into the public staff identity shape. */ ({
        id,
        name,
      }) => ({ id, name }),
    );
  }

  /** Returns a defensive copy so callers cannot mutate committed state through a read. */
  get(id: string): StaffRecord | undefined {
    return structuredClone(
      this.data.staff.find(
        /** Matches the requested stable staff ID. */ (item) => item.id === id,
      ),
    );
  }

  /** Replaces the data file through a same-directory rename, then publishes the committed memory state. */
  private commit(data: StoredData) {
    /** Unique sibling file used to prepare a complete replacement before renaming it. */
    const temporary = `${this.path}.${randomUUID()}.tmp`;

    try {
      writeFileSync(temporary, JSON.stringify(data, null, 2), {
        encoding: "utf8",
        mode: 0o600,
      });
      renameSync(temporary, this.path);
    } catch (error) {
      try {
        rmSync(temporary, { force: true });
      } catch {
        // Preserve the original write failure if cleanup also fails.
      }

      throw error;
    }

    this.data = data;
  }

  /** Persists a new UUID-backed staff record with seven independent empty weekdays. */
  create(name: string): Staff {
    /** New record with an empty weekly schedule and no date exceptions. */
    const staff = {
      id: randomUUID(),
      name,
      weekly: Array.from(
        { length: 7 },
        /** Creates a separate empty window array for each weekday. */ () => [],
      ),
      overrides: [],
      appointments: [],
    };
    this.commit({ ...this.data, staff: [...this.data.staff, staff] });

    return { id: staff.id, name };
  }

  /** Applies a change to a cloned existing record so write failures preserve committed memory. */
  update(id: string, change: (staff: StaffRecord) => void): Schedule {
    /** Working copy kept separate from committed state until the file write succeeds. */
    const data = structuredClone(this.data);

    /** Existing record to mutate; callers must check that the ID exists before updating. */
    const staff = data.staff.find(
      /** Finds the selected record inside the detached working copy. */ (
        item,
      ) => item.id === id,
    )!;
    change(staff);
    this.commit(data);

    return structuredClone({
      weekly: staff.weekly,
      overrides: staff.overrides,
      appointments: staff.appointments ?? [],
    });
  }
}
