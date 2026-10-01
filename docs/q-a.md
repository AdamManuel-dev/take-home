**1. How do you run the project locally? What commands, environment variables, migrations, or seed steps are required?**

From the repository root, run:

```sh
npm ci
npm run dev
```

The development frontend runs at `http://127.0.0.1:5173`, and Express runs on port `3001`. Vite forwards `/api` requests to Express. The development command starts both processes together.

For the built application:

```sh
npm run build
npm start
```

Then open `http://127.0.0.1:3001`. The build checks TypeScript and builds the frontend; the backend still runs through `tsx`.

There are two optional environment variables:

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `3001` | Express listening port |
| `DATA_FILE` | `data/schedules.json` | Persistent JSON file |

No database installation or migration is required. The application starts with an empty staff list if the data file does not exist. Environment variables are read from the process; there is no automatic `.env` loader.

Optional demonstration data can be created with:

```sh
npm run seed:demo
DATA_FILE=data/demo-schedules.json npm run dev
```

The seed command refuses to overwrite an existing file. Select Jane Smith and search May 25–29, 2026.

**Code:** [Run and verification commands](/Users/adammanuel/Downloads/takehome/package.json:6), [development proxy](/Users/adammanuel/Downloads/takehome/vite.config.ts:5), [server startup](/Users/adammanuel/Downloads/takehome/server/index.ts:4), [storage configuration](/Users/adammanuel/Downloads/takehome/server/store.ts:23), [demo seed](/Users/adammanuel/Downloads/takehome/scripts/seed-demo.ts:6).

**2. What assumptions does the implementation make?**

The implementation makes these scheduling assumptions:

- All schedules use `America/Chicago`.
- Weekly availability repeats indefinitely; it has no effective start or end date.
- A staff member has at most one override per calendar date.
- Windows use whole minutes within one day. Overnight windows are unsupported.
- `24:00` is valid only as an ending boundary.
- Search ranges include both endpoints and contain at most 90 dates.
- Supported durations are 15, 30, 45, and 60 minutes.
- Each continuous availability window starts its own duration-sized slot grid.
- Staff identities are UUIDs; duplicate names are allowed.
- Existing appointments remain stored when availability changes.
- Persistence supports one application process using a local file.

A key distinction is that these are **local calendar dates and wall-clock minutes**, not UTC appointment timestamps. Calendar-day iteration handles daylight-saving date transitions, but the model does not resolve ambiguous or nonexistent local times into real instants.

**Code:** [Timezone and durations](/Users/adammanuel/Downloads/takehome/shared/constants.ts:1), [window boundaries](/Users/adammanuel/Downloads/takehome/shared/schemas.ts:20), [query limits](/Users/adammanuel/Downloads/takehome/shared/schemas.ts:64), [calendar-day handling](/Users/adammanuel/Downloads/takehome/shared/dates.ts:4), [existing appointment policy](/Users/adammanuel/Downloads/takehome/shared/schemas.ts:126).

**3. Walk through the scheduling data model. Are staff, recurring availability, overrides, and windows modeled clearly?**

A staff member has an `id` and `name`. The persisted staff record combines that identity with a schedule.

The schedule contains:

| Field | Representation | Meaning |
|---|---|---|
| `weekly` | Seven arrays of windows | Sunday is index 0; Saturday is index 6 |
| `overrides` | Date-specific records | Each has a date, mode, and windows |
| `appointments` | Appointment records | Each has an ID, title, date, start, and end |

A window is `{ start, end }`, measured in minutes after midnight. For example, 09:00–10:30 is `{ start: 540, end: 630 }`.

Intervals use half-open semantics: the start is included and the end is excluded. Consequently, an appointment ending at 10:00 does not conflict with one starting at 10:00.

Minutes make recurring hours straightforward to compare, sort, merge, and divide into slots. The calendar date is handled separately so a weekly 09:00 start is not accidentally tied to one particular timestamp.

The storage envelope contains `version: 1` and a staff array. Runtime schemas enforce seven weekdays, unique staff IDs, and unique override dates per staff member. Older version-one records may omit appointments.

**Code:** [Domain types](/Users/adammanuel/Downloads/takehome/shared/contracts/types.ts:4), [persisted record and envelope](/Users/adammanuel/Downloads/takehome/shared/contracts/persistence.ts:3), [schedule invariants](/Users/adammanuel/Downloads/takehome/shared/schemas.ts:145), [new staff initialization](/Users/adammanuel/Downloads/takehome/server/store.ts:76).

