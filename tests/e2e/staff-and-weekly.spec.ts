import { expect, test } from "./support/fixtures";

// Required features: staff creation, selection, recurring hours, multiple windows and persistence.
test("staff names are required, trimmed, and duplicate names keep separate schedules", async ({
  scheduler,
  page,
}) => {
  await expect(
    page.getByRole("button", { name: "+ Add staff", exact: true }),
  ).toBeDisabled();
  await page.getByLabel("Add someone new").fill("   ");
  await expect(
    page.getByRole("button", { name: "+ Add staff", exact: true }),
  ).toBeDisabled();

  const first = await scheduler.addStaff("  Jane Smith  ");
  await scheduler.saveHours("Monday", [["09:00", "10:00"]]);
  const second = await scheduler.addStaff("Jane Smith");

  expect(second).not.toBe(first);
  await expect(page.locator("#staff option")).toHaveCount(2);
  await expect(page.locator("#staff option").first()).toContainText(
    first.slice(0, 6),
  );
  await scheduler.search("2026-05-25");
  await expect(
    page.getByText("No recurring availability for this day."),
  ).toBeVisible();

  await page.locator("#staff").selectOption(first);
  await scheduler.search("2026-05-25");
  await expect(page.locator(".slot")).toHaveCount(2);
});

test("multiple windows repeat weekly, preserve breaks, and can be removed for a day off", async ({
  scheduler,
  page,
}) => {
  await scheduler.addStaff();
  await scheduler.saveHours("Monday", [
    ["13:00", "14:00"],
    ["09:00", "10:00"],
  ]);
  await expect(page.getByLabel("Monday window 1 start")).toHaveValue("09:00");

  await scheduler.search("2026-05-25", "2026-06-01");
  await expect(page.locator(".result-day")).toHaveCount(8);
  await expect(
    scheduler.result("Mon, May 25, 2026").locator(".slot"),
  ).toHaveText([
    "09:00 – 09:30",
    "09:30 – 10:00",
    "13:00 – 13:30",
    "13:30 – 14:00",
  ]);
  await expect(
    scheduler.result("Mon, Jun 1, 2026").locator(".slot"),
  ).toHaveCount(4);
  await expect(
    scheduler.result("Tue, May 26, 2026").locator(".source"),
  ).toHaveText("Day off");

  await scheduler.saveHours("Monday", []);
  await scheduler.search("2026-05-25");
  await expect(page.locator(".slot")).toHaveCount(0);
});

test("all seven weekday editors use the correct day and support the end-of-day boundary", async ({
  scheduler,
  page,
}) => {
  await scheduler.addStaff();

  for (const day of [
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
    "Sunday",
  ]) {
    await scheduler.saveHours(day, [["23:00", "24:00"]]);
  }

  await scheduler.search("2026-05-25", "2026-05-31", "60");
  await expect(page.locator(".slot")).toHaveCount(7);
  await expect(page.locator(".slot")).toHaveText(
    Array(7).fill("23:00 – 24:00"),
  );
  await expect(
    scheduler.result("Sun, May 31, 2026").locator(".source"),
  ).toHaveText("Weekly hours");
});

test("staff, weekly hours, overrides and bookings survive refresh and server restart", async ({
  scheduler,
  page,
  app,
}) => {
  const id = await scheduler.addStaff();
  await scheduler.saveHours("Monday", [["09:00", "10:00"]]);
  await scheduler.saveOverride("2026-05-26", "replace", ["11:00", "12:00"]);
  await scheduler.search("2026-05-25");
  await scheduler.bookFirstSlot("Persistent consultation");

  await page.reload();
  await expect(page.locator("#staff")).toHaveValue(id);
  await expect(page.getByLabel("Monday window 1 start")).toHaveValue("09:00");
  await expect(
    page.getByRole("button", { name: "Edit override 2026-05-26" }),
  ).toBeVisible();

  await app.restart();
  await page.reload();
  await expect(page.locator("#staff")).toHaveValue(id);
  await scheduler.search("2026-05-25");
  await expect(page.locator(".slot")).toHaveText(["09:30 – 10:00"]);
  await scheduler.search("2026-05-26");
  await expect(page.locator(".source")).toHaveText("Replaced hours");
  await expect(page.locator(".slot")).toHaveCount(2);
  await page
    .getByRole("button", { name: "Booked schedule (1)", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Persistent consultation" }),
  ).toBeVisible();
});
