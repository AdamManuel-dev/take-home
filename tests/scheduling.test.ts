import assert from "node:assert/strict";
import { test } from "node:test";
import {
  calculateAvailability,
  normalize,
  validateDate,
  validateOverride,
  validateQuery,
  validateWindows,
} from "../server/scheduling.js";
import type { Schedule, Window } from "../shared/contracts/types.js";

/** Known Monday used to make recurring weekday expectations deterministic. */
const monday = "2026-09-28";

/** Creates a minimal Monday-only schedule fixture with no date overrides. */
function schedule(windows: Window[] = [{ start: 540, end: 600 }]): Schedule {
  return { weekly: [[], windows, [], [], [], [], []], overrides: [] };
}

for (/** Current supported duration and its expected starts within a one-hour window. */ const [
  duration,
  starts,
] of [
  [15, [540, 555, 570, 585]],
  [30, [540, 570]],
  [45, [540]],
  [60, [540]],
] as const) {
  test(`${duration}-minute slots fit in one hour`, /** Verifies all generated appointments fit and use the selected duration. */ () => {
    /** Single-day calculation under test for the current supported duration. */
    const [result] = calculateAvailability(
      schedule(),
      monday,
      monday,
      duration,
    );
    assert.deepEqual(
      result.slots.map(
        /** Extracts start minutes for comparison with the expected slot sequence. */ (
          slot,
        ) => slot.start,
      ),
      starts,
    );
    assert.ok(
      result.slots.every(
        /** Checks that each returned appointment has the requested length. */ (
          slot,
        ) => slot.end - slot.start === duration,
      ),
    );
  });
}

test("short windows have a distinct explanation", /** Checks the distinct explanation for availability too short to fit an appointment. */ () => {
  /** Result for a 59-minute window queried with a 60-minute appointment. */
  const [result] = calculateAvailability(
    schedule([{ start: 540, end: 599 }]),
    monday,
    monday,
    60,
  );
  assert.deepEqual(result.slots, []);
  assert.match(result.reason!, /too short/);
  assert.equal(result.source, "weekly");
});

test("appointments never cross a break", /** Checks that slot generation restarts after a gap instead of crossing it. */ () => {
  /** Result for two windows separated by an unavailable half-hour. */
  const [result] = calculateAvailability(
    schedule([
      { start: 540, end: 600 },
      { start: 630, end: 720 },
    ]),
    monday,
    monday,
    45,
  );
  assert.deepEqual(result.slots, [
    { start: 540, end: 585 },
    { start: 630, end: 675 },
    { start: 675, end: 720 },
  ]);
});

test("touching windows are continuous and input is not mutated", /** Checks that touching windows merge without mutating unsorted source data. */ () => {
  /** Unsorted touching intervals used to verify union behavior and input preservation. */
  const input = [
    { start: 600, end: 660 },
    { start: 540, end: 600 },
  ];
  assert.deepEqual(normalize(input), [{ start: 540, end: 660 }]);
  assert.deepEqual(input, [
    { start: 600, end: 660 },
    { start: 540, end: 600 },
  ]);
  assert.deepEqual(
    calculateAvailability(schedule(input), monday, monday, 45)[0].slots,
    [
      { start: 540, end: 585 },
      { start: 585, end: 630 },
    ],
  );
});

test("unavailable override removes all hours with an override explanation", /** Checks that an unavailable override suppresses recurring hours and explains why. */ () => {
  /** Recurring schedule fixture to which an unavailable date override is applied. */
  const data = schedule();
  data.overrides = [{ date: monday, mode: "unavailable", windows: [] }];

  /** Date result after the unavailable override takes precedence. */
  const [result] = calculateAvailability(data, monday, monday, 30);
  assert.deepEqual(result.windows, []);
  assert.deepEqual(result.slots, []);
  assert.equal(result.source, "override");
  assert.match(result.reason!, /date override/);
});