**4. Given a staff member, date range, and appointment duration, how are available start times calculated?**

The central function is `calculateAvailability`. Its process is:

1. Validate the dates, their ordering, the range length, and the duration.
2. Build the inclusive list of calendar dates.
3. Index overrides by date.
4. For each date, select the corresponding weekday’s recurring windows.
5. Apply that date’s override.
6. Normalize the resulting windows into continuous, non-overlapping intervals.
7. Generate slots from each interval’s beginning, advancing by the appointment duration.
8. Remove slots that intersect existing appointments.
9. Return the date, effective windows, available slots, source, and any empty-result explanation.

A slot is emitted only when:

```ts
minute + duration <= window.end
```

For a 09:00–10:00 window:

| Duration | Available starts |
|---|---|
| 15 minutes | 09:00, 09:15, 09:30, 09:45 |
| 30 minutes | 09:00, 09:30 |
| 45 minutes | 09:00 |
| 60 minutes | 09:00 |

Separate windows have separate grids. For 09:00–10:00 and 10:30–11:30, no appointment crosses the 10:00–10:30 break.

Booking filtering preserves the original grid. If a 09:00–09:15 appointment exists, a 30-minute search removes the 09:00 candidate and retains 09:30; it does not introduce a new 09:15 start.

**Code:** [Main calculation](/Users/adammanuel/Downloads/takehome/server/scheduling.ts:188), [inclusive dates](/Users/adammanuel/Downloads/takehome/server/scheduling.ts:25), [slot generation](/Users/adammanuel/Downloads/takehome/server/scheduling.ts:111), [booking exclusion](/Users/adammanuel/Downloads/takehome/server/scheduling.ts:160).

**Tests:** [Supported durations](/Users/adammanuel/Downloads/takehome/tests/scheduling.test.ts:30), [appointments cannot cross breaks](/Users/adammanuel/Downloads/takehome/tests/scheduling.test.ts:69).

**5. How do date-specific overrides interact with recurring availability?**

An override applies to one date and uses one of three modes:

| Mode | Behavior |
|---|---|
| `unavailable` | Clears all availability for the date |
| `replace` | Uses only the override’s windows |
| `add` | Combines recurring windows with additional windows |

Without an override, recurring availability applies.

For example, if weekly hours are 09:00–17:00:

- An unavailable override produces no windows.
- A replacement of 10:00–14:00 produces only 10:00–14:00.
- An addition of 17:00–19:00 produces continuous availability from 09:00–19:00.

Overlapping or touching effective windows are merged **before** generating slots. That order matters: weekly hours of 09:00–10:00 plus added hours of 08:45–09:15 become 08:45–10:00. At 30 minutes, the starts are 08:45 and 09:15.

Overlaps within one submitted list are rejected, while overlaps between weekly hours and an additive override are deliberately merged.

Saving an override replaces any existing override for that date. Deleting it restores the recurring policy.

**Code:** [Override resolution](/Users/adammanuel/Downloads/takehome/server/scheduling.ts:88), [window normalization](/Users/adammanuel/Downloads/takehome/server/scheduling.ts:64), [override upsert](/Users/adammanuel/Downloads/takehome/server/routes/schedule-routes.ts:58), [override deletion](/Users/adammanuel/Downloads/takehome/server/routes/schedule-routes.ts:91).

**Test:** [Additive overlap changes the slot grid](/Users/adammanuel/Downloads/takehome/tests/scheduling.test.ts:148).

**6. How does the app prevent invalid availability windows and other invalid inputs?**

Shared Zod schemas provide runtime validation. TypeScript describes expected shapes during development; Zod checks actual submitted values.

The window rules require integer minutes, valid daily boundaries, and `start < end`. Window lists reject overlapping intervals but allow adjacent intervals. Weekly days can be empty, representing a day off.

Override validation requires:

- Zero windows for `unavailable`.
- At least one window for `replace` or `add`.

Duration validation accepts only the supported list, so zero, negative numbers, and unsupported positive durations are rejected.

Date queries reject impossible dates, reversed ranges, and more than 90 inclusive dates. Staff names are trimmed and must contain between 1 and 100 characters.

The server validates before updating storage. Invalid submissions return HTTP 400 and do not replace saved schedules. Unknown staff IDs return 404.

