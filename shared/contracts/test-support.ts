import type { SchedulerPage } from "../../tests/e2e/support/scheduler-page";

/** The server can reopen its saved file to verify persistence beyond a browser refresh. */
export type TestApp = {
  baseURL: string;
  restart: () => Promise<void>;
};

export type SchedulerFixtures = {
  app: TestApp;
  scheduler: SchedulerPage;
};

export type TimeWindow = readonly [start: string, end: string];