test("replace uses only replacement hours", /** Checks that replacement hours fully supersede the recurring window. */ () => {
  /** Full-day recurring fixture replaced by a shorter date-specific interval. */
  const data = schedule([{ start: 540, end: 1020 }]);
  data.overrides = [
    { date: monday, mode: "replace", windows: [{ start: 600, end: 840 }] },
  ];
  assert.deepEqual(
    calculateAvailability(data, monday, monday, 60)[0].slots.map(
      /** Extracts start minutes to verify that only replacement hours contribute. */
      (slot) => slot.start,
    ),
    [600, 660, 720, 780],
  );
});

test("add on an off day creates availability", /** Checks that additive hours can make an otherwise unavailable weekday available. */ () => {
  /** Empty recurring schedule used to test adding hours on a day off. */
  const data = schedule([]);
  data.overrides = [
    { date: monday, mode: "add", windows: [{ start: 540, end: 600 }] },
  ];

  /** Date result supplied solely by an additive override. */
  const [result] = calculateAvailability(data, monday, monday, 60);
  assert.equal(result.source, "override");
  assert.deepEqual(result.slots, [{ start: 540, end: 600 }]);
});

test("add unions overlapping sources and anchors starts to the new continuous window", /** Checks that merging added hours shifts slot anchoring to the continuous window start. */ () => {
  /** Recurring one-hour fixture extended earlier by overlapping added hours. */
  const data = schedule();
  data.overrides = [
    { date: monday, mode: "add", windows: [{ start: 525, end: 555 }] },
  ];

  /** Combined date result whose normalized start determines appointment spacing. */
  const [result] = calculateAvailability(data, monday, monday, 30);
  assert.equal(result.source, "combined");
  assert.deepEqual(result.windows, [{ start: 525, end: 600 }]);
  assert.deepEqual(
    result.slots.map(
      /** Extracts the anchored slot starts for exact comparison. */ (slot) =>
        slot.start,
    ),
    [525, 555],
  );
});

test("overlapping additive hours extend the end and never duplicate slots", /** Checks that overlapping additive hours extend availability without duplicate slots. */ () => {
  /** Recurring morning fixture extended into the afternoon by an additive override. */
  const data = schedule([{ start: 540, end: 720 }]);
  data.overrides = [
    { date: monday, mode: "add", windows: [{ start: 660, end: 840 }] },
  ];
  assert.deepEqual(
    calculateAvailability(data, monday, monday, 60)[0].slots.map(
      /** Extracts start minutes to verify the combined continuous sequence. */
      (slot) => slot.start,
    ),
    [540, 600, 660, 720, 780],
  );
});

test("off days are preserved in date results", /** Checks that dates without recurring hours remain present with a clear explanation. */ () => {
  /** Two-date result containing both an off day and a recurring working day. */
  const result = calculateAvailability(schedule(), "2026-09-27", monday, 30);
  assert.equal(result.length, 2);
  assert.equal(result[0].source, "none");
  assert.match(result[0].reason!, /No recurring/);
});

for (/** Calendar-boundary case with inclusive endpoints and its expected date sequence. */ const [
  start,
  end,
  dates,
] of [
  ["2024-02-28", "2024-03-01", ["2024-02-28", "2024-02-29", "2024-03-01"]],
  ["2026-12-31", "2027-01-01", ["2026-12-31", "2027-01-01"]],
  ["2026-03-07", "2026-03-09", ["2026-03-07", "2026-03-08", "2026-03-09"]],
  ["2026-10-31", "2026-11-02", ["2026-10-31", "2026-11-01", "2026-11-02"]],
] as const) {
  test(`calendar iteration across ${start} to ${end}`, /** Checks date iteration across leap days, year changes, or DST boundaries. */ () => {
    assert.deepEqual(
      calculateAvailability(schedule(), start, end, 30).map(
        /** Extracts calendar dates independently of slot contents. */ (day) =>
          day.date,
      ),
      dates,
    );
  });
}

