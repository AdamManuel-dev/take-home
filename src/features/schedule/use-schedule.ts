import { useEffect, useRef, useState } from "react";
import { OperationInProgressError } from "../../../shared/contracts/errors";
import type { Schedule, Staff } from "../../../shared/contracts/types";
import { scheduleSchema } from "../../../shared/schemas";
import { api, errorMessage } from "../../shared/lib/api";
import { useAvailability } from "../availability/use-availability";

/** Loads saved schedules and serializes all mutations for one staff workspace. */
export function useSchedule(
  staff: Staff,
  creatingStaff: boolean,
  onSavingChange: (saving: boolean) => void,
  canEdit: boolean,
) {
  /** Last loaded or successfully saved schedule, kept separate from editor drafts. */
  const [schedule, setSchedule] = useState<Schedule | null>(null);

  /** Error from loading this staff member's schedule. */
  const [loadError, setLoadError] = useState("");

  /** Shared mutation failure remains visible even when the user changes schedule views. */
  const [mutationError, setMutationError] = useState("");

  /** Retry counter that triggers a new schedule load after failure. */
  const [retry, setRetry] = useState(0);

  /** Visible mutation state used to disable editors while a save is pending. */
  const [saving, setSaving] = useState(false);

  /** Synchronous guard that prevents a second mutation before React renders the disabled state. */
  const savingRef = useRef(false);

  /** Staff-scoped availability state and stale-response safeguards. */
  const availability = useAvailability(staff.id);

  useEffect(
    /** Loads the selected schedule and ignores responses after this effect is cleaned up. */ () => {
      let active = true;
      setLoadError("");
      api(`/staff/${staff.id}/schedule`, scheduleSchema)
        .then(
          /** Accepts loaded schedule data only while its workspace remains active. */ (
            value,
          ) => {
            if (active) setSchedule(value);
          },
        )
        .catch(
          /** Reports a loading failure only while its workspace remains active. */ (
            error,
          ) => {
            if (active) setLoadError(errorMessage(error));
          },
        );

      return /** Prevents a completed load from updating an unmounted or superseded workspace. */ () => {
        active = false;
      };
    },
    [staff.id, retry],
  );

  /** Serializes schedule mutations, blocks staff navigation, and invalidates availability results. */
  async function mutate(path: string, method: string, body?: unknown) {
    if (!canEdit) throw new Error("This schedule is read-only.");
    if (savingRef.current || creatingStaff)
      throw new OperationInProgressError();

    savingRef.current = true;
    setSaving(true);
    setMutationError("");
    onSavingChange(true);
    availability.invalidate("Schedule is changing. Search again after saving.");

    try {
      /** Authoritative schedule returned only after the server successfully commits a change. */
      const updated = await api(
        `/staff/${staff.id}${path}`,
        scheduleSchema,
        method,
        body,
      );
      setSchedule(updated);
      availability.setResultNote(
        "Schedule updated. Search again to see the latest availability.",
      );
    } catch (error) {
      setMutationError(errorMessage(error));
      availability.setResultNote(
        "Save failed. Review the error and search again.",
      );
      throw error;
    } finally {
      savingRef.current = false;
      setSaving(false);
      onSavingChange(false);
    }
  }

  return {
    schedule,
    loadError,
    mutationError,
    setRetry,
    saving,
    availability,
    mutate,
  };
}
