import { expect, test } from "./support/fixtures";

// Each duration asserts exact boundaries rather than merely checking a slot count.
for (const [duration, expected] of [
  ["15", ["09:00 – 09:15", "09:15 – 09:30", "09:30 – 09:45", "09:45 – 10:00"]],
  ["30", ["09:00 – 09:30", "09:30 – 10:00"]],
  ["45", ["09:00 – 09:45"]],
  ["60", ["09:00 – 10:00"]],
] as const) {
  test(`${duration}-minute appointments fit entirely within the available window`, async ({
    scheduler,
    page,
  }) => {
    await scheduler.addStaff();
    await scheduler.saveHours("Monday", [["09:00", "10:00"]]);
    await scheduler.search("2026-05-25", "2026-05-25", duration);

    await expect(page.locator(".slot")).toHaveText([...expected]);
    await expect(page.locator(".source")).toHaveText("Weekly hours");
  });
}

test("the specification's date range explains weekly, unavailable, replaced, and added hours", async ({
  scheduler,
  page,
}) => {
  await scheduler.addStaff("Jane Smith");

  for (const day of ["Monday", "Wednesday", "Thursday", "Friday"]) {
    await scheduler.saveHours(day, [["09:00", "11:00"]]);
  }
  await scheduler.saveOverride("2026-05-27", "unavailable");
  await scheduler.saveOverride("2026-05-28", "replace", ["10:00", "14:00"]);
  await scheduler.saveOverride("2026-05-29", "add", ["17:00", "19:00"]);
  await scheduler.search("2026-05-25", "2026-05-29");

  await expect(page.locator(".result-day")).toHaveCount(5);
  await expect(
    scheduler.result("Mon, May 25, 2026").locator(".slot"),
  ).toHaveText([
    "09:00 – 09:30",
    "09:30 – 10:00",
    "10:00 – 10:30",
    "10:30 – 11:00",
  ]);
  await expect(scheduler.result("Tue, May 26, 2026")).toContainText(
    "No recurring availability",
  );
  await expect(
    scheduler.result("Wed, May 27, 2026").locator(".source"),
  ).toHaveText("Day off override");
  await expect(scheduler.result("Wed, May 27, 2026")).toContainText(
    "Unavailable because of a date override.",
  );
  await expect(
    scheduler.result("Thu, May 28, 2026").locator(".source"),
  ).toHaveText("Replaced hours");
  await expect(
    scheduler.result("Thu, May 28, 2026").locator(".slot"),
  ).toHaveCount(8);
  await expect(
    scheduler.result("Thu, May 28, 2026").locator(".slot").first(),
  ).toHaveText("10:00 – 10:30");
  await expect(
    scheduler.result("Thu, May 28, 2026").locator(".slot").last(),
  ).toHaveText("13:30 – 14:00");
  await expect(
    scheduler.result("Fri, May 29, 2026").locator(".source"),
  ).toHaveText("Weekly + added");
  await expect(
    scheduler.result("Fri, May 29, 2026").locator(".slot"),
  ).toHaveCount(8);
  await expect(
    scheduler.result("Fri, May 29, 2026").locator(".slot").last(),
  ).toHaveText("18:30 – 19:00");
});

test("overlapping additions form one grid; editing and deleting an override restores weekly hours", async ({
  scheduler,
  page,
}) => {
  await scheduler.addStaff();
  await scheduler.saveHours("Monday", [["09:00", "10:00"]]);
  await scheduler.saveOverride("2026-05-25", "add", ["08:45", "09:15"]);
  await scheduler.search("2026-05-25");
  await expect(page.locator(".slot")).toHaveText([
    "08:45 – 09:15",
    "09:15 – 09:45",
  ]);

  await page.getByRole("button", { name: "Edit override 2026-05-25" }).click();
  await expect(page.getByLabel("Override window 1 start")).toHaveValue("08:45");
  await scheduler.saveOverride("2026-05-25", "replace", ["12:00", "13:00"]);
  await expect(page.locator(".override-item")).toHaveCount(1);
  await scheduler.search("2026-05-25");
  await expect(page.locator(".slot")).toHaveText([
    "12:00 – 12:30",
    "12:30 – 13:00",
  ]);

  await page
    .getByRole("button", { name: "Remove override 2026-05-25" })
    .click();
  await expect(
    page.getByText("Weekly hours restored.", { exact: false }),
  ).toBeVisible();
  await scheduler.search("2026-05-25");
  await expect(page.locator(".slot")).toHaveText([
    "09:00 – 09:30",
    "09:30 – 10:00",
  ]);
});

test("additions create hours on a day off and short windows have a distinct explanation", async ({
  scheduler,
  page,
}) => {
  await scheduler.addStaff();
  await scheduler.saveOverride("2026-05-26", "add", ["09:00", "09:30"]);
  await scheduler.search("2026-05-26", "2026-05-26", "30");
  await expect(page.locator(".source")).toHaveText("Added hours");
  await expect(page.locator(".slot")).toHaveText(["09:00 – 09:30"]);

  await scheduler.search("2026-05-26", "2026-05-26", "45");
  await expect(
    page.getByText(
      "Available windows are too short for this appointment duration.",
    ),
  ).toBeVisible();
  await expect(page.locator(".slot")).toHaveCount(0);
});

test("touching windows merge before generating slots while gaps remain unavailable", async ({
  scheduler,
  page,
}) => {
  await scheduler.addStaff();
  await scheduler.saveHours("Monday", [
    ["09:00", "09:30"],
    ["09:30", "10:00"],
    ["10:15", "10:45"],
  ]);
  await scheduler.search("2026-05-25", "2026-05-25", "60");

  await expect(page.locator(".slot")).toHaveText(["09:00 – 10:00"]);
});
