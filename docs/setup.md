# Setup and operation

Install, run, verify, and troubleshoot the scheduler on a local machine.

## Prerequisites

Use Node.js 24.6.0 (recorded in `.nvmrc`) and npm. Git is needed for repository workflows;
GitHub CLI is optional. No database server, external API key, or Docker is required. Local login accounts are required;
version 1 schedules migrate automatically with a backup.
If you use nvm, run `nvm install` and `nvm use` from the project root.

After cloning your repository, open a terminal in its root:

```sh
npm ci
npm run provision:account
npm run dev
```

Open <http://127.0.0.1:5173>. Two processes run together: Vite for the frontend and Express
on port 3001. Vite forwards `/api` requests to Express. Stop both with Ctrl+C.
Choose Manager during provisioning, provide a valid email, and leave staff ID blank.
Sign in to create staff; provision Users afterward with their staff IDs while the API is stopped.
A fresh checkout starts empty. Existing local schedules are retained.

## Commands

| Command                                | Purpose                                                           |
| -------------------------------------- | ----------------------------------------------------------------- |
| `npm ci`                               | Install exact dependencies from the committed lockfile            |
| `npm run dev`                          | Start frontend and backend with development reload                |
| `npm run verify`                       | Check source formatting, run tests, type-check, and build         |
| `npm test`                             | Run Node's test runner through tsx, using isolated temporary data |
| `npm run build`                        | Type-check and create the frontend in `dist/`                     |
| `npm start`                            | Run Express; serves the built frontend if `dist/` exists          |
| `npm run seed:demo`                    | Create a separate demo file; refuses to overwrite a file          |
| `npm run provision:account`            | Provision a local account through hidden password prompts         |
| `npm run reports:demo`                 | Create isolated mock PDF captures for a changed and unchanged day |
| `npm run reports:retry -- [report-id]` | Offline retry of exhausted failed recipients                      |
| `npm run format`                       | Format application, test, and script source                       |

For the built application, stop the dev server, run `npm run build`, then `npm start`.
Open <http://127.0.0.1:3001>. This still runs the TypeScript backend through `tsx`, so keep
development dependencies installed. `npm ci --omit=dev` is not a supported installation.

## Environment variables

| Variable            | Default                   | Behavior                                            |
| ------------------- | ------------------------- | --------------------------------------------------- |
| `PORT`              | `3001`                    | Backend listening port; server binds to `127.0.0.1` |
| `DATA_FILE`         | `data/schedules.json`     | Schedule and history storage                        |
| `USERS_FILE`        | `data/users.json`         | Private local accounts                              |
| `REPORTS_FILE`      | `data/reports.json`       | Jobs and recipient retry state                      |
| `MAIL_CAPTURE_DIR`  | `data/mail-capture`       | Mock email metadata and PDF output                  |
| `REPORTING_ENABLED` | Enabled                   | `false` disables reporting for this process         |
| `APP_ORIGIN`        | Local development origins | Required HTTPS application origin in production     |
| `NODE_ENV`          | Development               | `production` enables Secure session cookies         |

Set variables in the shell. The application does not automatically load a `.env` file.
For development, keep `PORT=3001` unless you also change the proxy in `vite.config.ts`.
For a built application, `PORT=3002 npm start` uses port 3002 with no proxy change.

macOS/Linux example:

```sh
DATA_FILE=data/demo-schedules.json npm run dev
```

PowerShell equivalent:

```powershell
$env:DATA_FILE = "data/demo-schedules.json"
npm run dev
```

PowerShell variables remain set in that terminal; use `Remove-Item Env:DATA_FILE` when done.
The POSIX inline assignment affects only that command.

## Demo data

Stop the application before choosing a different data file. Run:

```sh
npm run seed:demo
DATA_FILE=data/demo-schedules.json USERS_FILE=data/demo-users.json npm run provision:account
DATA_FILE=data/demo-schedules.json USERS_FILE=data/demo-users.json REPORTS_FILE=data/demo-reports.json npm run dev
```

Provision a Manager, sign in, then select Jane Smith and explicitly search May 25-29, 2026 with a 30-minute duration.
The initial search form uses today's date, not the demo dates. Expected results:

| Date   | Expected result                                    |
| ------ | -------------------------------------------------- |
| May 25 | Weekly: 09:00, 09:30, 10:00, 10:30                 |
| May 26 | No recurring availability                          |
| May 27 | Unavailable due to an override                     |
| May 28 | Replacement: eight starts from 10:00 through 13:30 |
| May 29 | Combined: 09:00, 09:30, 17:00, 17:30, 18:00, 18:30 |

Seeding never replaces existing files, including your normal `data/schedules.json`.
For a new demo, set a new `DATA_FILE` path for both the seed and server commands.
There is no required seed or migration step. See [the demo walkthrough](interview-guide.md).

## Storage and recovery

