# Setup and operation

Install, run, verify, and troubleshoot the scheduler on a local machine.

## Prerequisites

Use Node.js 24.6.0 (recorded in `.nvmrc`) and npm. Git is needed for repository workflows;
GitHub CLI is optional. No database server, API key, account, migration, or Docker is required.
If you use nvm, run `nvm install` and `nvm use` from the project root.

After cloning your repository, open a terminal in its root:

```sh
npm ci
npm run dev
```

Open <http://127.0.0.1:5173>. Two processes run together: Vite for the frontend and Express
on port 3001. Vite forwards `/api` requests to Express. Stop both with Ctrl+C.
A fresh checkout starts empty. Existing local schedules are retained.

## Commands

| Command | Purpose |
| --- | --- |
| `npm ci` | Install exact dependencies from the committed lockfile |
| `npm run dev` | Start frontend and backend with development reload |
| `npm run verify` | Check source formatting, run tests, type-check, and build |
| `npm test` | Run Node's test runner through tsx, using isolated temporary data |
| `npm run build` | Type-check and create the frontend in `dist/` |
| `npm start` | Run Express; serves the built frontend if `dist/` exists |
| `npm run seed:demo` | Create a separate demo file; refuses to overwrite a file |
| `npm run format` | Format application, test, and script source |

For the built application, stop the dev server, run `npm run build`, then `npm start`.
Open <http://127.0.0.1:3001>. This still runs the TypeScript backend through `tsx`, so keep
development dependencies installed. `npm ci --omit=dev` is not a supported installation.

## Environment variables

| Variable | Default | Behavior |
| --- | --- | --- |
| `PORT` | `3001` | Backend listening port; server binds to `127.0.0.1` |
| `DATA_FILE` | `data/schedules.json` | JSON storage path, absolute or relative to project root |

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
DATA_FILE=data/demo-schedules.json npm run dev
```

Select Jane Smith and explicitly search May 25-29, 2026 with a 30-minute duration.
The initial search form uses today's date, not the demo dates. Expected results:

| Date | Expected result |
| --- | --- |
| May 25 | Weekly: 09:00, 09:30, 10:00, 10:30 |
| May 26 | No recurring availability |
| May 27 | Unavailable due to an override |
| May 28 | Replacement: eight starts from 10:00 through 13:30 |
| May 29 | Combined: 09:00, 09:30, 17:00, 17:30, 18:00, 18:30 |

Seeding never replaces existing files, including your normal `data/schedules.json`.
For a new demo, set a new `DATA_FILE` path for both the seed and server commands.
There is no required seed or migration step. See [the demo walkthrough](interview-guide.md).

## Storage and recovery

The server creates the parent directory on startup and writes a data file on the first save.
Stop the server before copying the file for backup or restoring a backup. Run only one server
per file. The store loads data once; editing its file while running will not refresh memory.

To start empty without losing data, point `DATA_FILE` at a new path. Invalid JSON, unsupported
versions, and invalid nested records cause startup to fail without resetting the file.
Restore a known good copy or use a new path. Never delete the only copy to fix startup.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Unsupported Node or syntax errors | Run `node --version`; use `.nvmrc`, then `npm ci` |
| Port already in use | Stop the previous app; dev and built modes share port 3001 |
| Frontend opens but API fails | Check backend terminal; development proxy requires port 3001 |
| Page missing at port 3001 | Run `npm run build` from project root before `npm start` |
| Demo appears empty | Set `DATA_FILE` for the server as well as the seed command |
| No slots in demo | Select Jane, May 25-29, 2026, and 30 minutes, then search |
| Save fails | Check directory permissions and available disk space; preserve the data file |
| Results disappear after an edit | Intentional invalidation; save and search again |
| Seed says data already exists | Reuse that file or choose a new path; overwrite is disabled |

## Hosting boundary

The brief requires a GitHub repository, not a public deployment. GitHub Pages cannot run this
Express API. This setup serves a local demonstration and binds to loopback. A hosted version
would need an explicit network binding, persistent storage, and a deployment-specific process
configuration. Multiple server instances also require transactional shared storage. These
changes are outside this setup; a repository push does not deploy a working application.
