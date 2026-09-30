# Testing and verification

Reproduce the core checks and distinguish automated evidence from manual acceptance.

## Automated checks

```sh
npm ci
npm run verify
```

`verify` checks source formatting, runs the domain/API/persistence tests, then performs strict
TypeScript checking and a Vite production build. It is the same command used in GitHub CI.
The core tests use Node's test runner through tsx and temporary storage, not your saved data.

| Test file | Main coverage |
| --- | --- |
| `tests/scheduling.test.ts` | Durations, gaps, merging, overrides, dates, range boundaries |
| `tests/api.test.ts` | HTTP contracts, staff isolation, saved schedules, the PDF example |
| `tests/appointments.test.ts` | Booking, conflicts, cancellation, persistence, staff isolation |
| `tests/dates-and-validation.test.ts` | Timezone/date helpers and client response validation |
| `tests/stored-data.test.ts` | File schema, invalid records, legacy appointment omissions |
| `tests/store-boundaries.test.ts` | Defensive copies, failed writes, cleanup, startup rejection |

## Browser suite

The separate browser-test work adds `tests/e2e/`, `playwright.config.ts`, and these commands:

```sh
npx playwright install chromium
npm run test:e2e
npm run test:e2e:report
```

The current configuration uses visible Chromium windows at desktop and mobile sizes and an
Asia/Tokyo browser timezone. Fixtures start isolated local servers with temporary data.
The suite needs a graphical session; it is not included in the GitHub workflow prepared here.
Do not interpret a passing `verify` job as a browser-suite pass. A headless CI configuration or
a virtual display would be needed before adding these tests to the Linux CI job.

## Results from this documentation/setup session

Verified on September 30, 2026 with Node 24.6.0 and npm 11.6.2:

- Clean `npm ci` in a separate temporary directory succeeded with the current lockfile.
- `npm run verify` passed: formatting, 96 automated tests, TypeScript, and production build.
- The build reported two nonblocking Rollup annotation warnings from Zod dependency comments.
- The demo command created valid data and refused a second write without changing the file.
- A real temporary HTTP server served built HTML and returned the seeded availability example.
  Per-date slot counts were 4, 0, 0, 8, and 6 with the expected availability sources.
- Git ignore checks excluded personal schedules, dependencies, build output, environment
  files, and local reference playbooks.

GitHub-hosted CI has not run because no remote repository has been published in this task.
Browser-suite execution belongs to the separate browser-test task and is not claimed here.
These results describe the checked workspace; rerun verification after subsequent changes.

## Manual acceptance

1. Follow the clean demo steps in [setup](setup.md), including the explicit May 2026 dates.
2. Check all three override modes and the weekly/override/combined/no-hours labels.
3. Try a reversed window, overlapping windows, and an empty custom override; expect a readable
   error with previously saved data retained.
4. Try all four durations and confirm that no slot extends past its available window.
5. Book, reload, cancel, and search again. Check a conflicting booking is rejected.
6. Change staff and query parameters; old results must not appear under the new selection.
7. Check a narrow viewport, keyboard navigation, pending state, and visible save errors.

This checklist is a procedure, not a claim that each manual step was rerun in this session.