The server creates the parent directory and persists a schedule reporting baseline at startup.
Stop the server before copying the file for backup or restoring a backup. Run only one server
per file. The store loads data once; editing its file while running will not refresh memory.

To start empty without losing data, point `DATA_FILE` at a new path. Invalid JSON, unsupported
versions, and invalid nested records cause startup to fail without resetting the file.
Restore a known good copy or use a new path. Never delete the only copy to fix startup.

## Troubleshooting

| Symptom                           | Check                                                                        |
| --------------------------------- | ---------------------------------------------------------------------------- |
| Unsupported Node or syntax errors | Run `node --version`; use `.nvmrc`, then `npm ci`                            |
| Port already in use               | Stop the previous app; dev and built modes share port 3001                   |
| Frontend opens but API fails      | Check backend terminal; development proxy requires port 3001                 |
| Page missing at port 3001         | Run `npm run build` from project root before `npm start`                     |
| Demo appears empty                | Set `DATA_FILE` for the server as well as the seed command                   |
| No slots in demo                  | Select Jane, May 25-29, 2026, and 30 minutes, then search                    |
| Save fails                        | Check directory permissions and available disk space; preserve the data file |
| Results disappear after an edit   | Intentional invalidation; save and search again                              |
| Seed says data already exists     | Reuse that file or choose a new path; overwrite is disabled                  |

## Hosting boundary

The brief requires a GitHub repository, not a public deployment. GitHub Pages cannot run this
Express API. This setup serves a local demonstration and binds to loopback. A hosted version
would need an explicit network binding, persistent storage, and a deployment-specific process
configuration. Multiple server instances also require transactional shared storage. These
changes are outside this setup; a repository push does not deploy a working application.

## Provisioning accounts

Stop the API before provisioning: both account and schedule JSON are owned by one
process, and the API keeps account data in memory. Run `npm run provision:account`
in an interactive terminal. The script prompts for username, display name, role
(`user` or `manager`), email, staff ID, and a hidden password with confirmation.
Passwords need at least 12 characters and cannot be passed as command arguments.
A User must reference an existing staff ID; a Manager requires a valid email.
Managers may omit their staff ID. Creating staff does not create an account.

Use `DATA_FILE` for the schedule file and `USERS_FILE` for the account file; defaults
are `data/schedules.json` and `data/users.json`. Restart the API afterward. Accounts
use normalized lowercase usernames (ASCII letters, digits, `.`, `_`, `@`, `+`, `-`).
The account store validates existing files and stops on invalid records rather than
resetting them. JSON credentials and backup copies stay outside the static directory
and are ignored by Git; account files use owner-only read/write permissions.

Passwords use asynchronous scrypt with a random 16-byte salt, 64-byte derived key,
N=32768, r=8, p=1, and a 64 MiB allocation ceiling. Records must contain these exact
parameters before verification allocates memory. A local five-hash benchmark averaged
48.2 ms per hash; repeat capacity checks for the target host before production use.

## Schedule migration and report storage

The first startup migrates version 1 schedules to version 2 and saves the exact
original bytes in `<DATA_FILE>.v1.bak` before replacement. All staff, overrides,
weekly windows, and appointments are preserved. Existing schedules are the baseline;
change history starts empty at the migration time. New empty stores immediately
persist their reporting baseline, so restarting cannot move it forward.

A preexisting backup must match the version 1 source exactly; mismatches stop startup.
Corrupt or unknown versions also stop startup and never silently reset data. To recover
an interrupted migration, stop the API, archive the current file for diagnosis, and
restore its matching `.v1.bak` to the schedule path before restarting. A successful
version 2 startup leaves the baseline and backup unchanged. `npm run seed:demo`
continues to use exclusive file creation and refuses to replace either legacy or
migrated data. It creates version 1 demo data for normal startup migration.

`REPORTS_FILE` defaults to `data/reports.json`. Its versioned repository freezes each
job and merges recipient updates against current committed state. Run only one API
process per set of files; separate processes cannot coordinate JSON changes safely.

## Authentication server configuration

Every API business request requires a session; there is no unsecured app mode. Set
`APP_ORIGIN` to the exact public application origin in production (for example,
`https://scheduler.example.com`) and use `NODE_ENV=production` to require HTTPS origins
and Secure cookies. Local development accepts the Vite origins on localhost or
127.0.0.1 port 5173, plus the loopback API origin. Origin validation uses this configured
allowlist and never trusts forwarded host headers. If running behind a proxy, leave
Express proxy trust disabled unless deploying a separately reviewed proxy policy.

Sessions last eight hours, are stored as token digests in memory, and end on API
restart. Mutations require the session's `X-CSRF-Token` and a trusted `Origin` header.
The POST availability search is read-only and needs only a session. Login checks the
origin and returns a safe profile plus CSRF token; passwords and session cookie tokens
are never returned in profiles. Login permits at most ten attempts per address per
15 minutes, bounds the address table to 1,000 entries, and allows four concurrent
password verifications. Accounts are rechecked on authenticated requests.

