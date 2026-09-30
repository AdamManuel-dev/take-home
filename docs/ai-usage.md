# AI usage and ownership

Separate documented AI assistance from personal claims the candidate must confirm.

## Tools and uses

The pre-existing README reports that Codex assisted with implementation, automated tests,
documentation, architecture review, and browser verification. Those historical statements are
retained as prior project notes; this setup session does not independently establish the
full development history or the candidate's personal decisions.

In this session, Codex read the supplied brief and existing code, added setup and architecture
documentation, prepared GitHub CI and a pull request template, and added a separate demo-data
command. Validation performed for this work is recorded in [testing](testing.md).

## Changed or rejected AI suggestion

The prior README states that the candidate rejected an initial SQLite proposal as too much
for the exercise and chose a local JSON file. **Candidate confirmation required:** retain
that example only if it accurately reflects your experience. Otherwise replace it with an
actual suggestion you changed, why you changed it, and the code or behavior affected.

## Issue identified personally

The prior README attributes the storage-scope decision to the candidate and a pending-save
staff-switching issue to an AI reviewer. **Candidate confirmation required:** confirm the
storage example or provide a different issue you personally identified. Do not present an
AI finding as your own discovery. Explain how you reproduced or reasoned about the issue.

## Least-confident area

The technical area warranting the most caution is persistence beyond the supported single
process. Synchronous updates and file replacement do not provide cross-process locking,
optimistic revision checks, or database durability. The current tests establish the local
contract; they do not establish suitability for multiple application servers.

This is an evidence-based technical assessment, not a claim about the candidate's feelings.
Before submission, state your own least-confident area and what you would test or change next.

## Ownership before submission

Read `server/scheduling.ts`, `server/store.ts`, and the feature request hooks. Be able to explain
an additive override, a failed save, and a stale booking without relying on this document.
Confirm the personal examples above before presenting this as your own submission history.
