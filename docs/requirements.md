# Requirements and submission checklist

Map the supplied interview brief to implementation, evidence, and remaining handoff steps.

The source is `Interview Project - 202605 - Availability Scheduler.pdf`. Its instructions
define the requested deliverable; they are not evidence that a GitHub submission has occurred.

| Requirement                         | Implementation                              | Evidence                                |
| ----------------------------------- | ------------------------------------------- | --------------------------------------- |
| Create staff                        | Staff form and staff routes                 | `tests/api.test.ts`                     |
| Multiple weekly windows             | Weekly editors, per-day PUT                 | API and scheduling tests                |
| Unavailable, replace, add overrides | Override form and schedule routes           | API and scheduling tests                |
| Staff, date range, duration search  | Availability feature and route              | PDF example API test                    |
| 15/30/45/60-minute slots            | Shared durations and scheduling functions   | `tests/scheduling.test.ts`              |
| Reject invalid availability         | Shared Zod schemas and readable errors      | Validation, API, scheduling tests       |
| Explain availability source         | Day result source/mode/reason and UI labels | Scheduling tests; manual UI check       |
| Frontend and backend                | React/Vite and Express                      | Type-check/build; local workflow        |
| Persistence across refresh          | Validated JSON store                        | API restart and store-boundary tests    |
| Clear, testable core logic          | Independent scheduling functions            | Domain test suite                       |
| Local setup and environment         | README and setup guide                      | Clean install and built-app smoke check |
| Assumptions and tradeoffs           | README and architecture guide               | Code-linked explanations                |
| AI-use notes                        | AI-usage guide                              | Personal confirmations still needed     |
| GitHub repository                   | Workflow, template, publishing guide        | Remote publication still needed         |

Optional tests are implemented; optional seed data is now available. Calendar grids and bulk
weekly editing are omitted. Calendar integrations remain outside the scope. Authentication
is included in the extension requirements below.
Booking and staff agendas already exist as extensions beyond the brief's core availability work.

## Before sending the repository

- [ ] Confirm personal AI-use examples and least-confidence reflection.
- [ ] Commit and push to the chosen GitHub repository.
- [ ] Confirm CI passes on the submitted commit.
- [ ] Confirm interviewers can access the repository.
- [ ] Follow setup from a clean checkout and rehearse the demo.
- [ ] Review architecture and explain one scheduling edge case unaided.

No candidate time-spent claim is supplied: the brief's two-hour expectation is not a measured
record of work performed. See [GitHub setup](github.md) and [interview walkthrough](interview-guide.md).

## Authentication and daily report requirements

The accepted implementation specification is [the authentication and daily report
plan](auth-and-daily-reports-plan.md). Its proposed defaults are the implementation
requirements for this delivery:

- One organization; no tenant IDs or organization switching.
- Roles are `user` and `manager`. Users link to exactly one existing staff record;
  Managers may have no staff link. Both roles can read every schedule and search
  availability. Users can edit only their own weekly hours, overrides, and appointments.
  Managers can edit all schedules and create staff. Staff creation does not create an account.
- APIs return 401 for anonymous access, 403 for disallowed authenticated operations,
  and 404 for unknown staff IDs. Credentials are private for both roles. Availability
  search is a read operation despite its POST method.
- Accounts are provisioned locally using hidden password input. No registration,
  password reset emails, or account-management screens are included. Store salted scrypt
  hashes and use opaque, eight-hour in-memory sessions with CSRF and same-origin checks.
- Every active Manager receives a separate copy of the organization-wide daily PDF,
  including weekends and days without changes. User accounts never receive reports.
- Phase one reports at 09:00 in America/Chicago. Track weekly and override creations,
  updates, and deletions, including changes later undone; exclude appointments and no-op
  saves. Existing data is the migration baseline, not newly added availability.
- Intervals are half-open `[start, end)` UTC instants derived from successive local
  daily boundaries, never fixed 24-hour subtraction. The first start is
  `reportingStartedAt`; events exactly at cutoff belong to the following interval.
- Freeze a durable job before delivery. Its ID and cutoff are unique; its model contains
  ordered event snapshots, and each recipient retains an email snapshot and independent
  delivery state. Retry failures after 1, 5, and 15 minutes without resending confirmed
  successes. Resume unfinished jobs and catch up missed cutoffs on startup.
- Run one always-on API process with local versioned JSON files and atomic replacements.
  Email delivery is mocked through an injected capture adapter; no real messages are sent.
  SMTP acceptance followed by a crash before recording success can duplicate delivery;
  stable Message-IDs reduce this risk but cannot guarantee exactly-once email.
- Phase two uses one shared Manager-editable HH:mm setting with a read-only Chicago
  timezone. Apply it at the next occurrence strictly after saving; start the new interval
  at the preceding job cutoff. Preserve old jobs and reject obsolete timer revisions.
  Repeated local times use the first occurrence; nonexistent times shift to the first
  valid local time after the DST gap.

Contracts use small pure schemas and permission functions. Client-safe profiles are
allowlists in `shared/contracts/auth.ts`; events live in `shared/contracts/change-events.ts`, while delivery records stay server-side
in `server/reports/contracts.ts`. File storage, HTTP, and mail adapters enforce these
contracts without introducing those dependencies into the domain policy.

## Fixed-9am release gate

`tests/report-integration.test.ts` exercises two Users and Managers through authenticated
HTTP edits, verifies cross-staff rejection and read access, advances an injected clock to
Chicago 09:00, renders real PDFs into local mock email captures, resumes a partial failure
after restart without resending confirmed success, and captures an unchanged following day.
Existing bookings survive restart and remain excluded from change counts. `reports:demo`
provides a separate isolated demonstration with no real credentials or email delivery.

The release gate is `npm run verify` plus `npm run test:e2e`; neither substitutes for the
other. Phase two adds a Manager-only shared report-time form and API, persisted across reloads
and restarts. Its browser gate verifies new-time PDF capture, cancellation of the old cutoff,
error feedback, disabled reporting, and User rejection.
