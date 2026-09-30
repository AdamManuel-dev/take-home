import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, type TestContext } from "node:test";
import request from "supertest";
import { createApp } from "../server/app.js";
import { calculateAvailability } from "../server/scheduling.js";
import { Store } from "../server/store.js";

/** Creates isolated persistent storage and a Monday morning working schedule. */
async function setup(t: TestContext) {
  /** Temporary folder removed after each booking integration test. */
  const directory = mkdtempSync(join(tmpdir(), "open-hours-bookings-"));
  t.after(
    /** Removes only this test's isolated data. */ () =>
      rmSync(directory, { recursive: true, force: true }),
  );

  /** JSON location reused to verify persistence across new server instances. */
  const file = join(directory, "schedules.json");

  /** App with real file persistence for end-to-end API checks. */
  const app = createApp(new Store(file));

  /** Staff identity whose working hours are used by the booking tests. */
  const { id } = (
    await request(app).post("/api/staff").send({ name: "Taylor" })
  ).body;

  /** Staff-scoped endpoint prefix for schedule mutations. */
  const base = `/api/staff/${id}`;
  await request(app)
    .put(`${base}/weekly/1`)
    .send({ windows: [{ start: 540, end: 660 }] })
    .expect(200);

  return { app, file, base };
}

/** Standard single-date search for thirty-minute appointments. */
const query = { start: "2026-09-28", end: "2026-09-28", duration: 30 };

/** Appointment occupying the first half hour of the test schedule. */
const booking = {
  date: query.start,
  start: 540,
  duration: 30,
  title: "Consultation",
};

test("booking persists, removes conflicting slots across durations, and cancellation restores availability", /** Exercises the full booking lifecycle through HTTP and a restarted store. */ async (t) => {
  /** Test app, data location, and staff endpoint prefix. */
  const { app, file, base } = await setup(t);

  /** Saved appointment returned as part of the updated schedule. */
  const saved = (
    await request(app).post(`${base}/appointments`).send(booking).expect(201)
  ).body.appointments[0];
  assert.equal(saved.title, "Consultation");
  assert.equal(saved.end, 570);

  /** Fresh server instance proves bookings survive reopening persisted storage. */
  const restarted = createApp(new Store(file));
  assert.deepEqual(
    (await request(restarted).get(`${base}/schedule`)).body.appointments,
    [saved],
  );

  /** Remaining half-hour slots exclude the booked interval. */
  const free = (
    await request(restarted).post(`${base}/availability`).send(query)
  ).body[0].slots;
  assert.deepEqual(
    free.map(
      /** Extracts starts for a precise availability comparison. */ (slot: {
        start: number;
      }) => slot.start,
    ),
    [570, 600, 630],
  );

  /** Longer slots overlapping any part of the booking must also disappear. */
  const longer = (
    await request(restarted)
      .post(`${base}/availability`)
      .send({ ...query, duration: 60 })
  ).body[0].slots;
  assert.deepEqual(longer, [{ start: 600, end: 660 }]);
  await request(restarted)
    .delete(`${base}/appointments/${saved.id}`)
    .expect(200);
  assert.equal(
    (await request(restarted).post(`${base}/availability`).send(query)).body[0]
      .slots.length,
    4,
  );
});

test("simultaneous and partially overlapping bookings are rejected while adjacent times are allowed", /** Verifies serialized conflict checking across different appointment durations. */ async (t) => {
  /** App and staff scope shared by concurrent booking requests. */
  const { app, base } = await setup(t);

  /** Competing writes requesting exactly the same appointment. */
  const responses = await Promise.all([
    request(app).post(`${base}/appointments`).send(booking),
    request(app).post(`${base}/appointments`).send(booking),
  ]);
  assert.deepEqual(
    responses
      .map(
        /** Collects result codes independently of request order. */ (
          response,
        ) => response.status,
      )
      .sort(),
    [201, 409],
  );
  await request(app)
    .post(`${base}/appointments`)
    .send({ ...booking, start: 555, duration: 15 })
    .expect(409);
  await request(app)
    .post(`${base}/appointments`)
    .send({ ...booking, start: 570 })
    .expect(201);
  await request(app)
    .post(`${base}/appointments`)
    .send({ ...booking, start: 600, duration: 60 })
    .expect(201);
  assert.match(
    (await request(app).post(`${base}/availability`).send(query)).body[0]
      .reason,
    /scheduled appointments/,
  );
});

