import { expect, test } from "./support/fixtures";
import { AuthPage } from "./support/auth-page";
import { TEST_PASSWORD } from "../support/auth";

test("users can search everyone but edit only themselves, including booking controls", async ({
  scheduler,
  page,
  app,
}) => {
  const own = await scheduler.addStaff("Own staff");
  await scheduler.saveHours("Monday", [["09:00", "10:00"]]);
  const other = await scheduler.addStaff("Other staff");
  await scheduler.saveHours("Monday", [["10:00", "11:00"]]);
  app.provisionUser("user", own);
  const auth = new AuthPage(page);
  await auth.signOut();
  await auth.signIn("user", TEST_PASSWORD);
  await expect(page.getByLabel("Add someone new")).toHaveCount(0);
  await expect(page.locator("#staff option")).toHaveCount(2);
  await expect(page.getByLabel("Monday window 1 start")).toBeEnabled();
  await page.locator("#staff").selectOption(other);
  await expect(
    page.getByText("Read-only schedule.", { exact: false }),
  ).toBeVisible();
  await expect(
    scheduler.day("Monday").getByRole("button", { name: "Save", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Save override", exact: true }),
  ).toBeDisabled();
  await scheduler.search("2026-05-25");
  await expect(page.locator(".slot")).toHaveCount(2);
  await expect(page.locator(".slot").first()).toBeDisabled();
  await expect(page.getByLabel("Appointment title")).toHaveCount(0);
  await page.locator("#staff").selectOption(own);
  await scheduler.search("2026-05-25");
  await expect(page.locator(".slot").first()).toBeEnabled();
});

test("session expiry clears schedules and allows a fresh sign-in", async ({
  scheduler,
  page,
  app,
}) => {
  await scheduler.addStaff();
  await app.restart();
  await scheduler.submitSearch("2026-05-25");
  await expect(
    page.getByRole("heading", { name: "Sign in", exact: true }),
  ).toBeVisible();
  await expect(page.locator("#staff")).toHaveCount(0);
  await expect(page.getByRole("alert")).toContainText("session expired");
  await new AuthPage(page).signIn("manager", TEST_PASSWORD);
  await expect(page.locator("#staff option")).toHaveCount(1);
});

for (const status of [200, 401]) {
  test(`stale ${status} response cannot affect a replacement identity`, async ({
    scheduler,
    page,
    app,
  }) => {
    const own = await scheduler.addStaff();
    app.provisionUser("user", own);
    let release = () => {};
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let received = false;
    await page.route("**/availability", async (route) => {
      received = true;
      await gate;
      await route.fulfill({
        status,
        json:
          status === 401
            ? { error: "Expired old session" }
            : [
                {
                  date: "2026-05-25",
                  source: "none",
                  windows: [],
                  slots: [],
                  reason: "Old result",
                },
              ],
      });
    });
    try {
      await scheduler.submitSearch("2026-05-25");
      await expect.poll(() => received).toBe(true);
      const auth = new AuthPage(page);
      await auth.signOut();
      await auth.signIn("user", TEST_PASSWORD);
      const response = page.waitForResponse((response) =>
        response.url().endsWith("/availability"),
      );
      release();
      await response;
      await expect(page.getByText("Signed in as user (User)")).toBeVisible();
      await expect(page.getByText("Old result")).toHaveCount(0);
      await expect(page.locator(".results-summary")).toHaveCount(0);
    } finally {
      release();
      await page.unrouteAll({ behavior: "wait" });
    }
  });
}

test("failed logout clears private state and reload cannot silently restore the prior session", async ({
  scheduler,
  page,
}) => {
  await scheduler.addStaff();
  await page.route("**/auth/logout", (route) => route.abort());
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Sign-out could not be confirmed",
  );
  await expect(page.locator("#staff")).toHaveCount(0);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Sign in", exact: true }),
  ).toBeVisible();
  await expect(page.locator("#staff")).toHaveCount(0);
  await page.unroute("**/auth/logout");
  await new AuthPage(page).signIn("manager", TEST_PASSWORD);
  await expect(page.locator("#staff option")).toHaveCount(1);
});
