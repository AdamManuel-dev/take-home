# Interview walkthrough

Demonstrate the application and explain the implementation with concrete examples.

## A five-minute demonstration

1. Start the [seeded demo](setup.md#demo-data). Explain that Jane is fictional demo data.
2. Select Jane and search May 25-29, 2026 at 30 minutes. Show weekly hours, a day off,
   an unavailable override, replacement hours, and combined hours in one result set.
3. Change to 45 minutes and search again. Monday now starts at 09:00 and 09:45;
   a 10:30 start cannot fit before 11:00.
4. Open weekly hours, add an overlapping window, and attempt to save. Show the validation
   message, remove the invalid draft, and keep the original saved hours.
5. Return to 30-minute availability, book Monday 09:00, and search again. Show that 09:00
   is gone. Open Booked schedule, cancel the booking, and show that the slot returns.
6. Refresh to demonstrate persistence. Create another staff member to show independent data.

Mutations change the demo file. For a clean rerun, use a new DATA_FILE path as described in
setup; the seed command intentionally refuses to overwrite your earlier demo.

## Code tour

Start with `shared/types.ts`: minutes within a day, seven weekday arrays, and one override per
date. Then open `server/scheduling.ts` and trace validation, date resolution, normalization,
slot generation, and booking exclusion. Use the 08:45 additive example in
[architecture](architecture.md#slot-generation) to explain why normalization comes first.

Next open `server/repository.ts` and `server/store.ts`. Explain why a file is sufficient for
this local exercise, why callers get copies, and why memory changes only after a successful
rename. Finish with `use-availability.ts` and `use-schedule.ts`: show how request versions
prevent stale results and how pending saves affect the UI.

## Questions to rehearse

| Question | Points to explain |
| --- | --- |
| Why JSON instead of a database? | No setup; small local scope; explicit concurrency and durability limits |
| Why minutes instead of Date objects? | Recurring wall-clock hours; date and timezone handled separately |
| How do overrides interact? | One per date; unavailable clears, replace replaces, add unions |
| Why merge touching windows? | They form continuous hours; slots may cross a shared boundary |
| What prevents double booking? | Check and write are synchronous in one process; conflicts return 409 |
| What happens after a save fails? | Committed memory stays intact; error shown; drafts remain editable |
| What would production need? | Transactional storage, versioned edits, explicit timestamp/DST policy |
| What did AI contribute? | Give accurate examples from your confirmed AI-use notes |

## Practice a small change

For a 20-minute duration, begin with `DURATIONS` in `shared/types.ts`. Explain that query and
booking schemas share this list and the UI maps it into choices. Add behavior tests for three
20-minute starts in a 09:00-10:00 window and for a conflict with an existing booking. Run
`npm run verify`, then check the selector and booking flow manually. This is a practice prompt;
20 minutes is not enabled by the current implementation.

For overnight hours, do not merely allow end before start. First decide which date owns the
next-day portion and how next-day overrides apply. That requires a model and policy change.
