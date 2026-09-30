import { useEffect, useRef, useState, type FormEvent } from "react";
import type { DayResult } from "../../../shared/contracts/types";
import { today } from "../../../shared/dates";
import {
  availabilityQuerySchema,
  availabilityResultsSchema,
} from "../../../shared/schemas";
import { parseInput } from "../../../shared/validation";
import { api, errorMessage } from "../../shared/lib/api";

// Request versions prevent old responses from repopulating invalidated results.
/** Owns availability queries and uses request versions to ignore obsolete search responses. */
export function useAvailability(staffId: string) {
  /** Draft search parameters and their setter, initially targeting today for 30 minutes. */
  const [query, setQuery] = useState(
    /** Computes the initial date range once when the hook mounts. */ () => ({
      start: today(),
      end: today(),
      duration: 30,
    }),
  );

  /** Latest accepted date results, or null while absent or invalidated. */
  const [results, setResults] = useState<DayResult[] | null>(null);

  /** User-facing error for the current availability search. */
  const [searchError, setSearchError] = useState("");

  /** Pending state for the current search, used to disable repeat submission. */
  const [searching, setSearching] = useState(false);

  /** Placeholder explanation shown when no current results are available. */
  const [resultNote, setResultNote] = useState(
    "Choose a date range to find available appointment times.",
  );

  /** Monotonically increasing version that identifies which search response is still relevant. */
  const searchVersion = useRef(0);

  useEffect(
    /** Registers cleanup to invalidate outstanding responses when the staff scope changes. */
    () =>
      /** Makes responses from an unmounted or previous staff scope obsolete. */ () => {
        searchVersion.current++;
      },
    [staffId],
  );

  /** Clears stale results and increments the version before query or schedule changes. */
  function invalidate(note: string) {
    searchVersion.current++;
    setResults(null);
    setSearching(false);
    setSearchError("");
    setResultNote(note);
  }

  /** Submits the current query and updates the interface only if its response is still current. */
  async function search(e: FormEvent) {
    e.preventDefault();

    /** Captured request version used to discard responses superseded by later changes. */
    const version = ++searchVersion.current;
    setSearching(true);
    setSearchError("");
    setResults(null);

    try {
      /** Date results returned for this request, accepted only if its version is still current. */
      const data = await api(
        `/staff/${staffId}/availability`,
        availabilityResultsSchema,
        "POST",
        parseInput(availabilityQuerySchema, query),
      );

      if (version === searchVersion.current) setResults(data);
    } catch (error) {
      if (version === searchVersion.current)
        setSearchError(errorMessage(error));
    } finally {
      if (version === searchVersion.current) setSearching(false);
    }
  }

  return {
    query,
    setQuery,
    results,
    searchError,
    searching,
    resultNote,
    setResultNote,
    invalidate,
    search,
  };
}