**Code:** [Window and overlap validation](/Users/adammanuel/Downloads/takehome/shared/schemas.ts:20), [override validation](/Users/adammanuel/Downloads/takehome/shared/schemas.ts:43), [duration validation](/Users/adammanuel/Downloads/takehome/shared/schemas.ts:12), [staff-name validation](/Users/adammanuel/Downloads/takehome/shared/schemas.ts:78), [HTTP error mapping](/Users/adammanuel/Downloads/takehome/server/app.ts:40).

**Test:** [Invalid saves preserve existing data](/Users/adammanuel/Downloads/takehome/tests/api.test.ts:125).

**7. Does the main availability workflow work end to end?**

The implementation connects the complete workflow:

1. Create a staff member through the API.
2. Save recurring windows for a weekday.
3. Save any date-specific exceptions.
4. Submit a staff-scoped availability query.
5. Calculate availability from the saved schedule.
6. Validate and display the response.

Staff data is isolated by ID, so two people with the same name retain independent schedules.

The API test suite exercises creation, schedule updates, overrides, searches, and reopening the persisted store. A dedicated test also reproduces the brief’s Jane Smith example.

For the unmodified demo data, a 30-minute search for May 25–29, 2026 produces:

| Date | Result |
|---|---|
| May 25 | Weekly starts: 09:00, 09:30, 10:00, 10:30 |
| May 26 | No recurring availability |
| May 27 | Unavailable because of an override |
| May 28 | Replacement starts from 10:00 through 13:30 |
| May 29 | Weekly starts at 09:00 and 09:30, plus 17:00, 17:30, 18:00, 18:30 |

**Code:** [Staff creation endpoint](/Users/adammanuel/Downloads/takehome/server/routes/staff-routes.ts:17), [weekly update endpoint](/Users/adammanuel/Downloads/takehome/server/routes/schedule-routes.ts:30), [availability endpoint](/Users/adammanuel/Downloads/takehome/server/routes/availability-routes.ts:10), [frontend search](/Users/adammanuel/Downloads/takehome/src/features/availability/use-availability.ts:59).

**Tests:** [Complete persisted workflow](/Users/adammanuel/Downloads/takehome/tests/api.test.ts:25), [PDF example](/Users/adammanuel/Downloads/takehome/tests/api.test.ts:215).

**8. Can users understand where availability comes from and why no slots appear?**

Each date result carries `source`, optional override `mode`, effective `windows`, available `slots`, and an optional explanatory `reason`.

The UI translates those fields into labels such as “Weekly hours,” “Weekly + added,” “Replaced hours,” and “Day off override.”

Empty results distinguish four situations:

- A date override makes the staff member unavailable.
- No recurring hours exist.
- Hours exist, but the selected duration does not fit.
- Candidate slots exist, but appointments block all of them.

The distinction between `windows` and `slots` is important. Windows describe working hours before booking filtering. Slots describe the remaining bookable appointments. A day may therefore show weekly hours while having no available slots.

The client also validates successful API responses before presenting slot choices.

**Code:** [Result contract](/Users/adammanuel/Downloads/takehome/shared/contracts/types.ts:20), [empty-result explanations](/Users/adammanuel/Downloads/takehome/server/scheduling.ts:129), [source labels and display](/Users/adammanuel/Downloads/takehome/src/features/availability/availability-day.tsx:7), [response validation](/Users/adammanuel/Downloads/takehome/src/shared/lib/api.ts:45).

**9. How is the code organized, and why is the scheduling logic testable?**

The application separates four responsibilities:

| Area | Responsibility |
|---|---|
| React features | Forms, rendering, and frontend request state |
| Express routes | HTTP input, orchestration, and responses |
| Domain functions | Availability calculation and booking validation |
| Repository | Reading and persisting staff records |

Shared contracts and schemas define data shapes and validation rules across those boundaries.

The scheduling function takes a schedule, dates, and duration and returns results. It does not read files, access React state, or require an HTTP server, so tests can exercise scheduling rules directly.

`createApp` accepts a `StaffRepository`, allowing HTTP tests to construct an application around isolated storage. The executable server entry point is separate from application composition.

The structure is deliberately modest: it uses functions and a small repository interface rather than a dependency-injection framework or a class for every operation.

**Code:** [Application composition](/Users/adammanuel/Downloads/takehome/server/app.ts:16), [repository interface](/Users/adammanuel/Downloads/takehome/shared/contracts/persistence.ts:6), [domain calculation](/Users/adammanuel/Downloads/takehome/server/scheduling.ts:188), [frontend composition](/Users/adammanuel/Downloads/takehome/src/app.tsx:8).

**10. Explain one technical tradeoff made for the exercise.**

