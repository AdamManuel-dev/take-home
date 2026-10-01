# Architecture and technical decisions

Explain the current implementation, its boundaries, and the tradeoffs behind the scheduler.

## System shape

This is one application with a React frontend, an Express HTTP API, and local JSON storage.
During development Vite proxies API calls; after a frontend build, Express serves both the API
and static assets. Shared TypeScript contracts connect the client and server.

The existing editable drawings are [application architecture](../scheduler-architecture.drawio)
and [data contracts](../scheduler-data-contracts.drawio). They are earlier design references;
some labels predate the feature-directory refactor. The paths below describe the current code.

| Boundary            | Main files                                       | Responsibility                                                |
| ------------------- | ------------------------------------------------ | ------------------------------------------------------------- |
| Composition         | `server/index.ts`                                | Compose storage, authentication, reporting, cron and shutdown |
| HTTP adapter        | `server/app.ts`, `server/routes/`                | Validate requests, coordinate saves, map errors               |
| Domain              | `server/scheduling.ts`, `server/appointments.ts` | Calculate slots and validate bookings                         |
| Contracts           | `shared/contracts/`, `shared/schemas.ts`         | Shapes, constants, and runtime validation                     |
| Date policy         | `shared/dates.ts`                                | Calendar dates in America/Chicago                             |
| Persistence port    | `shared/contracts/persistence.ts`                | List, get, create, and update staff records                   |
| Persistence adapter | `server/store.ts`, `server/stored-data.ts`       | Validate and replace JSON storage                             |
| Frontend features   | `src/features/`                                  | Staff, schedules, overrides, availability, appointments       |
| HTTP client         | `src/shared/lib/api.ts`                          | Fetch JSON and validate response contracts                    |

This uses layered separation and a repository interface. It is not a full domain-driven design
framework: there are no aggregate classes, dependency-injection container, or separate use-case
class for every route. The domain is independent of React, Express, and disk, but deliberately
uses Zod and Luxon through shared helpers. Short orchestration stays in route handlers.

## Data model

The schedule storage object has `version: 2`, a `staff` array, `reportingStartedAt`,
`nextChangeSequence`, and `changes`. Version 1 is backed up before automatic migration. Each staff record owns its weekly
windows, overrides, and appointments. This small aggregate is saved as a unit.

| Value       | Meaning and invariant                                                      |
| ----------- | -------------------------------------------------------------------------- |
| Staff `id`  | Stable string; normal staff creation generates a UUID; names may repeat    |
| `weekly`    | Exactly seven window arrays; index 0 is Sunday and 6 is Saturday           |
| Window      | Integer minutes `[start, end)` within one day; `0 <= start < end <= 1440`  |
| Override    | Unique date per staff, a mode, and windows appropriate to that mode        |
| Appointment | Unique ID per staff, title, date, start, and end; no same-day overlaps     |
| Day result  | Date, effective windows, remaining slots, source, optional mode and reason |

There are no IDs for individual weekly windows: saving a weekday replaces that day's array.
The same applies to an override's windows. Appointments have IDs because they are cancelled
individually. Older version-one files may omit `appointments`; readers treat them as empty.

## A search from browser to result

1. The form builds a staff-scoped request containing start date, end date, and duration.
2. `useAvailability` validates the query and records a request version.
3. `api` sends JSON to the availability route; the staff guard rejects unknown IDs.
4. The route obtains a detached schedule from the repository and calls `calculateAvailability`.
5. The domain resolves each date, generates slots, and returns a result for every date.
6. The client validates the response with Zod. Only the current request version updates the UI.

Changing dates, duration, or saved schedule invalidates results. Changing staff remounts the
workspace. This prevents an older successful request from showing slots for the wrong query.

## Slot generation

1. Validate real ISO calendar dates, an inclusive range of at most 90 days, and a supported
   duration: 15, 30, 45, or 60 minutes.
2. Select the recurring windows for each date's weekday in America/Chicago.
3. Resolve that date's override: unavailable clears the day, replace uses custom windows,
   and add unions custom and weekly windows. No override uses weekly windows.
4. Sort and merge touching or overlapping effective windows. Input overlaps within a submitted
   list are invalid, but overlap between weekly hours and added hours is intentionally merged.
5. Starting at each merged window's beginning, emit a slot while its end fits, advancing by the
   chosen duration. Each separate window starts its own grid; no slot crosses an actual gap.
6. Remove any slot overlapping an existing appointment. Preserve the original grid.
7. Return source and empty-result reasons alongside effective windows and remaining slots.

For 09:00-10:00, a 30-minute search yields 09:00 and 09:30; 45 minutes yields only 09:00.
For 09:00-10:00 plus added 08:45-09:15, normalize to 08:45-10:00 first. Thirty-minute
starts are 08:45 and 09:15. Generating each source separately would give the wrong grid.

If a 09:00-09:15 appointment blocks a 09:00-10:00 window, a 30-minute search retains only
09:30. It does not invent a new 09:15 start. Overlap is `a.start < b.end && a.end > b.start`,
so adjacent appointments can touch without conflict.

`source` describes the hours policy: `weekly`, `override`, `combined`, or `none`. It does not
promise that a slot remains after duration and booking filters. Effective `windows` are the
resolved working hours before booking filtering; `slots` are the bookable candidates.

For W effective input windows, A appointments, and S generated slots per date, normalization
costs O(W log W) and filtering is O(S * A). The current implementation also scans appointments
for each queried date. With a 90-day query limit and a small local dataset this favors clarity;
large booking histories would benefit from indexing appointments by date.

