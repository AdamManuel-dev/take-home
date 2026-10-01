import type { SchedulerPage } from "../../tests/e2e/support/scheduler-page";

/** The server can reopen its saved file to verify persistence beyond a browser refresh. */
export type TestApp = {
  baseURL: string;
  provisionUser: (username: string, staffId: string) => void;
  restart: () => Promise<void>;
  advanceReporting: (instant: string) => Promise<void>;
  capturedReports: () => {
    reportId: string;
    subject: string;
    to: string;
    filename: string;
    pdfHeader: string;
  }[];
};

export type SchedulerFixtures = {
  app: TestApp;
  scheduler: SchedulerPage;
};

export type TimeWindow = readonly [start: string, end: string];
