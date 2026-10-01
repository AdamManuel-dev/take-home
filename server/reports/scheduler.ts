import cron from "node-cron";

export interface ReportScheduler {
  schedule(
    expression: string,
    timezone: string,
    callback: () => void,
  ): () => void;
}

/** Background registration belongs to the process composition root, never createApp. */
export const cronScheduler: ReportScheduler = {
  schedule(expression, timezone, callback) {
    const task = cron.schedule(expression, callback, {
      timezone,
      noOverlap: true,
    });
    return () => {
      void task.destroy();
    };
  },
};
