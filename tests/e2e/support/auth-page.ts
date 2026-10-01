import { expect, type Page } from "@playwright/test";
export class AuthPage {
  constructor(private page: Page) {}
  async signIn(username: string, password: string) {
    await this.page.getByLabel("Username", { exact: true }).fill(username);
    await this.page.getByLabel("Password", { exact: true }).fill(password);
    await this.page
      .getByRole("button", { name: "Sign in", exact: true })
      .click();
    await expect(
      this.page.getByRole("button", { name: "Sign out", exact: true }),
    ).toBeVisible();
  }
  async signOut() {
    await this.page
      .getByRole("button", { name: "Sign out", exact: true })
      .click();
    await expect(
      this.page.getByRole("button", { name: "Sign in", exact: true }),
    ).toBeEnabled();
  }
  async mutationHeaders() {
    const response = await this.page.request.get("/api/auth/me");
    const session = await response.json();
    return {
      Origin: new URL(this.page.url()).origin,
      "X-CSRF-Token": session.csrfToken,
    };
  }
}
