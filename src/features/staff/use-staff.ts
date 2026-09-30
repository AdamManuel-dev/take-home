import { useEffect, useState, type FormEvent } from "react";
import type { Staff } from "../../../shared/contracts/types";
import {
  staffListSchema,
  staffNameSchema,
  staffSchema,
} from "../../../shared/schemas";
import { parseInput } from "../../../shared/validation";
import { api, errorMessage } from "../../shared/lib/api";

/** Owns the staff list, selection, creation draft and request feedback. */
export function useStaff() {
  /** Saved staff identities and the setter used after loading or creating a person. */
  const [staff, setStaff] = useState<Staff[]>([]);

  /** Selected stable staff ID and its setter; names are not used as keys. */
  const [selected, setSelected] = useState("");

  /** Unsubmitted staff name and the setter bound to the creation form. */
  const [name, setName] = useState("");

  /** Initial staff-list loading state used to disable controls until data is available. */
  const [loading, setLoading] = useState(true);

  /** Staff-creation state used to prevent repeat submissions and conflicting schedule saves. */
  const [creating, setCreating] = useState(false);

  /** User-facing staff loading or creation error and its setter. */
  const [error, setError] = useState("");

  /** Loads staff identities and selects the first available record, reporting request failures. */
  async function load() {
    setLoading(true);
    setError("");

    try {
      /** Staff identities returned by the server for the selection control. */
      const list = await api("/staff", staffListSchema);
      setStaff(list);
      setSelected(list[0]?.id || "");
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  useEffect(
    /** Loads the initial staff list when the app mounts. */ () => {
      void load();
    },
    [],
  );

  /** Selected staff record supplied to the keyed schedule workspace. */
  const current = staff.find(
    /** Matches the selected stable ID to its staff record. */ (s) =>
      s.id === selected,
  );

  /** Creates a staff member, selects their workspace, and reports any failure. */
  async function createStaff(e: FormEvent) {
    e.preventDefault();
    setCreating(true);
    setError("");

    try {
      /** Persisted identity returned after successful staff creation. */
      const created = await api("/staff", staffSchema, "POST", {
        name: parseInput(staffNameSchema, name),
      });
      setStaff(
        /** Appends the new identity without discarding other staff state updates. */ (
          list,
        ) => [...list, created],
      );
      setSelected(created.id);
      setName("");
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setCreating(false);
    }
  }

  return {
    staff,
    selected,
    setSelected,
    name,
    setName,
    loading,
    creating,
    error,
    current,
    load,
    createStaff,
  };
}
