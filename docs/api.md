# API reference

Describe the local JSON contract, including response shapes and a reproducible example.

The built server uses <http://127.0.0.1:3001>. Development requests from port 5173 are proxied.
Send `Content-Type: application/json` for request bodies. There is no authentication.

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

Follow [setup](setup.md#demo-data) first. With the demo server running:

```sh
curl --fail-with-body http://127.0.0.1:3001/api/staff
curl --fail-with-body http://127.0.0.1:3001/api/staff/demo-jane-smith/availability \
  -H 'Content-Type: application/json' \
  -d '{"start":"2026-05-25","end":"2026-05-29","duration":30}'
```

This next request intentionally changes the demo by booking its first Monday slot:

```sh
curl --fail-with-body http://127.0.0.1:3001/api/staff/demo-jane-smith/appointments \
  -H 'Content-Type: application/json' \
  -d '{"date":"2026-05-25","title":"Demo visit","start":540,"duration":30}'
```

Repeating that booking returns 409. Search again to see the blocked slot disappear, then
cancel it through the UI or the DELETE route using the ID from the returned schedule.
