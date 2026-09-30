import { expect, test } from "./support/fixtures";

test("a delayed search cannot overwrite results from a newer date range", async ({
  scheduler,
  page,
}) => {
  await scheduler.addStaff();
  await scheduler.saveHours("Monday", [["09:00", "10:00"]]);

  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let received = false;
  await page.route("**/availability", async (route) => {
    if (route.request().postDataJSON().start === "2026-05-25") {
      const response = await route.fetch();
      received = true;
      await gate;
      await route.fulfill({ response });
    } else {
      await route.continue();
    }
  });

  try {
    await scheduler.submitSearch("2026-05-25");
    await expect.poll(() => received).toBe(true);
    await scheduler.search("2026-05-26");
    const oldResponse = page.waitForResponse(
      (response) =>
        response.url().endsWith("/availability") &&
        response.request().postDataJSON().start === "2026-05-25",
    );
    release();
    await oldResponse;

    await expect(page.locator(".result-heading h3")).toHaveText(
      "Tue, May 26, 2026",
    );
    await expect(page.locator(".slot")).toHaveCount(0);
  } finally {
    release();
    await page.unrouteAll({ behavior: "wait" });
  }
});

test("pending saves block staff changes; failures stay visible and preserve editable drafts", async ({
  scheduler,
  page,
}) => {
  await scheduler.addStaff();
  await scheduler.saveHours("Monday", [["09:00", "10:00"]]);

  let release = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let received = false;
  await page.route("**/weekly/1", async (route) => {
    received = true;
    await gate;
    await route.fulfill({
      status: 500,
      json: { error: "Simulated save failure" },
    });
  });

  try {
    await scheduler.draftHours("Monday", [["09:00", "11:00"]]);
    await scheduler
      .day("Monday")
      .getByRole("button", { name: "Save", exact: true })
      .click();
    await expect.poll(() => received).toBe(true);
    await expect(page.locator("#staff")).toBeDisabled();
    await expect(page.getByLabel("Add someone new")).toBeDisabled();
    await expect(
      page.getByRole("button", { name: "+ Add staff", exact: true }),
    ).toBeDisabled();
    await page.getByRole("button", { name: "Booked schedule (0)" }).click();
    release();

    await expect(
      page.getByRole("alert").filter({ visible: true }),
    ).toContainText("Simulated save failure");
    await expect(page.locator("#staff")).toBeEnabled();
    await page
      .getByRole("button", { name: "Availability settings", exact: true })
      .click();
    await expect(page.getByLabel("Monday window 1 end")).toHaveValue("11:00");
    await scheduler.search("2026-05-25");
    await expect(page.locator(".slot")).toHaveCount(2);
  } finally {
    release();
    await page.unrouteAll({ behavior: "wait" });
  }

  await scheduler
    .day("Monday")
    .getByRole("button", { name: "Save", exact: true })
    .click();
  await expect(
    scheduler.day("Monday").getByText("Saved", { exact: true }),
  ).toBeVisible();
  await scheduler.search("2026-05-25");
  await expect(page.locator(".slot")).toHaveCount(4);
});

test("malformed search responses produce an error instead of offering invalid slots", async ({
  scheduler,
  page,
}) => {
  await scheduler.addStaff();
  await page.route("**/availability", (route) =>
    route.fulfill({ json: [{ date: "not-a-date", slots: "broken" }] }),
  );
  await scheduler.submitSearch("2026-05-25");

  await expect(page.getByRole("alert")).toContainText("unexpected response");
  await expect(page.locator(".slot")).toHaveCount(0);

  await page.unroute("**/availability");
  await scheduler.search("2026-05-25");
  await expect(
    page.getByText("No recurring availability for this day."),
  ).toBeVisible();
});
