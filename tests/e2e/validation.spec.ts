import { expect, test } from "./support/fixtures";

for (const [name, windows, message] of [
  ["reversed", [["10:00", "09:00"]], "start before end"],
  ["equal boundaries", [["09:00", "09:00"]], "start before end"],
  [
    "overlapping",
    [
      ["09:00", "10:00"],
      ["09:30", "10:30"],
    ],
    "overlap",
  ],
  ["malformed", [["9:00", "10:00"]], "HH:MM"],
] as const) {
  test(`${name} windows show an error and preserve the last saved hours`, async ({
    scheduler,
    page,
  }) => {
    await scheduler.addStaff();
    await scheduler.saveHours("Monday", [["09:00", "10:00"]]);
    await scheduler.draftHours("Monday", windows);
    await scheduler
      .day("Monday")
      .getByRole("button", { name: "Save", exact: true })
      .click();

    await expect(scheduler.day("Monday").getByRole("alert")).toContainText(
      message,
    );
    await scheduler.search("2026-05-25");
    await expect(page.locator(".slot")).toHaveCount(2);
    await page.reload();
    await expect(page.getByLabel("Monday window 1 end")).toHaveValue("10:00");
  });
}

for (const mode of ["replace", "add"] as const) {
  test(`${mode} overrides require at least one custom window`, async ({
    scheduler,
    page,
  }) => {
    await scheduler.addStaff();
    await page.getByLabel("Date", { exact: true }).fill("2026-05-25");
    await page.getByLabel("Override mode").selectOption(mode);
    await page
      .getByRole("button", { name: "Remove Override window 1" })
      .click();
    await page
      .getByRole("button", { name: "Save override", exact: true })
      .click();

    await expect(page.getByRole("alert")).toContainText(
      "need at least one window",
    );
    await expect(page.locator(".override-item")).toHaveCount(0);
  });
}

test("queries require dates, reject reversed and overlong ranges, and accept 90 inclusive dates", async ({
  scheduler,
  page,
}) => {
  await scheduler.addStaff();
  await page.getByLabel("From", { exact: true }).fill("");
  await page.getByRole("button", { name: "Find available times" }).click();
  expect(
    await page
      .getByLabel("From", { exact: true })
      .evaluate((input: HTMLInputElement) => input.validity.valueMissing),
  ).toBe(true);
  await expect(page.locator(".results-summary")).toHaveCount(0);

  await scheduler.submitSearch("2026-05-26", "2026-05-25");
  await expect(page.getByRole("alert")).toContainText("on or before");
  await scheduler.submitSearch("2026-01-01", "2026-04-01");
  await expect(page.getByRole("alert")).toContainText("at most 90");

  await scheduler.search("2026-01-01", "2026-03-31");
  await expect(page.locator(".result-day")).toHaveCount(90);
  await expect(page.locator(".result-heading").first()).toContainText(
    "Jan 1, 2026",
  );
  await expect(page.locator(".result-heading").last()).toContainText(
    "Mar 31, 2026",
  );
});

test("the real HTTP boundary rejects unsupported durations and impossible dates", async ({
  scheduler,
  page,
}) => {
  const id = await scheduler.addStaff();
  await scheduler.saveHours("Monday", [["09:00", "10:00"]]);

  for (const duration of [0, -15, 20, "30"]) {
    const response = await page.request.post(`/api/staff/${id}/availability`, {
      data: { start: "2026-05-25", end: "2026-05-25", duration },
    });
    expect(response.status()).toBe(400);
    expect((await response.json()).error).toEqual(expect.any(String));
  }

  const invalidDate = await page.request.put(
    `/api/staff/${id}/overrides/2026-02-30`,
    {
      data: { mode: "unavailable", windows: [] },
    },
  );
  expect(invalidDate.status()).toBe(400);

  const invalidWindow = await page.request.put(`/api/staff/${id}/weekly/1`, {
    data: { windows: [{ start: 600, end: 540 }] },
  });
  expect(invalidWindow.status()).toBe(400);

  await scheduler.search("2026-05-25");
  await expect(page.locator(".slot")).toHaveCount(2);
});

test("Chicago dates remain stable in a Tokyo browser across both DST transitions", async ({
  scheduler,
  page,
}) => {
  await page.clock.setFixedTime(new Date("2026-10-01T02:00:00Z"));
  await page.reload();
  await scheduler.addStaff();
  await expect(page.getByLabel("From", { exact: true })).toHaveValue(
    "2026-09-30",
  );
  await expect(page.locator(".timezone")).toContainText("America/Chicago");
  await scheduler.saveHours("Sunday", [["09:00", "10:00"]]);

  for (const [start, end, labels] of [
    [
      "2026-03-07",
      "2026-03-09",
      ["Sat, Mar 7, 2026", "Sun, Mar 8, 2026", "Mon, Mar 9, 2026"],
    ],
    [
      "2026-10-31",
      "2026-11-02",
      ["Sat, Oct 31, 2026", "Sun, Nov 1, 2026", "Mon, Nov 2, 2026"],
    ],
  ] as const) {
    await scheduler.search(start, end);
    await expect(page.locator(".result-heading h3")).toHaveText([...labels]);
    await expect(page.locator(".slot")).toHaveCount(2);
  }
});
