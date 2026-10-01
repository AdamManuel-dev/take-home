import { expect, type Page } from "@playwright/test";

export class ReportSettingsPage {
  constructor(private readonly page: Page) {}
  get time() {
    return this.page.getByLabel("Report time (America/Chicago)");
  }
  async save(time: string) {
    await this.time.fill(time);
    await this.page
      .getByRole("button", { name: "Save report time", exact: true })
      .click();
  }
  async expectSaved(time: string) {
    await expect(
      this.page.getByText(`Current report time: ${time}.`, { exact: false }),
    ).toBeVisible();
    await expect(this.time).toHaveValue(time);
  }
}
