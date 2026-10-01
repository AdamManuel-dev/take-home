import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  reportSettingsSchema,
  reportTimeSchema,
  type ReportSettings,
} from "../../../shared/contracts/report-settings";
import { ApiError } from "../../../shared/contracts/errors";
import { parseInput } from "../../../shared/validation";
import { api, errorMessage } from "../../shared/lib/api";

/** Manager-only editor mounted inside the keyed account workspace. */
export function ReportSettingsPanel() {
  const [settings, setSettings] = useState<ReportSettings | null>(null);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [retry, setRetry] = useState(0);
  const mounted = useRef(false),
    savingRef = useRef(false);
  useEffect(() => {
    mounted.current = true;
    let active = true;
    setLoading(true);
    setError("");
    setUnavailable(false);
    void api("/report-settings", reportSettingsSchema)
      .then((value) => {
        if (active) {
          setSettings(value);
          setDraft(value.localTime);
        }
      })
      .catch((failure) => {
        if (!active) return;
        if (failure instanceof ApiError && failure.status === 503)
          setUnavailable(true);
        else setError(errorMessage(failure));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      mounted.current = false;
    };
  }, [retry]);
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!settings || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const localTime = parseInput(reportTimeSchema, draft);
      const saved = await api("/report-settings", reportSettingsSchema, "PUT", {
        localTime,
        timezone: settings.timezone,
      });
      if (!mounted.current) return;
      setSettings(saved);
      setDraft(saved.localTime);
      setMessage(
        `Saved. Reports will run at ${saved.localTime} ${saved.timezone}, starting with the next occurrence.`,
      );
    } catch (failure) {
      if (mounted.current) setError(errorMessage(failure));
    } finally {
      savingRef.current = false;
      if (mounted.current) setSaving(false);
    }
  }
  return (
    <section
      className="card report-settings"
      aria-labelledby="report-settings-heading"
    >
      <div>
        <h2 id="report-settings-heading">Daily PDF reports</h2>
        <p className="hint">
          One shared report time for all active Managers. Email delivery is
          mocked; reports are saved locally.
        </p>
      </div>
      {loading ? (
        <p role="status">Loading report settings…</p>
      ) : unavailable ? (
        <p className="hint">Daily reporting is disabled on this server.</p>
      ) : settings ? (
        <form onSubmit={(event) => void save(event)}>
          <label htmlFor="report-time">Report time ({settings.timezone})</label>
          <div className="inline-form">
            <input
              id="report-time"
              type="time"
              step={60}
              required
              disabled={saving}
              value={draft}
              onChange={(event) => {
                setDraft(event.target.value);
                setMessage("");
              }}
            />
            <button
              className="secondary"
              disabled={saving || draft === settings.localTime}
            >
              {saving ? "Saving report time…" : "Save report time"}
            </button>
          </div>
          <p className="hint">
            Current report time: {settings.localTime}. Saving does not send a
            report immediately.
          </p>
        </form>
      ) : (
        <button
          className="secondary"
          onClick={() => setRetry((value) => value + 1)}
        >
          Retry report settings
        </button>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className="success" role="status">
          {message}
        </p>
      )}
    </section>
  );
}
