import { expect, test } from "./support/fixtures";
import { AuthPage } from "./support/auth-page";
import { ReportSettingsPage } from "./support/report-settings-page";
import { TEST_PASSWORD } from "../support/auth";

test("saved report time survives reload and restart and captures PDFs only at the new cutoff", async ({
  scheduler,
  page,
  app,
}) => {
  await scheduler.addStaff("Report staff");
  await scheduler.saveHours("Monday", [["09:00", "10:00"]]);
  const settings = new ReportSettingsPage(page);
  await settings.expectSaved("09:00");
  await settings.save("10:00");
  await expect(
    page.getByText("Saved. Reports will run", { exact: false }),
  ).toBeVisible();
  await page.reload();
  await settings.expectSaved("10:00");
  await app.advanceReporting("2026-09-30T14:00:00.000Z");
  expect(app.capturedReports()).toHaveLength(0);
  await app.restart();
  await page.reload();
  await new AuthPage(page).signIn("manager", TEST_PASSWORD);
  await settings.expectSaved("10:00");
  await app.advanceReporting("2026-09-30T15:00:00.000Z");
  expect(app.capturedReports()).toHaveLength(1);
  expect(app.capturedReports()[0]).toMatchObject({ pdfHeader: "%PDF-" });
  expect(app.capturedReports()[0].filename).toMatch(/\.pdf$/);
  await app.advanceReporting("2026-10-01T14:00:00.000Z");
  expect(app.capturedReports()).toHaveLength(1);
  await app.advanceReporting("2026-10-01T15:00:00.000Z");
  expect(app.capturedReports()).toHaveLength(2);
});

test("users have no report controls and cannot access either settings endpoint", async ({
  scheduler,
  page,
  app,
}) => {
  const id = await scheduler.addStaff();
  app.provisionUser("user", id);
  const auth = new AuthPage(page);
  await auth.signOut();
  await auth.signIn("user", TEST_PASSWORD);
  await expect(
    page.getByRole("heading", { name: "Daily PDF reports" }),
  ).toHaveCount(0);
  expect((await page.request.get("/api/report-settings")).status()).toBe(403);
  expect(
    (
      await page.request.put("/api/report-settings", {
        headers: await auth.mutationHeaders(),
        data: { localTime: "10:00" },
      })
    ).status(),
  ).toBe(403);
});

test("failed save preserves the draft and the saved report time", async ({
  scheduler,
  page,
}) => {
  await scheduler.addStaff();
  const settings = new ReportSettingsPage(page);
  await settings.expectSaved("09:00");
  await page.route("**/api/report-settings", async (route) => {
    if (route.request().method() === "PUT")
      await route.fulfill({
        status: 500,
        json: { error: "Unable to save report time" },
      });
    else await route.continue();
  });
  await settings.save("10:00");
  await expect(page.getByRole("alert")).toContainText(
    "Unable to save report time",
  );
  await expect(settings.time).toHaveValue("10:00");
  await expect(
    page.getByText("Current report time: 09:00.", { exact: false }),
  ).toBeVisible();
  await page.reload();
  await settings.expectSaved("09:00");
});

test("disabled reporting leaves schedule editing available", async ({
  scheduler,
  page,
}) => {
  await scheduler.addStaff();
  await page.route("**/api/report-settings", (route) =>
    route.fulfill({ status: 503, json: { error: "Reporting is disabled" } }),
  );
  await page.reload();
  await expect(
    page.getByText("Reporting is disabled", { exact: false }),
  ).toBeVisible();
  await expect(page.getByLabel("Report time (America/Chicago)")).toHaveCount(0);
  await scheduler.saveHours("Monday", [["09:00", "10:00"]]);
});

test("a delayed settings expiry cannot sign out a replacement user", async ({
  scheduler,
  page,
  app,
}) => {
  const id = await scheduler.addStaff();
  app.provisionUser("user", id);
  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let received = false;
  await page.route("**/api/report-settings", async (route) => {
    received = true;
    await gate;
    await route.fulfill({
      status: 401,
      json: { error: "Expired old session" },
    });
  });
  await page.reload();
  await expect.poll(() => received).toBe(true);
  const auth = new AuthPage(page);
  await auth.signOut();
  await auth.signIn("user", TEST_PASSWORD);
  const response = page.waitForResponse("**/api/report-settings");
  release();
  await response;
  await expect(
    page.getByRole("button", { name: "Sign out", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Daily PDF reports" }),
  ).toHaveCount(0);
  await expect(page.locator("#staff option")).toHaveCount(1);
});