test("bookings validate input, respect overrides and gaps, and remain isolated by staff", /** Rejects stale offers and malformed requests without affecting other staff. */ async (t) => {
  /** API app and selected staff scope for the validation scenarios. */
  const { app, base } = await setup(t);
  await request(app)
    .post(`${base}/appointments`)
    .send({ ...booking, title: " " })
    .expect(400);
  await request(app)
    .post(`${base}/appointments`)
    .send({ ...booking, start: "540" })
    .expect(400);
  await request(app)
    .post(`${base}/appointments`)
    .send({ ...booking, date: "2026-02-30" })
    .expect(400);
  await request(app)
    .post(`${base}/appointments`)
    .send({ ...booking, duration: 20 })
    .expect(400);
  await request(app)
    .post(`${base}/appointments`)
    .send({ ...booking, start: 541 })
    .expect(409);
  await request(app)
    .post(`${base}/appointments`)
    .send({ ...booking, start: 660 })
    .expect(409);
  await request(app)
    .put(`${base}/overrides/${booking.date}`)
    .send({ mode: "unavailable", windows: [] })
    .expect(200);
  await request(app).post(`${base}/appointments`).send(booking).expect(409);
  await request(app).delete(`${base}/overrides/${booking.date}`).expect(200);

  /** Successfully saved booking used to check cancellation ownership. */
  const saved = (
    await request(app).post(`${base}/appointments`).send(booking).expect(201)
  ).body.appointments[0];

  /** Independent staff member allowed to use the same wall-clock time. */
  const other = (await request(app).post("/api/staff").send({ name: "Morgan" }))
    .body;
  await request(app)
    .put(`/api/staff/${other.id}/weekly/1`)
    .send({ windows: [{ start: 540, end: 600 }] })
    .expect(200);
  await request(app)
    .post(`/api/staff/${other.id}/appointments`)
    .send(booking)
    .expect(201);
  await request(app)
    .delete(`/api/staff/${other.id}/appointments/${saved.id}`)
    .expect(404);
  await request(app).put(`${base}/weekly/1`).send({ windows: [] }).expect(200);
  assert.equal(
    (await request(app).get(`${base}/schedule`)).body.appointments.length,
    1,
  );
});

test("legacy JSON without appointment fields remains readable and can accept bookings", /** Confirms old schedules upgrade additively without losing saved weekly hours. */ async (t) => {
  /** Isolated file and app prefix used for the legacy-data check. */
  const { file, base } = await setup(t);
  writeFileSync(
    file,
    JSON.stringify({
      version: 1,
      staff: [
        {
          id: base.split("/").at(-1),
          name: "Taylor",
          weekly: [[], [{ start: 540, end: 600 }], [], [], [], [], []],
          overrides: [],
        },
      ],
    }),
  );

  /** New server reading the previous format with no appointments array. */
  const legacy = createApp(new Store(file));
  assert.deepEqual(
    (await request(legacy).get(`${base}/schedule`)).body.appointments,
    [],
  );
  await request(legacy).post(`${base}/appointments`).send(booking).expect(201);
  assert.equal(
    (await request(legacy).get(`${base}/schedule`)).body.appointments.length,
    1,
  );
});

test("bookings on other dates do not remove slots and no slot crosses a working-hours gap", /** Separates calendar-date conflicts from continuous-window constraints. */ () => {
  /** Schedule with a break and a booking on the following day. */
  const schedule = {
    weekly: [
      [],
      [
        { start: 540, end: 570 },
        { start: 600, end: 660 },
      ],
      [],
      [],
      [],
      [],
      [],
    ],
    overrides: [],
    appointments: [
      { id: "a", title: "Other day", date: "2026-09-29", start: 600, end: 660 },
    ],
  };
  assert.deepEqual(
    calculateAvailability(schedule, query.start, query.end, 60)[0].slots,
    [{ start: 600, end: 660 }],
  );
});