The clearest tradeoff is local JSON persistence.

It makes the application easy to run: there is no database service, migration process, or connection configuration. A reviewer can start the project and inspect its stored data directly.

The implementation still protects the local save path. It clones committed state, changes the clone, writes a unique temporary file beside the destination, and renames that file over the destination. Only after the rename succeeds does it replace committed memory. Reads return defensive copies.

The cost is limited scalability and concurrency. Writes serialize the entire dataset and block the Node process. Separate server processes do not share a lock or refresh each other’s in-memory state. There is no optimistic revision check or explicit `fsync` durability guarantee.

For a multi-user deployment, a transactional database and explicit concurrent-edit policy would be appropriate. That migration would require asynchronous repository operations and transaction boundaries around booking checks and inserts.

This explains the implementation’s tradeoff; the code alone does not establish how much development time it saved.

**Code:** [Defensive reads](/Users/adammanuel/Downloads/takehome/server/store.ts:43), [file commit](/Users/adammanuel/Downloads/takehome/server/store.ts:52), [cloned update](/Users/adammanuel/Downloads/takehome/server/store.ts:94).

**Test:** [Failed replacement preserves committed memory](/Users/adammanuel/Downloads/takehome/tests/store-boundaries.test.ts:64).

**11. How are stale results, failed saves, and double bookings handled?**

Availability searches use a monotonically increasing request version. Changing the query or invalidating results increments that version. A response updates the screen only if it still matches the current version.

Schedule mutations use an immediate reference-based guard to prevent another mutation before React renders the disabled controls. Saved state changes only after a successful response. Failures retain the last saved schedule and display an error.

Staff workspaces are keyed by staff ID, which resets local workspace state when the selected staff member changes.

Booking protection also exists on the server. Inside `Store.update`, booking validation recalculates current availability and requires the requested start to match an offered slot. Within one Node process, synchronous checking and saving prevent another booking operation from interleaving. Conflicts return HTTP 409.

This guarantee is limited to the supported single-process store.

**Code:** [Stale-response protection](/Users/adammanuel/Downloads/takehome/src/features/availability/use-availability.ts:49), [mutation handling](/Users/adammanuel/Downloads/takehome/src/features/schedule/use-schedule.ts:62), [staff workspace identity](/Users/adammanuel/Downloads/takehome/src/app.tsx:33), [booking transaction callback](/Users/adammanuel/Downloads/takehome/server/routes/appointments-routes.ts:18), [current-slot validation](/Users/adammanuel/Downloads/takehome/server/appointments.ts:9).

**Test:** [Simultaneous and overlapping bookings](/Users/adammanuel/Downloads/takehome/tests/appointments.test.ts:100).

**12. Which AI tools were used, and what did AI help with?**

The repository’s existing notes identify **Codex** and report assistance with implementation, automated tests, documentation, architecture review, and browser verification.

A suitable answer, once confirmed against your actual experience, is:

“Codex helped with implementation, tests, documentation, and review. I remain responsible for understanding the scheduling rules, checking generated changes, and explaining the resulting behavior. The important areas to verify were override precedence, continuous-window normalization, persistence failures, and stale frontend requests.”

Those responsibilities can be demonstrated with concrete code and tests. However, source files cannot prove who authored a particular implementation or discovered a particular issue. The existing notes explicitly acknowledge that limitation.

**Recorded history:** [AI tools and uses](/Users/adammanuel/Downloads/takehome/docs/ai-usage.md:5).

**Concrete discussion points:** [Override calculation](/Users/adammanuel/Downloads/takehome/server/scheduling.ts:88), [scheduling tests](/Users/adammanuel/Downloads/takehome/tests/scheduling.test.ts:107), [failed-write test](/Users/adammanuel/Downloads/takehome/tests/store-boundaries.test.ts:64), [stale-search protection](/Users/adammanuel/Downloads/takehome/src/features/availability/use-availability.ts:59).

**13. What AI-generated suggestion did you change or reject?**

**Personal confirmation required.** The existing notes describe rejecting an initial SQLite proposal in favor of JSON storage.

If that accurately reflects your experience, a detailed answer is:

“I changed the proposed persistence approach from SQLite to a local JSON file because the exercise permitted file storage and emphasized a small, runnable application. I kept persistence behind a repository interface and added defensive copying and temporary-file replacement so failed saves would not publish uncommitted state. I accepted that the result supports one application process and would need a different persistence strategy for production concurrency.”

The implementation supports this technical explanation, but it does not prove that you personally rejected the suggestion.