test("supports end of day and the maximum date without wrapping", /** Checks the 24:00 end boundary and a one-day query at the maximum supported year. */ () => {
  /** Every-day late-night fixture whose appointment ends exactly at midnight. */
  const data = {
    weekly: Array.from(
      { length: 7 },
      /** Creates an independent final-hour interval for each weekday. */ () => [
        { start: 1380, end: 1440 },
      ],
    ),
    overrides: [],
  };
  assert.deepEqual(
    calculateAvailability(data, "9999-12-31", "9999-12-31", 60)[0].slots,
    [{ start: 1380, end: 1440 }],
  );
});

for (/** Current malformed window payload that must fail validation. */ const windows of [
  null,
  {},
  [{ start: 600, end: 600 }],
  [{ start: 601, end: 600 }],
  [{ start: -1, end: 60 }],
  [{ start: 0, end: 1441 }],
  [{ start: "540", end: 600 }],
  [{ start: 540.5, end: 600 }],
  [
    { start: 540, end: 600 },
    { start: 590, end: 620 },
  ],
  [
    { start: 540, end: 600 },
    { start: 540, end: 600 },
  ],
]) {
  test(`rejects invalid windows ${JSON.stringify(windows)}`, /** Asserts that the current malformed window case is rejected. */ () =>
    assert.throws(
      /** Invokes window validation with the invalid payload under test. */ () =>
        validateWindows(windows),
    ));
}

test("validates unsorted windows without rejecting touching boundaries", /** Checks that unsorted touching windows are accepted and returned in chronological order. */ () => {
  assert.deepEqual(
    validateWindows([
      { start: 600, end: 660 },
      { start: 540, end: 600 },
    ]),
    [
      { start: 540, end: 600 },
      { start: 600, end: 660 },
    ],
  );
});

for (/** Current malformed or impossible calendar date that must be rejected. */ const date of [
  "2026-02-29",
  "2026-04-31",
  "2026-13-01",
  "2026-1-01",
  "0000-01-01",
  "",
  null,
  123,
]) {
  test(`rejects invalid date ${date}`, /** Asserts that the current invalid date fails validation. */ () =>
    assert.throws(
      /** Invokes date validation with the invalid calendar value. */ () =>
        validateDate(date),
    ));
}

for (/** Current unsupported or incorrectly typed appointment duration. */ const duration of [
  0,
  -15,
  20,
  30.5,
  "30",
  "30abc",
  null,
  undefined,
]) {
  test(`rejects invalid duration ${duration}`, /** Asserts that the current invalid duration fails query validation. */ () =>
    assert.throws(
      /** Invokes query validation with the unsupported duration. */ () =>
        validateQuery(monday, monday, duration),
    ));
}

test("limits ranges to 90 inclusive dates and rejects reversed ranges", /** Checks the inclusive 90-day limit and rejects reversed ranges. */ () => {
  assert.equal(validateQuery("2026-01-01", "2026-03-31", 30).length, 90);
  assert.throws(
    /** Attempts a 91-date query that must exceed the allowed range. */ () =>
      validateQuery("2026-01-01", "2026-04-01", 30),
    /90/,
  );
  assert.throws(
    /** Attempts a query whose start follows its end. */ () =>
      validateQuery("2026-02-01", "2026-01-01", 30),
    /before/,
  );
});

for (/** Current override payload violating mode or window requirements. */ const input of [
  { mode: "replace", windows: [] },
  { mode: "add", windows: [] },
  { mode: "unavailable", windows: [{ start: 540, end: 600 }] },
  { mode: "bad", windows: [] },
  {},
]) {
  test(`rejects invalid override ${JSON.stringify(input)}`, /** Asserts that the current invalid override is rejected. */ () =>
    assert.throws(
      /** Invokes override validation for the malformed mode/window combination. */ () =>
        validateOverride(monday, input),
    ));
}
