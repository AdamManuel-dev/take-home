import { expect, type Page } from "@playwright/test";
import type { TimeWindow } from "../../../shared/contracts/test-support";
import type { OverrideMode } from "../../../shared/contracts/types";

/** User-facing actions shared by feature tests; expected results stay in the tests. */
export class SchedulerPage {
  constructor(readonly page: Page) {}

  day(name: string) {
    return this.page.locator(".weekday-row").filter({
      has: this.page.locator(".day-name", { hasText: name }),
    });
  }

  result(label: string) {
    return this.page.locator(".result-day").filter({
      has: this.page.getByRole("heading", { name: label, exact: true }),
    });
  }

  async addStaff(name = "Jane Smith"): Promise<string> {
    await this.page.getByLabel("Add someone new").fill(name);
    await this.page
      .getByRole("button", { name: "+ Add staff", exact: true })
      .click();
    await expect(
      this.page.getByText(`Set the usual rhythm for ${name.trim()}.`, {
        exact: false,
      }),
    ).toBeVisible();
    await expect(this.page.getByLabel("Add someone new")).toHaveValue("");

    return this.page.locator("#staff").inputValue();
  }

  async draftHours(day: string, windows: readonly TimeWindow[]) {
    const row = this.day(day);

    // Removing an item shifts later locators, so always act on the current first row.
    const removeButtons = row.getByRole("button", { name: /^Remove / });

    while (await removeButtons.count()) {
      await removeButtons.first().click();
    }

    for (const [index, [start, end]] of windows.entries()) {
      await row.getByRole("button", { name: "Add window" }).click();
      await this.page
        .getByLabel(`${day} window ${index + 1} start`, { exact: true })
        .fill(start);
      await this.page
        .getByLabel(`${day} window ${index + 1} end`, { exact: true })
        .fill(end);
    }
  }

  async saveHours(day: string, windows: readonly TimeWindow[]) {
    await this.draftHours(day, windows);
    await this.day(day)
      .getByRole("button", { name: "Save", exact: true })
      .click();
    await expect(
      this.day(day).getByText("Saved", { exact: true }),
    ).toBeVisible();
  }

  async submitSearch(start: string, end = start, duration = "30") {
    await this.page.getByLabel("From", { exact: true }).fill(start);
    await this.page.getByLabel("Through", { exact: true }).fill(end);
    await this.page.getByLabel("Appointment duration").selectOption(duration);
    await this.page
      .getByRole("button", { name: "Find available times" })
      .click();
  }

  async search(start: string, end = start, duration = "30") {
    await this.submitSearch(start, end, duration);
    await expect(this.page.locator(".results-summary")).toBeVisible();
  }

  async saveOverride(date: string, mode: OverrideMode, window?: TimeWindow) {
    await this.page.getByLabel("Date", { exact: true }).fill(date);
    await this.page.getByLabel("Override mode").selectOption(mode);

    if (window) {
      await this.page.getByLabel("Override window 1 start").fill(window[0]);
      await this.page.getByLabel("Override window 1 end").fill(window[1]);
    }

    await this.page
      .getByRole("button", { name: "Save override", exact: true })
      .click();
    await expect(
      this.page.getByText("Override saved for", { exact: false }),
    ).toBeVisible();
  }

  async bookFirstSlot(title: string) {
    await this.page.locator(".slot").first().click();
    await this.page.getByLabel("Appointment title").fill(title);
    await this.page
      .getByRole("button", { name: "Book appointment", exact: true })
      .click();
    await expect(
      this.page.getByText("Booked for", { exact: false }),
    ).toBeVisible();
  }
}
