import { ReportStore } from "./reports/store.js";
import { ReportDelivery } from "./reports/delivery.js";
import { FileCaptureMailer } from "./reports/mail.js";
import { pdfReportRenderer } from "./reports/pdf.js";
import { ReportingService } from "./reports/service.js";
import { cronScheduler } from "./reports/scheduler.js";
import { AccountStore } from "./auth/accounts.js";
import { AuthService } from "./auth/service.js";
import { createApp } from "./app.js";
import { Store } from "./store.js";

/** Local API listening port, optionally overridden through the environment. */
const port = Number(process.env.PORT || 3001);

const store = new Store();
const accounts = new AccountStore((id) => Boolean(store.get(id)));
const allowedOrigins = process.env.APP_ORIGIN
  ? [new URL(process.env.APP_ORIGIN).origin]
  : process.env.NODE_ENV === "production"
    ? []
    : [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        `http://127.0.0.1:${port}`,
      ];

let reporting: ReportingService | undefined;
if (process.env.REPORTING_ENABLED !== "false") {
  const reports = new ReportStore();
  const delivery = new ReportDelivery(
    reports,
    accounts,
    pdfReportRenderer,
    new FileCaptureMailer(),
  );
  reporting = new ReportingService(store, reports, delivery, cronScheduler);
}

const app = createApp(
  store,
  {
    service: new AuthService(accounts),
    allowedOrigins,
    secureCookies: process.env.NODE_ENV === "production",
  },
  reporting,
);

reporting?.start();

const server = app.listen(
  port,
  "127.0.0.1",

  /** Reports the local URL after the HTTP server has started. */ () =>
    console.log(`Open Hours API: http://127.0.0.1:${port}`),
);

let shuttingDown = false;
async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  const closed = new Promise<void>((resolve) => server.close(() => resolve()));
  const drained = reporting ? await reporting.stop(5000) : true;
  server.closeAllConnections();
  await closed;
  if (!drained)
    console.error(
      "Reporting shutdown drain did not complete; unfinished deliveries will recover on startup",
    );
  process.exit(drained ? 0 : 1);
}
process.once("SIGINT", () => void shutdown());
process.once("SIGTERM", () => void shutdown());
server.once("error", (error) => {
  console.error(error);
  void (reporting?.stop(0) ?? Promise.resolve()).finally(() => process.exit(1));
});
