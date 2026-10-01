# Open Hours

A staff availability scheduler built with React, TypeScript, Node.js, and Express.

Create staff, save multiple weekly windows, add date exceptions, and calculate appointment
slots, book appointments, and view each staff member's appointment schedule. Data persists
in local JSON files. User and Manager accounts control editing. Daily schedule-change PDFs
are generated at a shared Manager-selected time (default 09:00 America/Chicago)
and saved as mock email captures; no real email
is sent. No database or external calendar account is required.

## Documentation and submission

Start with [setup and troubleshooting](docs/setup.md), then follow
[GitHub setup and publishing](docs/github.md). Detailed references:

- [Architecture and technical decisions](docs/architecture.md)
- [API contracts and examples](docs/api.md)
- [Testing and verification](docs/testing.md)
- [Interview demonstration and code tour](docs/interview-guide.md)
- [AI usage and personal confirmations](docs/ai-usage.md)
- [Requirements and submission checklist](docs/requirements.md)

GitHub CI and a pull request template are included. Remote publication and the candidate's
personal AI-use confirmations remain handoff steps. No public deployment is required.

## Run locally

Use Node.js 24.6.0 (recorded in `.nvmrc`) and npm. Run from this project directory:

```sh
npm ci
npm run provision:account
npm run dev
```

Open http://127.0.0.1:5173. Vite serves React and forwards `/api` to Express on port 3001.
Provision a Manager first using the hidden password prompts (staff ID is optional for Managers).
Sign in, then create your first staff member. To provision Users, stop the API and link each
account to an existing staff ID. There is no automatic seed or reset at startup.

For a single-server build:

```sh
npm run build
npm start
```

Open http://127.0.0.1:3001. Express serves both the built frontend and API. Stop the development
server first because both commands use port 3001. Keep dev dependencies installed: the server
uses `tsx` to execute TypeScript.

```sh
npm test
```

The tests use temporary storage and never modify your saved application data. `npm run build`
includes strict TypeScript checking and the production frontend build.

Run the complete end-to-end suite with Playwright:

```sh
npx playwright install chromium
npm run test:e2e
```

This builds the app and runs 37 scenarios at both desktop and mobile sizes (74 checks).
Each scenario opens a visible Chromium browser and uses the real Express API with its own
temporary data file and an automatically assigned port. No development server or seed data is
needed. Tests clean up their server and data even after failures. The persistence scenario also
restarts the server against the same file, rather than only refreshing the browser.

To run one project or inspect the HTML report:

```sh
npm run test:e2e -- --project=desktop-chromium
npm run test:e2e:report
```

Failures retain screenshots and traces under `test-results/`. The report is written to
`playwright-report/`; both directories are ignored by Git. The suite has no automatic retries,
so failures remain visible. Browser tests live in `tests/e2e/`, with shared user actions and
server fixtures in `tests/e2e/support/`.

| Requirement                   | End-to-end coverage                                                           |
| ----------------------------- | ----------------------------------------------------------------------------- |
| Create and select staff       | Required names, trimming, duplicate names, separate schedules                 |
| Recurring weekly availability | All seven weekdays, multiple windows, weekly recurrence, day off              |
| Date-specific overrides       | Unavailable, replace, add, edit, remove, overlap union, add on a day off      |
| Date-range queries            | Both endpoints, reversed ranges, required dates, 90-day limit, DST boundaries |
| Appointment durations         | Exact slot boundaries for 15, 30, 45, and 60 minutes; gaps and short windows  |
| Invalid availability          | Reversed/equal times, overlaps, malformed times, empty add/replace overrides  |
| Availability source           | Weekly, combined, replaced, added, day-off override, no recurring hours       |
| Backend validation            | Real HTTP rejection of invalid durations, dates, and window boundaries        |
| Persistence                   | Staff, weekly hours, overrides, and bookings after refresh and server restart |
| Booking and agenda            | Required title, filtering, conflicts, cancellation, staff isolation           |
| Request safety                | Stale searches, pending-save guards, failed saves, malformed responses, retry |
| Responsive interface          | Every scenario at 1440px and 375px, overflow and uncaught-error checks        |

