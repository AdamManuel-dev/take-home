import { useState, type FormEvent } from "react";
import type {
  DraftWindow,
  Override,
  OverrideMode,
  ScheduleMutation,
} from "../../../shared/contracts/types";
import { dateLabel, today } from "../../../shared/dates";
import { overrideSchema } from "../../../shared/schemas";
import { parseInput } from "../../../shared/validation";
import { errorMessage } from "../../shared/lib/api";
import { draftWindows, parseWindows } from "../../shared/lib/windows";

/** Owns override drafts and keeps save/removal feedback tied to completed operations. */
export function useOverrideEditor(mutate: ScheduleMutation) {
  /** Calendar date targeted by the draft override and its setter. */
  const [date, setDate] = useState(today);

  /** Draft override mode determining whether windows are required or omitted. */
  const [mode, setMode] = useState<OverrideMode>("unavailable");

  /** Unsaved editable window strings, retained when the mode temporarily hides them. */
  const [windows, setWindows] = useState<DraftWindow[]>([
    { start: "09:00", end: "17:00" },
  ]);

  /** Validation or persistence error from the most recent override operation. */
  const [error, setError] = useState("");

  /** Success feedback for the most recent completed override save or removal. */
  const [status, setStatus] = useState("");

  /** Whether the override form contains an edited draft awaiting an explicit save. */
  const [editing, setEditing] = useState(false);

  /** Marks the override draft as edited and clears previous success feedback. */
  function change() {
    setStatus("");
    setEditing(true);
  }

  /** Validates draft time strings and saves the date exception without claiming failed writes succeeded. */
  async function saveOverride(e: FormEvent) {
    e.preventDefault();
    setError("");
    setStatus("");

    try {
      await mutate(
        `/overrides/${date}`,
        "PUT",
        parseInput(overrideSchema, {
          date,
          mode,
          windows: mode === "unavailable" ? [] : parseWindows(windows),
        }),
      );
      setStatus(`Override saved for ${dateLabel(date)}.`);
      setEditing(false);
    } catch (error) {
      setError(errorMessage(error));
    }
  }

  /** Loads a saved override into the draft form without immediately changing persisted data. */
  function editOverride(override: Override) {
    setDate(override.date);
    setMode(override.mode);
    setWindows(
      draftWindows(
        override.windows.length
          ? override.windows
          : [{ start: 540, end: 1020 }],
      ),
    );
    setStatus("");
    setError("");
    setEditing(true);
  }

  /** Deletes the saved exception and reports that recurring hours apply again. */
  async function removeOverride(override: Override) {
    setError("");
    setStatus("");

    try {
      await mutate(`/overrides/${override.date}`, "DELETE");
      setStatus(
        `Override removed for ${dateLabel(override.date)}. Weekly hours restored.`,
      );
    } catch (error) {
      setError(errorMessage(error));
    }
  }

  return {
    date,
    setDate,
    mode,
    setMode,
    windows,
    setWindows,
    error,
    status,
    editing,
    change,
    saveOverride,
    editOverride,
    removeOverride,
  };
}
