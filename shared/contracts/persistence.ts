import type { ChangeActor, ScheduleChange } from "./change-events.js";
import type { Schedule, Staff } from "./types.js";

export type StaffRecord = Staff & Schedule;

// The HTTP layer depends on this small contract, not on filesystem persistence.
export interface StaffRepository {
  /** Lists staff identities without schedule details. */
  list(): Staff[];

  /** Returns a detached staff record, or undefined when its ID is unknown. */
  get(id: string): StaffRecord | undefined;

  /** Persists a staff member with an empty schedule and returns their stable identity. */
  create(name: string): Staff;

  /** Applies a change to an existing record and commits the full replacement atomically. */
  update(
    id: string,
    change: (staff: StaffRecord) => void,
    actor?: ChangeActor,
  ): Schedule;
}

/** Versioned on-disk envelope; legacy staff records may omit appointments. */
export type LegacyStoredData = { version: 1; staff: StaffRecord[] };

export type StoredData = {
  version: 2;
  staff: StaffRecord[];
  reportingStartedAt: string;
  nextChangeSequence: number;
  changes: ScheduleChange[];
};

export interface ChangeRepository {
  reportingSnapshot(): Pick<StoredData, "reportingStartedAt" | "changes">;
}
