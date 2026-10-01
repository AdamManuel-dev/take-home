# API reference

Describe the local JSON contract, including response shapes and a reproducible example.

The built server uses <http://127.0.0.1:3001>. Development requests from port 5173 are proxied.
Send `Content-Type: application/json` for request bodies. Every business request requires a session cookie. Mutations additionally require a trusted
`Origin` and `X-CSRF-Token`; availability search is a read operation despite using POST.

## Authentication and permissions

| Method and path | Request | Response |
| --- | --- | --- |
| `POST /api/auth/login` | `{ username, password }`, trusted Origin | Cookie plus `{ profile, csrfToken }` |
| `GET /api/auth/me` | Session cookie | `{ profile, csrfToken }`, or 401 |
| `POST /api/auth/logout` | Cookie, Origin, CSRF token | 204 and cleared cookie |

Profiles contain only `id`, `username`, `displayName`, `role`, and optional `staffId`.
Roles are `user` and `manager`. Session cookies are HttpOnly, SameSite=Lax, and Secure
in production; the opaque token is never returned in JSON. Sessions expire after eight
hours and after restart. Login errors are generic and rate-limited.

Both roles can list all staff, read all schedules and search everyone's availability.
Users can edit only their linked staff's weekly hours, overrides and appointments.
Managers can edit any staff and create new staff. Account credentials have no API listing.
The trusted session actor is captured by the server; client-supplied actor fields are ignored.

## Routes

| Method and path | Request body | Success response |
| --- | --- | --- |
| `GET /api/staff` | None | 200, array of `{ id, name }` |
| `POST /api/staff` | `{ "name": "Taylor" }` | 201, `{ id, name }` |
| `GET /api/staff/:id/schedule` | None | 200, schedule |
| `PUT /api/staff/:id/weekly/:day` | `{ "windows": [{ "start": 540, "end": 600 }] }` | 200, schedule |
| `PUT /api/staff/:id/overrides/:date` | `{ "mode": "unavailable", "windows": [] }` | 200, schedule |
| `DELETE /api/staff/:id/overrides/:date` | None | 200, schedule |
| `POST /api/staff/:id/availability` | `{ "start": "2026-05-25", "end": "2026-05-29", "duration": 30 }` | 200, day-result array |
| `POST /api/staff/:id/appointments` | `{ "date": "2026-05-25", "title": "Visit", "start": 540, "duration": 30 }` | 201, schedule |
| `DELETE /api/staff/:id/appointments/:appointmentId` | None | 200, schedule |

`day` is 0 (Sunday) through 6 (Saturday). Weekly PUT replaces one entire day; an empty list
makes that day off. Override PUT upserts one date. Deleting a nonexistent override succeeds;
deleting a nonexistent appointment returns 404. There is no staff deletion endpoint.

A schedule contains `weekly`, `overrides`, and `appointments`. Each appointment contains `id`,
`title`, `date`, `start`, and `end`. Booking returns the full saved schedule, not just a booking.

Example day result:

```json
{
  "date": "2026-05-25",
  "source": "weekly",
  "windows": [{ "start": 540, "end": 600 }],
  "slots": [{ "start": 540, "end": 570 }, { "start": 570, "end": 600 }]
}
```

Source is `weekly`, `override`, `combined`, or `none`. `mode` is included for overridden dates;
`reason` explains empty results. Times are integer wall-clock minutes, not Unix timestamps.

## Validation and errors

Errors use `{ "error": "readable message" }`.

| Status | Meaning |
| --- | --- |
| 400 | Invalid body, date, weekday, duration, windows, or malformed JSON |
| 401 | Missing/expired session or invalid login |
| 403 | Disallowed role/ownership, untrusted Origin or invalid CSRF token |
| 429 | Login rate or concurrency limit reached |
| 404 | Unknown staff, missing appointment, or unknown API route |
| 409 | Requested appointment start is no longer an offered slot |
| 413 | JSON body exceeds the 100 KB parser limit |
| 500 | Unexpected failure, including storage failure; generic client message |

Names and appointment titles are trimmed, nonblank, and limited to 100 characters. Windows
are whole-minute intervals in one day, with at most 96 windows per submitted list. Overlapping
or duplicate windows in one list are rejected. Touching windows are allowed. Add/replace
overrides require at least one window; unavailable requires none. Durations are numeric
15, 30, 45, or 60, and queries cover at most 90 inclusive dates. Numeric strings are rejected.

## Try the seeded demo

Follow [setup](setup.md#demo-data), sign into the demo as Manager, and select Jane Smith.
In that application's browser developer console, this read-only example uses your existing
HttpOnly cookie automatically and searches the seeded dates:

```javascript
const response = await fetch('/api/staff/demo-jane-smith/availability', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ start: '2026-05-25', end: '2026-05-29', duration: 30 })
});
console.table(await response.json());
```

For mutation clients, first obtain the CSRF token from `/api/auth/me` and include it as
`X-CSRF-Token`, together with the configured application `Origin` and session cookie.
The browser supplies Origin automatically for same-origin POST/PUT/DELETE fetches.
Do not paste account passwords into command arguments or shared logs. Booking the same
slot twice returns 409; cancel through the UI or the DELETE endpoint to restore it.

Daily reporting has no public send endpoint. The API process owns scheduling and durable
retry state; `npm run reports:demo` demonstrates the mock output independently.

## Shared report settings

Managers can `GET /api/report-settings` and `PUT /api/report-settings` with
`{ "localTime": "08:30", "timezone": "America/Chicago" }`. The response has the same
shape. The timezone is read-only (omitting it on PUT is allowed); HH:mm must be an exact
24-hour time from 00:00 through 23:59. Invalid values return 400, Users receive 403, and
reporting-disabled processes return 503 to Managers. PUT requires normal Origin/CSRF checks.

Saving persists a revision and the next intended cutoff before the new callbacks become
active. It never immediately sends a report. The next occurrence must be strictly after
saving, and its interval starts at the last created job cutoff (or migration baseline).
Existing jobs and retries are unchanged. Obsolete timer callbacks cannot create jobs.
