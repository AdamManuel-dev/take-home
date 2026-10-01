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

| Test file                            | Main coverage                                                     |
| ------------------------------------ | ----------------------------------------------------------------- |
| `tests/scheduling.test.ts`           | Durations, gaps, merging, overrides, dates, range boundaries      |
| `tests/api.test.ts`                  | HTTP contracts, staff isolation, saved schedules, the PDF example |
| `tests/appointments.test.ts`         | Booking, conflicts, cancellation, persistence, staff isolation    |
| `tests/dates-and-validation.test.ts` | Timezone/date helpers and client response validation              |
| `tests/stored-data.test.ts`          | File schema, invalid records, legacy appointment omissions        |
| `tests/store-boundaries.test.ts`     | Defensive copies, failed writes, cleanup, startup rejection       |

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

## Authentication and reporting evidence

The core suite now includes:

| Test file                          | Main coverage                                                                   |
| ---------------------------------- | ------------------------------------------------------------------------------- |
| `tests/accounts.test.ts`           | Salted hashes, identity invariants, private storage and rollback                |
| `tests/auth-api.test.ts`           | Session lifecycle, every route's permissions, origin/CSRF and limits            |
| `tests/report-storage.test.ts`     | Migration, backup recovery and independent delivery updates                     |
| `tests/schedule-changes.test.ts`   | Atomic actor/events, normalized no-ops, undo history and rollback               |
| `tests/report-pdf.test.ts`         | Exact boundaries, DST, empty/multipage PDFs and international names             |
| `tests/report-delivery.test.ts`    | Frozen recipients, captured attachments, retries and restart                    |
| `tests/report-service.test.ts`     | Catch-up, overlap, hung delivery, no Managers and bounded shutdown              |
| `tests/report-settings.test.ts`    | Rescheduling, DST gaps/folds, restart, persistence failures and API permissions |
| `tests/report-integration.test.ts` | Two Users, Managers, real PDF capture and partial-failure recovery              |

Browser tests include five authentication scenarios at desktop and mobile sizes: role-aware
controls, session expiry, stale success, stale 401, and failed logout with reload. Combined
with five report-settings scenarios and the original 27 scenarios, the browser suite performs
74 checks. Fixtures provision
isolated accounts and sign in through the real UI; an API restart requires signing in again.
Settings checks cover Manager saves, reload/restart persistence, authorization, failed saves,
disabled reporting, and stale identity responses. An injected reporting clock advances through
the old and new cutoff and verifies real PDF attachments captured only at the selected time;
no browser fixture starts background cron timers.

The fixed-9am implementation was checked with the full formatting/core/build gate and browser
suite before phase two. A separate real `server/index.ts` smoke test on isolated files caught
up two missed cutoffs (one changed, one empty), produced two captured PDFs, stopped cleanly
on SIGINT, and restarted without adding jobs or resending successful captures. The maximum
96-window PDF sample was rendered and visually inspected across all ten pages; headers,
Unicode names, row continuation and footers stayed readable. Regression tests cover
multipage output, page numbering, complete window values, and embedded-font text.

Run `npm run reports:demo` for an isolated changed/no-change report walkthrough. This and all
report tests use mock capture transports and never send real email. The two nonblocking
Rollup annotation warnings originate from Zod dependency comments. Hosted GitHub CI is not
claimed here; rerun both gates for the final submitted commit.

## Manual acceptance

1. Provision a Manager and two Users, then follow the clean demo steps in [setup](setup.md),
   including the explicit May 2026 dates.
2. Check all three override modes and the weekly/override/combined/no-hours labels.
3. Try a reversed window, overlapping windows, and an empty custom override; expect a readable
   error with previously saved data retained.
4. Try all four durations and confirm that no slot extends past its available window.
5. Book, reload, cancel, and search again. Check a conflicting booking is rejected.
6. Change staff and query parameters; old results must not appear under the new selection.
7. Check a narrow viewport, keyboard navigation, pending state, and visible save errors.

8. Sign in as each User, verify all staff are visible, and verify another staff's editors and
   booking controls are read-only while availability search remains enabled.
9. Run the isolated reporting demo, inspect the changed and no-change PDFs and recipient
   metadata, and confirm there are no real outbound email messages.

This checklist is a procedure, not a claim that each manual step was rerun in this session.
