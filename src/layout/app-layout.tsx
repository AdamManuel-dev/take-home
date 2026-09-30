import { TIMEZONE } from "../../shared/constants";
import type { AppLayoutProps } from "../../shared/contracts/component-props";

/** Shared page chrome; feature state belongs to the children. */
export function AppLayout({ children }: AppLayoutProps) {
  return (
    <>
      {" "}
      <header className="site-header">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            o<span>h</span>
          </span>
          <span>
            open hours
            <span className="brand-subtitle">AVAILABILITY STUDIO</span>
          </span>
        </div>
        <div className="timezone">
          <span aria-hidden="true">◎</span> {TIMEZONE}
        </div>
      </header>
      <main>
        {" "}
        <div className="page-heading">
          <div>
            <span className="eyebrow">
              LESS COORDINATION. MORE POSSIBILITY.
            </span>
            <h1>Make time work.</h1>
            <p>Build a weekly rhythm. Leave room for exceptions.</p>
          </div>
          <span className="local-badge">
            <span className="live-dot" /> Saved locally
          </span>
        </div>
        {children}{" "}
        <footer>
          <span>
            Open Hours <span className="footer-dot">/</span> A simpler way to
            plan
          </span>
          <span>
            Local calendar times · Booked appointments block availability
          </span>
        </footer>
      </main>
    </>
  );
}
