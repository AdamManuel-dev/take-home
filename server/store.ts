import {
  changeActorSchema,
  type ChangeActor,
} from "../shared/contracts/change-events.js";
import { scheduleSchema } from "../shared/schemas.js";
import { scheduleChanges } from "./reports/changes.js";
import { randomUUID } from "node:crypto";
import {
  existsSync,
  copyFileSync,
  constants,
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
    private now: () => Date = () => new Date(),
  ) {
    mkdirSync(dirname(path), { recursive: true });
    const existing = existsSync(path);
    const loaded = existing
      ? parseStoredData(JSON.parse(readFileSync(path, "utf8")))
      : undefined;
    if (loaded?.version === 2) {
      this.data = loaded;
    } else {
      const backup = `${path}.v1.bak`;
      if (loaded) {
        if (existsSync(backup)) {
          if (!readFileSync(backup).equals(readFileSync(path))) {
            throw new Error(
              "Migration backup differs from source; restore or archive it before retrying",
            );
          }
        } else {
          copyFileSync(path, backup, constants.COPYFILE_EXCL);
        }
      }
      this.data = {
        version: 2,
        staff: loaded?.staff ?? [],
        reportingStartedAt: now().toISOString(),
        nextChangeSequence: 1,
        changes: [],
      };
      this.commit(this.data);
    }
  }

  reportingSnapshot() {
    return structuredClone({
      reportingStartedAt: this.data.reportingStartedAt,
      changes: this.data.changes,
    });
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
  private commit(value: StoredData) {
    const data = parseStoredData(value);
    if (data.version !== 2) throw new Error("Expected schedule version 2");
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
  update(
    id: string,
    change: (staff: StaffRecord) => void,
    actor?: ChangeActor,
  ): Schedule {
    /** Working copy kept separate from committed state until the file write succeeds. */
    const data = structuredClone(this.data);

    /** Existing record to mutate; callers must check that the ID exists before updating. */
    const staff = data.staff.find(
      /** Finds the selected record inside the detached working copy. */ (
        item,
      ) => item.id === id,
    )!;
    if (!staff) throw new Error("Unknown staff");
    const before = structuredClone(staff);
    change(staff);
    if (staff.id !== before.id || staff.name !== before.name)
      throw new Error("Schedule edits cannot change staff identity");
    scheduleSchema.parse(staff);
    const changes = scheduleChanges(before, staff);
    if (changes.length) {
      const trustedActor = changeActorSchema.parse(actor);
      const occurredAt = this.now().toISOString();
      for (const event of changes)
        data.changes.push({
          ...event,
          id: randomUUID(),
          sequence: data.nextChangeSequence++,
          occurredAt,
          actor: trustedActor,
          staff: { id: before.id, name: before.name },
        });
    }
    this.commit(data);

    return structuredClone({
      weekly: staff.weekly,
      overrides: staff.overrides,
      appointments: staff.appointments ?? [],
    });
  }
}
