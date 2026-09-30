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
    let server = createServer(createApp(new Store(file)));

    try {
      const port = await listen(server);
      await use({
        baseURL: `http://127.0.0.1:${port}`,
        async restart() {
          await close(server);
          server = createServer(createApp(new Store(file)));
          await listen(server, port);
        },
      });
    } finally {
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
