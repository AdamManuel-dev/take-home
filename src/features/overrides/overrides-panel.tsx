import type { OverridesPanelProps } from "../../../shared/contracts/component-props";
import { OverrideEditor } from "./override-editor";

/** Groups saved date exceptions with their editor and shared saving guard. */
export function OverridesPanel({
  schedule,
  disabled,
  mutate,
}: OverridesPanelProps) {
  return (
    <section className="card">
      <div className="section-heading">
        <div>
          <span className="eyebrow">02 / EXCEPTIONS</span>
          <h2>Date overrides</h2>
        </div>
        <span className="count">{schedule.overrides.length}</span>
      </div>
      <p className="section-description">
        A day off, different hours, or a little extra availability.
      </p>
      <fieldset disabled={disabled} className="plain-fieldset">
        <OverrideEditor overrides={schedule.overrides} mutate={mutate} />
      </fieldset>
    </section>
  );
}