## Mock email delivery and retries

Email delivery is mocked for this implementation. The default file capture adapter
never connects to SMTP or sends real messages. Each accepted message writes a private
folder under `MAIL_CAPTURE_DIR` (default `data/mail-capture`) containing `message.json`
with recipient, subject, summary, attachment metadata and stable Message-ID, plus
`attachment.pdf`. The directory is ignored by Git. Message-ID-based capture folders
make repeated mock acceptances idempotent. Test cases can inject an in-memory capture
or a failing transport without any external credentials.

A job freezes its report model and active Manager recipient/email snapshots before
rendering or delivery. Account activation and Manager role are checked again just
before sending. Removed eligibility leaves a visible terminal recipient failure.
Successful recipients are never retried. Other failures retry after 1, 5, and 15
minutes, with four attempts per retry cycle. Deadlines, counts and sanitized errors
persist in `REPORTS_FILE`; restarted processes resume failed/unfinished recipients.
No-manager jobs still persist so reporting intervals advance normally.

To retry exhausted deliveries, stop the API, then run `npm run reports:retry` (or
`npm run reports:retry -- <report-id>` for one job), then restart the API. This offline
command only requeues exhausted failed recipients, preserves total attempt counts,
and leaves successful recipients and already scheduled retries untouched. Never run
it against files currently owned by the API or another CLI process.

A future real email adapter can implement the mail port. It must preserve the stable
Message-ID and attachment metadata. Real SMTP cannot guarantee exactly-once delivery:
a crash after provider acceptance but before saving `sent` can cause a duplicate.
Restart recovery treats an interrupted `sending` record as an unconfirmed attempt,
uses its saved attempt time to schedule the next retry, and respects exhaustion.
The file capture adapter deduplicates this case locally; this is not a guarantee
for a future remote mail provider.

## Daily scheduler and shutdown

The API starts reporting after validating storage and authentication configuration.
Reporting is enabled by default; `REPORTING_ENABLED=false` disables its storage,
background jobs and delivery for a process. Route tests construct `createApp` directly
and never register background jobs. The default delivery remains local mock capture.

A daily `0 9 * * *` callback uses `America/Chicago`; a separate minute callback resumes
saved retry deadlines. Startup first recovers interrupted deliveries, then creates all
missed daily jobs chronologically from the reporting baseline or latest job cutoff.
Each interval starts at the previous cutoff, includes its start, and excludes its end.
Local calendar arithmetic accounts for 23-hour and 25-hour DST days. Restarting or
receiving duplicate callbacks cannot create the same cutoff twice.

Job creation does not await email delivery: slow or failed recipients cannot prevent
later days from obtaining their own durable jobs. Delivery has its own per-recipient
concurrency guard. Empty-manager jobs are saved and logged. This in-process scheduler
cannot run while the API is stopped; catch-up restores missing reports at startup.

SIGINT and SIGTERM stop both schedules, stop accepting HTTP connections, and allow
up to five seconds for active delivery to drain. An incomplete drain exits with an
error status and leaves unfinished delivery state for recovery on the next startup.
Keep one API process per data directory. Define an archival policy before sustained
production use, since this demonstration retains complete event and report histories.

## Isolated report walkthrough

`npm run reports:demo` creates a new temporary directory, three isolated accounts with
random undisclosed passwords, two staff records, and two captured daily reports. Its injected
clock advances through Chicago 09:00 on two successive days, so no waiting or system-clock
change is needed. The first PDF shows weekly and override changes; the second explicitly
states there were no schedule changes. Inspect the printed directory's `demo-summary.json`
and `mail-capture/*/message.json` / `attachment.pdf`. This command uses no real account,
schedule, report, or capture files and never sends email. Delete that temporary directory
when finished. It demonstrates reporting artifacts; use interactive provisioning for an
account you intend to sign into.

## Changing the shared report time

Sign in as a Manager, choose a time in **Daily PDF reports**, then select **Save report
time**. The form shows the saved time and confirmation; failures preserve your draft and
the previously saved setting. Reloading restores the shared setting. Users do not see the
controls. When reporting is disabled, schedule editing remains available.

The Manager-only settings API persists one organization-wide HH:mm time with the fixed
America/Chicago timezone. Until changed, it remains 09:00. Saving selects the next occurrence
strictly after the save instant and does not send immediately. Moving the time earlier or
later can shorten or lengthen the next interval; it still begins at the preceding report's
cutoff, so committed events are not dropped. Existing job snapshots and retries are unchanged.

The store retains both the schedule revision and intended next cutoff. Startup follows that
saved cutoff for catch-up. Old callbacks are rejected after a revision change, and failed
persistence keeps the old timers and setting. At the fall DST transition, a repeated local
time runs once at its first occurrence. A nonexistent spring time shifts to the first valid
minute after the gap: 02:30 becomes 03:00, not 03:30. Minute reconciliation enforces this
policy explicitly without depending on the cron library's gap/fold interpretation.
