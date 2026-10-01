import assert from "node:assert/strict";
import { inflateSync } from "node:zlib";
import { test } from "node:test";
import {
  buildReportModel,
  dailyCutoff,
  dailyInterval,
} from "../server/reports/selection.js";
import { renderReportPdf } from "../server/reports/pdf.js";
import type { ScheduleChange } from "../shared/contracts/change-events.js";
const start = "2026-09-29T14:00:00.000Z",
  end = "2026-09-30T14:00:00.000Z";
function event(
  sequence: number,
  occurredAt = start,
): Extract<ScheduleChange, { entityType: "weekly" }> {
  return {
    id: `event-${sequence}`,
    sequence,
    occurredAt,
    actor: {
      id: "actor",
      name: "An actor with a name that is intentionally long enough to wrap into multiple readable lines",
    },
    staff: {
      id: "staff",
      name: "A staff member with a long display name to verify that headings wrap safely on the report",
    },
    entityType: "weekly",
    weekday: 1,
    operation: "created",
    before: [],
    after: [{ start: 540, end: 600 }],
  };
}
function model(changes: ScheduleChange[]) {
  return buildReportModel({
    id: "report-test",
    interval: { start, end },
    generatedAt: end,
    changes,
  });
}
function pdfText(pdf: Buffer) {
  const streams: string[] = [];
  for (const match of pdf
    .toString("latin1")
    .matchAll(/stream\n([\s\S]*?)\nendstream/g)) {
    try {
      streams.push(inflateSync(Buffer.from(match[1], "latin1")).toString());
    } catch {
      /* Embedded binary streams are not text. */
    }
  }
  const characters = new Map<number, string>();
  for (const stream of streams.filter((value) =>
    value.includes("beginbfrange"),
  )) {
    for (const range of stream.matchAll(
      /<([a-f\d]+)>\s*<([a-f\d]+)>\s*\[([^\]]+)\]/gi,
    )) {
      let index = Number.parseInt(range[1], 16);
      for (const value of range[3].matchAll(/<([a-f\d\s]+)>/gi)) {
        const hex = value[1].replaceAll(" ", "");
        characters.set(
          index++,
          [...hex.matchAll(/.{4}/g)]
            .map((part) => String.fromCharCode(Number.parseInt(part[0], 16)))
            .join(""),
        );
      }
    }
  }
  return streams
    .filter((value) => value.includes("BT"))
    .map((stream) =>
      [...stream.matchAll(/<([a-f\d]+)>/gi)]
        .map((text) =>
          [...text[1].matchAll(/.{4}/g)]
            .map((part) => characters.get(Number.parseInt(part[0], 16)) ?? "")
            .join(""),
        )
        .join(""),
    )
    .join("");
}

test("daily report intervals follow Chicago calendar boundaries through both DST transitions", () => {
  const spring = dailyInterval("2026-03-08", "2026-01-01T00:00:00.000Z");
  const fall = dailyInterval("2026-11-01", "2026-01-01T00:00:00.000Z");
  assert.equal(
    Date.parse(spring.end) - Date.parse(spring.start),
    23 * 60 * 60 * 1000,
  );
  assert.equal(
    Date.parse(fall.end) - Date.parse(fall.start),
    25 * 60 * 60 * 1000,
  );
  assert.equal(dailyCutoff("2026-09-30"), end);
  assert.equal(
    dailyInterval("2026-09-30", "2026-09-30T13:00:00.000Z").start,
    "2026-09-30T13:00:00.000Z",
  );
  assert.throws(() => dailyInterval("2026-09-30", "invalid"));
  assert.throws(() => dailyInterval("2026-09-30", end));
});

test("selection is half-open, detached and preserves edits later undone", () => {
  const created = event(1);
  const deleted: ScheduleChange = {
    ...event(2),
    operation: "deleted",
    before: created.after,
    after: [],
  };
  const report = model([
    event(4, end),
    deleted,
    event(0, "2026-09-28T14:00:00.000Z"),
    created,
  ]);
  assert.deepEqual(
    report.changes.map((change) => change.sequence),
    [1, 2],
  );
  created.actor.name = "Changed after freezing";
  assert.notEqual(report.changes[0].actor.name, created.actor.name);
});

test("empty report is a valid PDF with interval, timezone, report identity and explicit empty message", async () => {
  const pdf = await renderReportPdf(model([]));
  assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
  const text = pdfText(pdf).replaceAll(" ", "");
  const pages = Number(pdf.toString("latin1").match(/\/Count (\d+)/)?.[1]);
  assert.ok(text.includes(`Page${pages}of${pages}`));
  for (const value of [
    "No schedule changes",
    "report-test",
    "America/Chicago",
    "Page 1 of 1",
    "Generated:",
  ])
    assert.ok(text.includes(value.replaceAll(" ", "")), value);
});

test("maximum window changes paginate into continued rows with all modes and before/after values", async () => {
  const windows = Array.from({ length: 96 }, (_, index) => ({
    start: index * 15,
    end: index * 15 + 5,
  }));
  const changes: ScheduleChange[] = [{ ...event(1), after: windows }];
  for (const [index, mode] of (
    ["add", "replace", "unavailable"] as const
  ).entries())
    changes.push({
      ...event(index + 2),
      entityType: "override",
      date: `2026-10-0${index + 1}`,
      before: null,
      after: { mode, windows: mode === "unavailable" ? [] : windows },
    });
  const pdf = await renderReportPdf(model(changes));
  const text = pdfText(pdf).replaceAll(" ", "");
  const pages = Number(pdf.toString("latin1").match(/\/Count (\d+)/)?.[1]);
  assert.ok(text.includes(`Page${pages}of${pages}`));
  assert.ok(Number(pdf.toString("latin1").match(/\/Count (\d+)/)?.[1]) > 1);
  for (const value of [
    "continued",
    "Mode: add",
    "Mode: replace",
    "Mode: unavailable",
    "23:45 - 23:50",
    "Before",
    "After",
    "By An actor",
  ])
    assert.ok(text.includes(value.replaceAll(" ", "")), value);
});

test("portable embedded font preserves Cyrillic and CJK names and exposes unsupported codepoints", async () => {
  const change = event(1);
  change.actor.name = "Мария Иванова";
  change.staff.name = "王小明";
  const pdf = await renderReportPdf(model([change]));
  const text = pdfText(pdf);
  assert.ok(text.includes("Мария Иванова"));
  assert.ok(text.includes("王小明"));
  assert.ok(
    pdf.length < 200_000,
    "PDF embeds a small used-glyph subset rather than the complete font",
  );
  change.actor.name = "Unsupported \u{1FAE0}";
  const fallback = pdfText(await renderReportPdf(model([change])));
  assert.ok(fallback.includes("[U+1FAE0]"));
  assert.ok(fallback.includes("Unicode codepoint labels"));
});