The browser runs in Asia/Tokyo to verify that the app consistently uses America/Chicago.
Happy paths use real requests. Only failure and race tests intercept responses to introduce
controlled delays, server failures, or malformed data.

For an isolated example matching the brief, follow the [seed and Manager provisioning
steps](docs/setup.md#demo-data), sign in, select Jane Smith, and search May 25-29, 2026.
Existing demo files are never overwritten. See setup for isolated account/report paths.

Run `npm run verify` for the same formatting, test, type-check, and build checks used by CI.

## Configuration and persistence

| Variable            | Default                   | Meaning                                                    |
| ------------------- | ------------------------- | ---------------------------------------------------------- |
| `PORT`              | `3001`                    | Express port; Vite's development proxy expects the default |
| `DATA_FILE`         | `data/schedules.json`     | Schedule and atomic change history                         |
| `USERS_FILE`        | `data/users.json`         | Private account store                                      |
| `REPORTS_FILE`      | `data/reports.json`       | Frozen report jobs and delivery state                      |
| `MAIL_CAPTURE_DIR`  | `data/mail-capture`       | Mock message metadata and PDF attachments                  |
| `REPORTING_ENABLED` | Enabled                   | Set `false` to disable background reporting                |
| `APP_ORIGIN`        | Local development origins | Required HTTPS public origin in production                 |

Example: `DATA_FILE=/tmp/my-schedules.json npm run dev`. Variables are set in the shell;
`.env` files are not loaded automatically.

The schedule file is created at startup with a durable reporting baseline and `version: 2`.
Version 1 is migrated automatically after preserving an exact `.v1.bak` copy. Staff, weekly
hours, overrides, and appointments are preserved; existing schedules create no change events.
Corrupt or unknown formats stop startup. Account and report files use separate versioned
envelopes. See [setup](docs/setup.md) for backup recovery and single-process operation.

Each staff record contains a generated UUID, a name, seven weekly window arrays, date
overrides, and appointments. Appointments have a UUID, title, calendar date, start, and end.
Names need not be unique. A window contains integer `start` and `end` minutes;
its containing weekday or override supplies identity. Overrides are unique by staff and date.
There are no unnecessary IDs for windows that are always replaced together.

Writes clone the current state, write a temporary file in the same directory, and rename it
over the saved file. Memory is updated only after that succeeds. All writes run synchronously
in one Node process so requests cannot interleave halfway through a schedule replacement.
Back up the JSON file while the app is stopped. Local data and temporary files are gitignored.

This storage is deliberately for a small, single-process local app. Do not run two servers
against one data file. It has no cross-process locking, revision conflicts, or power-loss
durability guarantees. Concurrent browser edits use last successful save wins.

## Architecture

The implementation applies the project-local architecture-patterns guide, with a small layered
structure rather than a framework or a class for every operation:

| Area                                    | Responsibility                                                                 |
| --------------------------------------- | ------------------------------------------------------------------------------ |
| `shared/contracts/types.ts`             | Domain, request, draft, and schedule-state types                               |
| `shared/contracts/component-props.ts`   | Named React component input types                                              |
| `shared/contracts/persistence.ts`       | Repository contract and persisted-record types                                 |
| `shared/contracts/test-support.ts`      | End-to-end fixture and page-action types                                       |
| `shared/contracts/errors.ts`            | Error classes and shared validation/HTTP messages                              |
| `shared/constants.ts`, `shared/time.ts` | Scheduling constants and minute formatting                                     |
| `shared/schemas.ts`                     | Zod contracts shared by forms, HTTP boundaries, and persistence                |
| `shared/validation.ts`                  | Converts schema failures into readable validation errors                       |
| `shared/dates.ts`                       | Luxon calendar arithmetic and display in America/Chicago                       |
| `server/scheduling.ts`                  | Query validation, window resolution, slot calculation, empty reasons           |
| `server/appointments.ts`                | Booking validation against current offered slots                               |
| `server/store.ts`                       | JSON file implementation and atomic schedule replacement                       |
| `server/stored-data.ts`                 | Runtime validation of persisted records, including legacy schedules            |
| `server/app.ts`                         | Express setup, route registration, static files, and JSON errors               |
| `server/routes/`                        | Staff, schedule, availability, and appointment HTTP adapters                   |
| `server/index.ts`                       | Composition root: authentication, storage, mock reporting, cron, shutdown      |
| `server/auth/`                          | Account storage, scrypt passwords, sessions, CSRF and permission guards        |
| `server/reports/`                       | Event diff, intervals, PDF rendering, capture delivery, retries and scheduling |
| `src/features/auth/`                    | Sign-in, sign-out, session expiry and identity generation guards               |
| `src/features/staff/`                   | Staff selection, creation form, and staff request state                        |
| `src/features/schedule/`                | Workspace, weekly editors, and serialized schedule mutations                   |
| `src/features/overrides/`               | Override form, saved list, and draft/save state                                |
| `src/features/availability/`            | Search form, results, day cards, and stale-response protection                 |
| `src/features/appointments/`            | Booking form, booking draft state, and staff agenda                            |
| `src/shared/`                           | Reusable window inputs, draft-time parsing, and validated HTTP transport       |
| `src/layout/`                           | Page header, heading, and footer without feature state                         |
| `tests/`                                | Domain behavior, API contracts, failure preservation, and restart persistence  |
| `tests/e2e/`                            | Repeatable browser coverage mapped to every required feature                   |

The scheduling engine imports no Express, filesystem, or React code. Express accepts a
repository interface instead of constructing a store. The store knows nothing about HTTP.
The few save operations are short enough to remain in the HTTP adapter; a separate use-case
layer would be useful if additional interfaces or more complex operations were introduced.

Feature components focus on rendering; hooks own requests, drafts, and operation feedback.
Comments stay beside the behavior they explain, including request invalidation and save guards.
Custom type declarations and error definitions live together in `shared/contracts/`; components
import named prop types, and error messages are shared across validation and HTTP boundaries.
Blank lines separate state declarations, guards, request phases, and returned results.
Zod handles shape checks and parsing; domain refinements enforce window overlap, unique IDs,
override modes, and the inclusive range limit. API responses are validated before entering
React state, rather than trusted through a TypeScript cast. Luxon owns timezone-aware dates
and calendar-day arithmetic. Minute intervals remain wall-clock values, including the 24:00
end boundary, rather than being converted into timestamps.

Run `npm run format:check` to check formatting, or `npm run format` to apply it. The build also
checks unused imports and parameters, which helps keep feature extractions tidy.

React keeps unsaved form drafts separate from saved schedule state. Saving invalidates results
and requires a new explicit search. Query changes invalidate results immediately. Request
versions prevent older responses from overwriting newer searches. Switching staff remounts the
workspace and discards drafts; pending saves disable staff switching and creation until their
success or failure is visible. Drafts do not survive a page refresh.

## Scheduling decisions

1. The single scheduling timezone is **America/Chicago**, visible in the header. Returned
   values are local calendar dates and wall-clock times, not appointment timestamps.
2. Dates use `YYYY-MM-DD`, from `0001-01-01` through `9999-12-31`. Both range endpoints are
   included, with at most 90 dates. Past dates are permitted.
3. Weekdays use Sunday = 0 through Saturday = 6. Luxon parses dates in America/Chicago and
   converts its weekday convention to this index. Date-only input is never interpreted in
   the machine's local timezone. Iteration increments calendar dates, not elapsed hours.
4. Window times are integer minutes after midnight. UI inputs accept `HH:MM`; `24:00` is
   permitted only as an end boundary. Start must be before end. Overnight windows are excluded.
5. Windows include the start and exclude the end. Submitted overlaps and duplicates are
   rejected; unsorted input is sorted. Touching windows are allowed and merged for calculation.
6. A date has at most one override. **Unavailable** means no hours and requires no windows.
   **Replace** uses only the override windows. **Add** takes the union of weekly and override
   windows, deliberately merging overlap between sources. Add and replace require windows.
7. Add can create availability on a day off. Deleting an override restores weekly behavior.
   Changing weekly hours affects all queried dates, including historical dates.
8. Durations are exactly 15, 30, 45, or 60 minutes. Normalize continuous windows first, then
   anchor the first start to each window's start and advance by the duration. Include a slot
   only if its end fits. Slots never cross a gap and overlapping sources cannot duplicate them.
9. Existing appointments block every slot they overlap, regardless of the queried duration.
   Touching appointments are allowed. Original window-based slot anchoring is preserved rather
   than restarted after a booking. A fully booked date has a distinct empty-state explanation.
10. Every date is returned, with effective windows, source, override mode if present, and slots.
    Empty results distinguish a recurring day off, an unavailable override, and windows too short
    for the chosen duration.

For example, 09:00-10:00 plus added 08:45-09:15 resolves to 08:45-10:00. Thirty-minute starts
are 08:45 and 09:15. Resolving availability before slot generation preserves this anchoring;
generating the two sources independently would yield duplicate or incorrectly aligned slots.

A new supported duration belongs in `DURATIONS` and the validation/tests. Overnight support
would need a different interval model, explicit ownership of hours on the following day, and
rules for how that following day's override interacts with the interval. DST clock gaps and
repeated hours are not resolved into real instants because booking timestamps are out of scope.

## Book appointments and view a staff schedule

1. Select a staff member, set working hours, and search for available slots.
2. Select an offered slot, enter an appointment title, and confirm the booking.
3. Open that staff member's booked schedule to filter appointments by date and cancel a booking.
4. Search again after booking or cancelling to see the updated free slots.

Booking validation and persistence run in the same synchronous repository update. A stale or
conflicting request returns 409; simultaneous requests for overlapping times cannot both succeed
within the supported single-server setup. Booking another staff member at the same time is allowed.
Appointments persist across restarts. Changes to weekly hours or overrides do not silently cancel
existing appointments; they remain visible in the staff schedule until explicitly cancelled.

## API

Business endpoints require a session. Mutations require a trusted Origin and CSRF token;
Users edit their own staff schedules, while Managers edit all schedules and create staff.
Anonymous access returns 401 and disallowed operations return 403. Validation failures return status 400 with `{ "error": "message" }`.
Unknown staff returns 404; persistence failures return 500 without claiming a successful save.

| Method and route                                    | Request                                                                           |
| --------------------------------------------------- | --------------------------------------------------------------------------------- |
| `GET /api/staff`                                    | None                                                                              |
| `POST /api/staff`                                   | `{ "name": "Taylor" }`                                                            |
| `GET /api/staff/:id/schedule`                       | None                                                                              |
| `PUT /api/staff/:id/weekly/:day`                    | `{ "windows": [{ "start": 540, "end": 1020 }] }`                                  |
| `PUT /api/staff/:id/overrides/:date`                | `{ "mode": "unavailable", "windows": [] }`                                        |
| `DELETE /api/staff/:id/overrides/:date`             | None                                                                              |
| `POST /api/staff/:id/appointments`                  | `{ "date": "2026-09-28", "title": "Consultation", "start": 540, "duration": 30 }` |
| `DELETE /api/staff/:id/appointments/:appointmentId` | None                                                                              |
| `POST /api/staff/:id/availability`                  | `{ "start": "2026-09-28", "end": "2026-09-30", "duration": 30 }`                  |

Weekly saves replace one weekday atomically, including an empty array for a day off. Override
saves create or replace one date. Names are trimmed and limited to 100 characters. Window
arrays are limited to 96 entries per submission. The server rejects malformed values rather
than coercing strings to numbers.

## Verification

The suite covers scheduling, validation, HTTP behavior, bookings, and persistence failures.
The core suite covers authentication, atomic audit history, PDF layout, mocked delivery,
retry/restart recovery and daily scheduling, including the full integration workflow.
The browser suite runs 37 scenarios at desktop and mobile sizes (74 checks).
See [testing](docs/testing.md) for release-gate evidence and reproducible commands.
See [testing and verification](docs/testing.md) for the manual acceptance procedure and limits.
The CI workflow runs the core automated suite; run `npm run test:e2e` for the browser suite.

## Scope and review notes

The initial scope prioritized availability; the follow-up adds appointment booking and agendas.
The extension includes authentication and weekly/override history with daily PDF reports.
External calendars, multiple scheduling timezones, calendar grids, bulk editing, staff deletion,
and real email delivery remain excluded. The server binds to loopback; multi-process hosting
would require coordinated storage and conflict handling.

Codex assisted with this documentation and setup. The pre-existing project notes also report
AI assistance with implementation, tests, review, and browser checks. The candidate must
confirm their own examples of a changed AI suggestion and a personally identified issue.
The earlier notes describe choosing JSON over SQLite; that history is retained, with its
confirmation status, in [AI usage](docs/ai-usage.md).

The main technical uncertainty is persistence beyond one server process. File replacement
and synchronous updates do not provide shared database transactions or revision checks.

## Interview specification checklist

Audited against "Interview Project - 202605 - Availability Scheduler.pdf".

| Required capability           | Implementation and verification                                                      |
| ----------------------------- | ------------------------------------------------------------------------------------ |
| Create staff members          | Staff creation form and validated API; duplicate names retain distinct IDs           |
| Recurring weekly availability | Seven weekday editors, multiple windows, explicit per-day saves                      |
| Date-specific overrides       | Unavailable, replace, and add modes; edit/delete controls and tests                  |
| Query a date range            | Staff selection, inclusive date controls, duration selector, date-grouped results    |
| Appointment duration          | 15, 30, 45, and 60 minutes; exact hour-window examples tested                        |
| Invalid window handling       | Server rejects reversed/equal times, overlaps, empty custom overrides, bad durations |
| Availability source           | Weekly, override, combined, and day-off labels with explanations                     |
| Fullstack application         | React interface, Express API, TypeScript, persistent JSON file                       |
| Testable scheduling logic     | Pure domain functions independent of React, Express, and filesystem                  |
| Setup and decision notes      | Commands, environment variables, assumptions, algorithm, and tradeoffs above         |
| AI transparency               | Documented assistance and confidence limits; personal examples await confirmation    |

The specification's Jane Smith example is an API integration test: May 25 returns 09:00,
09:30, 10:00, and 10:30; May 26 has no weekly hours; May 27 is unavailable by override.
The same test verifies May 28 replacement hours of 10:00-14:00 and May 29 added hours of
17:00-19:00. It also saves multiple windows on one weekday.

Automated tests are an implemented nice-to-have. An optional demo seed is available; calendar grids and bulk editing
are intentionally omitted. Authentication is implemented; calendar integration remains excluded.
Booking and the staff agenda are extensions requested separately after the original scope.

The requested GitHub submission is still a handoff step: this local project has not been
published to GitHub. The application, documentation, CI workflow, and demo setup are prepared locally.
The candidate should confirm the AI notes before submission. This audit does not claim that
repository submission or the candidate's follow-up interview has been completed.

## Daily report demonstration

Run `npm run reports:demo` to generate two days of captured reports in a new temporary
directory: one containing edits and one with no changes. The command prints the directory;
inspect `mail-capture/*/attachment.pdf`, `message.json`, and `demo-summary.json`. It never
reads or changes your normal data files, displays passwords, or sends real email. Remove
that temporary directory when finished. For live operation, the API creates daily jobs,
recovers missed days at startup, and retries individual failed recipients independently.
