import assert from "node:assert/strict";
import test from "node:test";
import { parseStoredData } from "../server/stored-data.js";

/** Creates an independent legacy record with no appointment field. */
function legacyStaff() {
  return {
    id: "staff-1",
    name: "Ada",
    weekly: [
      [],
      [
        { start: 600, end: 660 },
        { start: 480, end: 540 },
      ],
      [],
      [],
      [],
      [],
      [],
    ],
    overrides: [{ date: "2026-09-30", mode: "unavailable", windows: [] }],
  };
}

/** Creates a valid persisted appointment that may sit outside current working hours. */
function booking(id = "booking-1", start = 720, date = "2026-09-30") {
  return { id, title: "Consultation", date, start, end: start + 30 };
}

test("accepts legacy records without rewriting values or sorting windows", /** Confirms validation preserves legacy omissions and original ordering. */ () => {
  /** Original legacy document used to verify exact preservation. */
  const data = { version: 1, staff: [legacyStaff()] };
  assert.deepEqual(parseStoredData(data), data);
  assert.equal("appointments" in parseStoredData(data).staff[0], false);
});

test("accepts bookings outside current hours, adjacent bookings and bookings on other dates", /** Changing availability later must not invalidate previously saved appointments. */ () => {
  /** Persisted appointments that remain valid even on a now-unavailable day. */
  const data = {
    version: 1,
    staff: [
      {
        ...legacyStaff(),
        appointments: [
          booking(),
          booking("booking-2", 750),
          booking("booking-3", 720, "2026-10-01"),
        ],
      },
    ],
  };
  assert.deepEqual(parseStoredData(data), data);
});

/** Invalid nested values representing corrupted or manually edited JSON documents. */
const invalidStaffFields: Record<string, unknown>[] = [
  { id: " " },
  { name: "" },
  { name: "a".repeat(101) },
  { weekly: [] },
  { weekly: [[], [], [], [], [], [], null] },
  { weekly: [[{ start: "480", end: 540 }], [], [], [], [], [], []] },
  { overrides: null },
  { overrides: [null] },
  { overrides: [{ date: "2026-02-30", mode: "unavailable", windows: [] }] },
  { overrides: [{ date: "2026-09-30", mode: "replace", windows: [] }] },
  { appointments: null },
  { appointments: [null] },
  { appointments: [{ ...booking(), id: "" }] },
  { appointments: [{ ...booking(), title: " " }] },
  { appointments: [{ ...booking(), title: "a".repeat(101) }] },
  { appointments: [{ ...booking(), date: "2026-02-30" }] },
  { appointments: [{ ...booking(), start: 720.5 }] },
  { appointments: [{ ...booking(), end: 740 }] },
  { appointments: [{ ...booking(), start: 1440, end: 1470 }] },
];

for (/** One malformed field patch that must stop startup validation. */ const fields of invalidStaffFields) {
  test(`rejects malformed nested data: ${JSON.stringify(fields)}`, /** Exercises the public parser with an otherwise valid record. */ () => {
    assert.throws(
      /** Parses the malformed record to confirm a useful startup error. */ () =>
        parseStoredData({
          version: 1,
          staff: [{ ...legacyStaff(), ...fields }],
        }),
      /^Error: Invalid schedule data file:/,
    );
  });
}

test("rejects duplicate staff IDs, override dates and appointment IDs", /** Ambiguous identities and duplicate dates cannot enter repository state. */ () => {
  /** Repeated override whose date conflicts with the existing exception. */
  const override = legacyStaff().overrides[0];

  /** Independent identity collisions to exercise at each nested level. */
  const documents = [
    { version: 1, staff: [legacyStaff(), legacyStaff()] },
    {
      version: 1,
      staff: [{ ...legacyStaff(), overrides: [override, override] }],
    },
    {
      version: 1,
      staff: [
        {
          ...legacyStaff(),
          appointments: [booking(), booking("booking-1", 750)],
        },
      ],
    },
  ];

  for (/** Next document with duplicate logical identities. */ const document of documents) {
    assert.throws(
      /** Checks the collision is rejected by the public persistence parser. */ () =>
        parseStoredData(document),
      /Invalid schedule data file:.*unique/,
    );
  }
});

test("rejects overlapping appointments on the same day", /** Prevents existing corrupted bookings from silently double-booking a staff member. */ () => {
  assert.throws(
    /** Parses overlapping bookings with otherwise unique and valid fields. */ () =>
      parseStoredData({
        version: 1,
        staff: [
          {
            ...legacyStaff(),
            appointments: [booking(), booking("booking-2", 735)],
          },
        ],
      }),
    /Invalid schedule data file:.*overlap/,
  );
});

test("rejects unsupported versions and malformed top-level records", /** Covers the root persistence envelope before inspecting nested staff records. */ () => {
  for (/** Next invalid document envelope. */ const document of [
    null,
    [],
    {},
    { version: 2, staff: [] },
    { version: 1, staff: null },
    { version: 1, staff: [null] },
  ]) {
    assert.throws(
      /** Parses the invalid envelope to ensure startup fails clearly. */ () =>
        parseStoredData(document),
      /Invalid schedule data file:/,
    );
  }
});
