# Requirements and submission checklist

Map the supplied interview brief to implementation, evidence, and remaining handoff steps.

The source is `Interview Project - 202605 - Availability Scheduler.pdf`. Its instructions
define the requested deliverable; they are not evidence that a GitHub submission has occurred.

| Requirement | Implementation | Evidence |
| --- | --- | --- |
| Create staff | Staff form and staff routes | `tests/api.test.ts` |
| Multiple weekly windows | Weekly editors, per-day PUT | API and scheduling tests |
| Unavailable, replace, add overrides | Override form and schedule routes | API and scheduling tests |
| Staff, date range, duration search | Availability feature and route | PDF example API test |
| 15/30/45/60-minute slots | Shared durations and scheduling functions | `tests/scheduling.test.ts` |
| Reject invalid availability | Shared Zod schemas and readable errors | Validation, API, scheduling tests |
| Explain availability source | Day result source/mode/reason and UI labels | Scheduling tests; manual UI check |
| Frontend and backend | React/Vite and Express | Type-check/build; local workflow |
| Persistence across refresh | Validated JSON store | API restart and store-boundary tests |
| Clear, testable core logic | Independent scheduling functions | Domain test suite |
| Local setup and environment | README and setup guide | Clean install and built-app smoke check |
| Assumptions and tradeoffs | README and architecture guide | Code-linked explanations |
| AI-use notes | AI-usage guide | Personal confirmations still needed |
| GitHub repository | Workflow, template, publishing guide | Remote publication still needed |

Optional tests are implemented; optional seed data is now available. Calendar grids and bulk
weekly editing are omitted. Authentication and calendar integrations are explicit non-goals.
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
