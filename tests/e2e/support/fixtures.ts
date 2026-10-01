import { ReportStore } from "../../../server/reports/store";
import { ReportDelivery } from "../../../server/reports/delivery";
import { CaptureMailer } from "../../../server/reports/mail";
import { pdfReportRenderer } from "../../../server/reports/pdf";
import { ReportingService } from "../../../server/reports/service";
import { AuthService } from "../../../server/auth/service";
import { AuthPage } from "./auth-page";
import { AccountStore } from "../../../server/auth/accounts";
import { testAccounts, TEST_PASSWORD } from "../../support/auth";
import { test as base, expect } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "../../../server/app";
import { Store } from "../../../server/store";
import { TestServerAddressError } from "../../../shared/contracts/errors";
import type { SchedulerFixtures } from "../../../shared/contracts/test-support";
import { SchedulerPage } from "./scheduler-page";

/** Bind an ephemeral loopback port, avoiding collisions with development servers. */
async function listen(server: Server, port = 0): Promise<number> {
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });

  const address = server.address();

  if (!address || typeof address === "string")
    throw new TestServerAddressError();

  return address.port;
}

async function close(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
    server.closeAllConnections();
  });
}

/** Exercise the production HTTP adapter and persistence without adding test-only app routes. */
export const test = base.extend<SchedulerFixtures>({
  app: async ({}, use) => {
    const directory = await mkdtemp(join(tmpdir(), "open-hours-e2e-"));
    const file = join(directory, "schedules.json");
    let reportInstant = "2026-09-30T13:00:00.000Z";
    const clock = () => new Date(reportInstant);
    let store = new Store(file, clock);
    const accounts = new AccountStore(
      (id) => Boolean(store.get(id)),
      join(directory, "users.json"),
    );
    accounts.create(testAccounts().list()[0]);
    const capture = new CaptureMailer();
    function makeReporting() {
      const reports = new ReportStore(join(directory, "reports.json"));
      const delivery = new ReportDelivery(
        reports,
        accounts,
        pdfReportRenderer,
        capture,
        clock,
      );
      const service = new ReportingService(
        store,
        reports,
        delivery,
        { schedule: () => () => {} },
        clock,
      );
      service.start();
      return { service, delivery };
    }
    let reporting = makeReporting();
    let server = createServer();

    try {
      const port = await listen(server);
      const appOptions = () => ({
        service: new AuthService(accounts),
        allowedOrigins: [`http://127.0.0.1:${port}`],
      });
      server.on("request", createApp(store, appOptions(), reporting.service));
      await use({
        baseURL: `http://127.0.0.1:${port}`,
        provisionUser(username, staffId) {
          accounts.create({
            ...testAccounts().list()[0],
            username,
            displayName: username,
            role: "user",
            staffId,
          });
        },
        async advanceReporting(instant) {
          reportInstant = instant;
          reporting.service.tick();
          await reporting.delivery.drain();
        },
        capturedReports() {
          return capture.messages.map((message) => ({
            reportId: message.reportId,
            subject: message.subject,
            to: message.to,
            filename: message.attachment.filename,
            pdfHeader: message.attachment.content.subarray(0, 5).toString(),
          }));
        },
        async restart() {
          await reporting.service.stop();
          await close(server);
          store = new Store(file, clock);
          reporting = makeReporting();
          server = createServer(
            createApp(store, appOptions(), reporting.service),
          );
          await listen(server, port);
        },
      });
    } finally {
      await reporting.service.stop();
      if (server.listening) await close(server);

      await rm(directory, { recursive: true, force: true });
    }
  },

  baseURL: async ({ app }, use) => use(app.baseURL),

  scheduler: async ({ page }, use) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));

    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Make time work." }),
    ).toBeVisible();
    await new AuthPage(page).signIn("manager", TEST_PASSWORD);
    await use(new SchedulerPage(page));

    expect(errors, "No uncaught browser errors").toEqual([]);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      "The interface fits the viewport",
    ).toBe(true);
  },
});

export { expect };
