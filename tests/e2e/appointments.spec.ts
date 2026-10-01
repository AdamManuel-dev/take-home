import { AuthPage } from "./support/auth-page";
import { expect, test } from "./support/fixtures";

// Booking and the agenda are required follow-up features beyond the original take-home brief.
test("booking blocks overlaps across durations; the agenda filters and cancellation restores slots", async ({
  scheduler,
  page,
}) => {
  await scheduler.addStaff();
  await scheduler.saveHours("Monday", [["09:00", "10:00"]]);
  await scheduler.search("2026-05-25");
  await page.locator(".slot").first().click();
  await page
    .getByRole("button", { name: "Book appointment", exact: true })
    .click();
  expect(
    await page
      .getByLabel("Appointment title")
      .evaluate((input: HTMLInputElement) => input.validity.valueMissing),
  ).toBe(true);
  await page.getByLabel("Appointment title").fill("Consultation");
  await page
    .getByRole("button", { name: "Book appointment", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Booked schedule (1)" }),
  ).toBeVisible();

  await scheduler.search("2026-05-25", "2026-05-25", "60");
  await expect(
    page.getByText("All fitting slots overlap scheduled appointments."),
  ).toBeVisible();
  await scheduler.search("2026-05-25", "2026-05-25", "15");
  await expect(page.locator(".slot")).toHaveText([
    "09:30 – 09:45",
    "09:45 – 10:00",
  ]);

  await page.getByRole("button", { name: "Booked schedule (1)" }).click();
  await expect(
    page.getByRole("heading", { name: "Consultation" }),
  ).toBeVisible();
  await page.getByLabel("Schedule from").fill("2026-05-26");
  await expect(
    page.getByRole("heading", { name: "No appointments in this date range" }),
  ).toBeVisible();
  await page.getByLabel("Schedule through").fill("2026-05-25");
  await expect(page.getByRole("alert")).toContainText(
    "end date must be on or after",
  );
  await page.getByRole("button", { name: "Show all dates" }).click();

  await page.getByRole("button", { name: /^Cancel Consultation/ }).click();
  await expect(
    page.getByRole("heading", { name: "No appointments booked yet" }),
  ).toBeVisible();
  await scheduler.search("2026-05-25");
  await expect(page.locator(".slot")).toHaveCount(2);
});

test("a stale booking is rejected without double booking, and another staff member stays available", async ({
  scheduler,
  page,
}) => {
  const first = await scheduler.addStaff();
  await scheduler.saveHours("Monday", [["09:00", "10:00"]]);
  const second = await scheduler.addStaff("Morgan");
  await scheduler.saveHours("Monday", [["09:00", "10:00"]]);
  await page.locator("#staff").selectOption(first);
  await scheduler.search("2026-05-25");
  await page.locator(".slot").first().click();
  await page.getByLabel("Appointment title").fill("Stale booking");

  // Simulate another client claiming the offered interval after this page's search.
  const claimed = await page.request.post(`/api/staff/${first}/appointments`, {
    headers: await new AuthPage(page).mutationHeaders(),
    data: {
      date: "2026-05-25",
      start: 540,
      duration: 30,
      title: "Other client",
    },
  });
  expect(claimed.status()).toBe(201);
  await page
    .getByRole("button", { name: "Book appointment", exact: true })
    .click();
  await expect(page.locator(".availability").getByRole("alert")).toContainText(
    "no longer available",
  );
  await scheduler.search("2026-05-25");
  await expect(page.locator(".slot")).toHaveText(["09:30 – 10:00"]);

  await page.locator("#staff").selectOption(second);
  await scheduler.search("2026-05-25");
  await expect(page.locator(".slot")).toHaveCount(2);
  await scheduler.bookFirstSlot("Independent booking");
  await expect(
    page.getByRole("button", { name: "Booked schedule (1)" }),
  ).toBeVisible();
});

test("query changes clear a selected slot and changing working hours retains existing appointments", async ({
  scheduler,
  page,
}) => {
  await scheduler.addStaff();
  await scheduler.saveHours("Monday", [["09:00", "10:00"]]);
  await scheduler.search("2026-05-25");
  await page.locator(".slot").first().click();
  await page.getByLabel("Appointment duration").selectOption("60");
  await expect(page.getByLabel("Appointment title")).toBeHidden();
  await expect(page.locator(".results-summary")).toHaveCount(0);

  await scheduler.search("2026-05-25");
  await scheduler.bookFirstSlot("Keep this appointment");
  await scheduler.saveHours("Monday", []);
  await page.getByRole("button", { name: "Booked schedule (1)" }).click();
  await expect(
    page.getByRole("heading", { name: "Keep this appointment" }),
  ).toBeVisible();
});