**Recorded example:** [Unconfirmed SQLite decision](/Users/adammanuel/Downloads/takehome/docs/ai-usage.md:16).

**Code:** [Repository boundary](/Users/adammanuel/Downloads/takehome/shared/contracts/persistence.ts:6), [JSON persistence implementation](/Users/adammanuel/Downloads/takehome/server/store.ts:52).

**14. What bug, edge case, or design issue did you identify yourself?**

**Personal confirmation required.** The repository does not establish a confirmed personal discovery. Its notes attribute the pending-save staff-switching issue to an AI reviewer, so that should not be presented as your own finding.

A useful edge case to explain technically is normalization before slot generation:

“An additive override can extend the beginning of a recurring window. If weekly and added hours are converted into slots separately, the result uses inconsistent grids. The correct approach is to union the effective windows first, then generate slots from the beginning of the merged interval.”

For weekly 09:00–10:00 plus added 08:45–09:15, a 30-minute search must return 08:45 and 09:15.

You can explain that behavior confidently from the code. Claim personal discovery only if you actually identified it; otherwise use a real example from your development experience.

**Code:** [Normalize effective hours first](/Users/adammanuel/Downloads/takehome/server/scheduling.ts:104), [then generate slots](/Users/adammanuel/Downloads/takehome/server/scheduling.ts:155).

**Evidence:** [Regression test](/Users/adammanuel/Downloads/takehome/tests/scheduling.test.ts:148), [ownership notes](/Users/adammanuel/Downloads/takehome/docs/ai-usage.md:23).

**15. What part of the code are you least confident in?**

Your personal confidence is something only you can state. A technically grounded area to discuss is persistence under conditions beyond the supported local deployment.

A possible answer, if it matches your assessment, is:

“The area I would examine most carefully before production is persistence and concurrent editing. The current code protects against failed local replacement and serializes updates in one process, but it does not coordinate multiple servers or prevent one browser’s schedule edit from overwriting another browser’s edit. My next step would be transactional storage, explicit revisions for edits, and concurrency tests.”

A second boundary is timezone policy. The application correctly iterates calendar dates in Chicago, but it does not model UTC instants or resolve repeated and nonexistent clock times during DST transitions.

These are explicit limits to investigate, rather than claims that the tested local scheduling behavior is failing.

**Code:** [Persistence commit](/Users/adammanuel/Downloads/takehome/server/store.ts:52), [update behavior](/Users/adammanuel/Downloads/takehome/server/store.ts:95), [calendar-date handling](/Users/adammanuel/Downloads/takehome/shared/dates.ts:4).

**Tests defining current coverage:** [Store failure boundary](/Users/adammanuel/Downloads/takehome/tests/store-boundaries.test.ts:64), [calendar-day DST transitions](/Users/adammanuel/Downloads/takehome/tests/dates-and-validation.test.ts:25).

**16. How would you make a small change during the follow-up interview?**

A suitable example is adding support for 20-minute appointments.

First, add `20` to `DURATIONS`. Both the duration schema and the UI selector consume that constant, so the option becomes available consistently in searches and booking validation.

The slot-generation algorithm already accepts a duration parameter, so its loop does not need to change.

Then add or update tests to establish that:

- A 09:00–10:00 window produces starts at 09:00, 09:20, and 09:40.
- A shorter remaining fragment does not produce a partial slot.
- Existing appointments remove intersecting 20-minute candidates.
- Booking and reloading a 20-minute appointment works.
- Unsupported durations remain rejected.

Run `npm run verify`, then exercise the selector and booking flow. Review tests that enumerate supported or unsupported durations because adding an option changes that contract.

This is a proposed interview change; 20-minute appointments are not currently enabled.

**Code:** [Duration list](/Users/adammanuel/Downloads/takehome/shared/constants.ts:15), [shared duration validation](/Users/adammanuel/Downloads/takehome/shared/schemas.ts:13), [UI duration choices](/Users/adammanuel/Downloads/takehome/src/features/availability/availability-search-form.tsx:60), [generic slot loop](/Users/adammanuel/Downloads/takehome/server/scheduling.ts:111), [persisted appointment duration validation](/Users/adammanuel/Downloads/takehome/shared/schemas.ts:114).

**Tests to extend:** [Duration behavior](/Users/adammanuel/Downloads/takehome/tests/scheduling.test.ts:30), [booking lifecycle](/Users/adammanuel/Downloads/takehome/tests/appointments.test.ts:52).