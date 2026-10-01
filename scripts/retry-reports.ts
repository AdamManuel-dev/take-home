/** Requeues only exhausted failed deliveries while the API is stopped. */
import { ReportStore } from "../server/reports/store.js";
import { retryExhaustedReports } from "../server/reports/delivery.js";
const [jobId, ...extra] = process.argv.slice(2);
if (extra.length)
  throw new Error("Usage: npm run reports:retry -- [report-id]");
const count = retryExhaustedReports(new ReportStore(), new Date(), jobId);
console.log(
  `Requeued ${count} exhausted recipient deliveries. Start the API to resume mock delivery.`,
);