## Saving and booking consistency

The browser serializes its schedule mutations and shows pending/success/error state. Staff
switching is disabled while saving. This is usability protection, not a database lock.

Store mutations clone committed data, apply the change, write a unique sibling temporary file,
and rename it over the target file. Committed memory changes only after rename succeeds.
This prevents a failed write from appearing successful in memory. Reads return defensive copies.

Booking checks availability inside the synchronous update callback, against current committed
data. Two overlapping booking requests cannot both succeed within this single Node process.
A conflicting request returns 409. Updating hours never silently cancels existing bookings.

Atomic replacement is not a complete database transaction system: there is no cross-process
locking, fsync durability guarantee, revision check, or shared cache invalidation. Multiple
servers using one file can lose updates. Two browser schedule edits use last successful save
wins. An async database replacement would need an async repository contract and a transaction
around the booking check and insertion; simply swapping a file-write function is insufficient.

## Decisions and alternatives

| Decision                            | Benefit                                               | Cost or future change                              |
| ----------------------------------- | ----------------------------------------------------- | -------------------------------------------------- |
| JSON file                           | No database install; versioned local storage          | Whole-file synchronous writes; one process         |
| React with feature hooks            | Local state is sufficient and easy to trace           | Manual invalidation and request-version logic      |
| Shared Zod schemas                  | Validate requests, responses, and persisted input     | Client bundle includes validation code             |
| Luxon calendar dates                | Explicit timezone and calendar-day iteration          | Wall-clock intervals do not identify real instants |
| Duration-sized grid                 | Matches brief's examples; simple deterministic output | Does not offer every possible minute start         |
| One override per date               | Clear precedence and simple editing                   | Cannot compose several independent exceptions      |
| Separate drafts and saved state     | Failed saves do not masquerade as persisted edits     | Refresh or staff switch discards drafts            |
| Local authentication and mock email | Roles and reporting without external accounts         | In-memory sessions; no real email adapter          |

Dates may be historical. Weekly changes apply retroactively to searches. Overnight windows
are unsupported; 24:00 is an end boundary only. Calendar iteration handles DST date changes,
but nonexistent or repeated local clock times are not resolved to UTC instants. Real calendar
bookings would require an explicit DST disambiguation policy and timestamp model.

## Where to make a follow-up change

Add a duration in `shared/constants.ts` (`DURATIONS`), then check schema, UI, slot, and booking tests.
Change override rules in shared schemas and `server/scheduling.ts`, with matching form behavior.
Replace storage through `StaffRepository`, adapting routes for async calls and transaction
semantics if needed. Keep new business rules in domain functions instead of JSX or HTTP handlers.

## Authentication boundary

`server/auth/accounts.ts` validates account and staff-link invariants and atomically
replaces the private account file. Passwords use bounded asynchronous scrypt with random
salts. `AuthService` keeps token digests and absolute eight-hour expiry in memory. The HTTP
adapter checks session, activation, role, origin and CSRF independently of UI controls.
Profile parsing strips credential-bearing fields. Staff lookup precedes ownership rejection
for authenticated requests, preserving 404 for unknown IDs.

The client owns one session generation. Each business request checks its captured generation
before accepting a response, including after JSON body parsing. An old 401 cannot expire a
replacement identity. Changing identity remounts the entire staff workspace and discards all
previous drafts/results. Logout clears visible data immediately; an unconfirmed network logout
suppresses automatic session restoration on reload until the user explicitly signs in again.

## Change history and reporting ports

The schedule repository computes a pure normalized weekly/override diff inside its mutation
boundary. Real changes require trusted actor metadata. The edited schedule, event snapshots,
and next sequence are written in one replacement; failure publishes none of them. Booking
mutations retain the same synchronous conflict check and do not generate report events.

`ReportRepository` freezes jobs and merges recipient updates against current committed state.
`ReportRenderer`, `ReportMailer`, and `ReportScheduler` are injected ports. PDFKit renders the
frozen model; a bundled licensed Noto font preserves common international names and PDFKit
subsets used glyphs. Unsupported characters are explicit Unicode codepoint labels. Long rows
are continued deliberately, with repeated headers and page numbers.

`ReportingService` creates missed daily jobs synchronously from successive Chicago local-time
boundaries (09:00 by default), then triggers delivery independently. Intervals are half-open and derived with
calendar arithmetic across DST. A slow recipient cannot block a later day's durable job.
`ReportDelivery` snapshots active Managers before sending, checks eligibility again, tracks
independent retries and uses stable Message-IDs. Mock transports capture email locally;
no SMTP connection or real email delivery occurs. A future remote transport would retain
an unavoidable acceptance-before-status-persistence duplicate window.

A persisted shared time, revision, and next cutoff coordinate rescheduling with job creation.
Manager saves prepare replacement timers, commit settings, then activate the revision; obsolete
callbacks cannot create jobs. The settings form lives inside the keyed account workspace and
uses the same identity guards as schedule requests.

Only `server/index.ts` starts background schedules. Daily and minute callbacks use explicit
timezone/overlap protection; delivery also guards active recipient attempts. Startup catches
up missed intervals and recovers interrupted attempts. Shutdown cancels timers and bounds the
send drain. Multiple API replicas or concurrent offline administration need a coordinated
storage design; this implementation supports exactly one owning process.
