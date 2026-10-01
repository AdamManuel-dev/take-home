import { reportFont, reportText } from "./fonts.js";
import PDFDocument from "pdfkit";
import { DateTime } from "luxon";
import { TIMEZONE, WEEKDAYS } from "../../shared/constants.js";
import type { ScheduleChange } from "../../shared/contracts/change-events.js";
import type { Window } from "../../shared/contracts/types.js";
import { formatTime } from "../../shared/time.js";
import { reportModelSchema, type ReportModel } from "./contracts.js";

export interface ReportRenderer {
  render(model: ReportModel): Promise<Buffer>;
}
const local = (instant: string) =>
  DateTime.fromISO(instant, { zone: "utc" })
    .setZone(TIMEZONE)
    .toFormat("LLL d, yyyy HH:mm ZZZZ");
const windowLines = (windows: Window[]) =>
  windows.map(
    (window) => `${formatTime(window.start)} - ${formatTime(window.end)}`,
  );
function valueLines(event: ScheduleChange, side: "before" | "after") {
  if (event.entityType === "weekly")
    return event[side].length
      ? windowLines(event[side])
      : ["No weekly availability"];
  const value = event[side];
  return value
    ? [
        `Mode: ${value.mode}`,
        ...(value.windows.length
          ? windowLines(value.windows)
          : ["No available windows"]),
      ]
    : ["No date override"];
}

/** PDF adapter: bounded continuation rows keep even 96-window edits inside page margins. */
export async function renderReportPdf(input: ReportModel): Promise<Buffer> {
  const model = reportModelSchema.parse(input);
  const doc = new PDFDocument({
    size: "LETTER",
    margin: 42,
    bufferPages: true,
    info: {
      Title: "Daily schedule changes",
      Author: "Open Hours",
      Subject: model.id,
    },
  });
  doc.registerFont("Report", reportFont);
  const chunks: Buffer[] = [];
  const output = new Promise<Buffer>((resolve, reject) => {
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
  const left = 42,
    width = 528,
    bottom = 732;
  let y = 42;
  function text(value: string, size = 10, bold = false, x = left, w = width) {
    value = reportText(value);
    doc
      .font("Report")
      .fontSize(size)
      .fillColor(bold ? "#102c29" : "#203b39");
    const height = doc.heightOfString(value, { width: w, lineGap: 2 });
    doc.text(value, x, y, { width: w, lineGap: 2 });
    return height;
  }
  function page() {
    doc.addPage();
    y = 42;
  }
  function headingHeight(value: string) {
    return (
      doc
        .font("Report")
        .fontSize(13)
        .heightOfString(reportText(value), { width, lineGap: 2 }) + 12
    );
  }
  function heading(value: string) {
    const height = doc
      .font("Report")
      .fontSize(13)
      .heightOfString(reportText(value), { width, lineGap: 2 });
    if (y + height + 40 > bottom) page();
    y += text(value, 13, true) + 12;
  }
  y += text("OPEN HOURS / DAILY REPORT", 9, true) + 12;
  y += text("Daily schedule changes", 23, true) + 16;
  y += text(`Report ID: ${model.id}`, 9) + 5;
  y +=
    text(
      `Interval: ${local(model.interval.start)} to ${local(model.interval.end)} (end excluded)`,
      10,
    ) + 5;
  y +=
    text(
      `Timezone: ${model.timezone}\nGenerated: ${local(model.generatedAt)}`,
      9,
    ) + 22;
  if (reportText(JSON.stringify(model)) !== JSON.stringify(model)) {
    y +=
      text(
        "Unsupported characters are shown as [U+XXXX] Unicode codepoint labels.",
        9,
      ) + 12;
  }
  heading("Summary by staff and change category");
  const staffIds = [...new Set(model.changes.map((event) => event.staff.id))];
  if (!model.changes.length) {
    y += text("No schedule changes", 14, true) + 10;
    y +=
      text(
        "No weekly availability or override changes were committed in this reporting interval.",
      ) + 10;
  }
  for (const staffId of staffIds) {
    const events = model.changes.filter((event) => event.staff.id === staffId);
    const counts = (entityType: ScheduleChange["entityType"]) =>
      ["created", "updated", "deleted"]
        .map(
          (operation) =>
            `${operation}: ${events.filter((event) => event.entityType === entityType && event.operation === operation).length}`,
        )
        .join(" / ");
    const summary = `${events[0].staff.name} (${staffId})\nWeekly - ${counts("weekly")}\nOverrides - ${counts("override")}`;
    const height =
      doc
        .font("Report")
        .fontSize(10)
        .heightOfString(reportText(summary), { width, lineGap: 2 }) + 14;
    if (y + height > bottom) {
      page();
      heading("Summary by staff and change category (continued)");
    }
    y += text(summary) + 14;
  }
  const columns = [left, left + 180, left + 354];
  const widths = [168, 162, 162];
  function tableHeader(group: string) {
    heading(group);
    doc.rect(left, y, width, 22).fill("#eaf1ed");
    for (const [index, label] of [
      "Change / actor / time",
      "Before",
      "After",
    ].entries())
      text(label, 9, true, columns[index] + 4, widths[index] - 8);
    y += 28;
  }
  function rowCells(event: ScheduleChange, part: number) {
    const before = valueLines(event, "before"),
      after = valueLines(event, "after");
    const count = Math.ceil(Math.max(before.length, after.length) / 12);
    return [
      `${event.operation.toUpperCase()}${count > 1 ? ` (part ${part + 1}/${count})` : ""}\n${local(event.occurredAt)}\nBy ${event.actor.name}\nEvent ${event.sequence}`,
      before.slice(part * 12, (part + 1) * 12).join("\n") ||
        "(continued above)",
      after.slice(part * 12, (part + 1) * 12).join("\n") || "(continued above)",
    ];
  }
  function rowHeight(cells: string[]) {
    return (
      Math.max(
        ...cells.map((cell, index) =>
          doc
            .font("Report")
            .fontSize(9)
            .heightOfString(reportText(cell), {
              width: widths[index] - 8,
              lineGap: 2,
            }),
        ),
      ) + 16
    );
  }
  for (const entityType of ["weekly", "override"] as const) {
    const events = model.changes.filter(
      (event) => event.entityType === entityType,
    );
    if (!events.length) continue;
    const section =
      entityType === "weekly"
        ? "Weekly availability changes"
        : "Date override changes";
    let sectionPending = true;
    for (const staffId of [...new Set(events.map((event) => event.staff.id))]) {
      const staffEvents = events.filter((event) => event.staff.id === staffId);
      const targets = [
        ...new Set(
          staffEvents.map((event) =>
            event.entityType === "weekly" ? String(event.weekday) : event.date,
          ),
        ),
      ].sort();
      for (const target of targets) {
        const groupEvents = staffEvents
          .filter(
            (event) =>
              (event.entityType === "weekly"
                ? String(event.weekday)
                : event.date) === target,
          )
          .sort(
            (a, b) =>
              Date.parse(a.occurredAt) - Date.parse(b.occurredAt) ||
              a.sequence - b.sequence,
          );
        const group = `${groupEvents[0].staff.name} (${staffId}) / ${entityType === "weekly" ? WEEKDAYS[Number(target)] : target}`;
        const firstRowHeight = rowHeight(rowCells(groupEvents[0], 0));
        const headerHeight = headingHeight(group) + 28;
        if (
          y +
            headerHeight +
            firstRowHeight +
            (sectionPending ? headingHeight(section) : 0) >
          bottom
        )
          page();
        if (sectionPending) {
          heading(section);
          sectionPending = false;
        }
        tableHeader(group);
        for (const event of groupEvents) {
          const before = valueLines(event, "before"),
            after = valueLines(event, "after");
          const count = Math.ceil(Math.max(before.length, after.length) / 12);
          for (let part = 0; part < count; part++) {
            const cells = rowCells(event, part);
            const height = rowHeight(cells);
            if (y + height > bottom) {
              page();
              tableHeader(`${group} (continued)`);
            }
            for (const [index, cell] of cells.entries())
              text(cell, 9, false, columns[index] + 4, widths[index] - 8);
            y += height;
            doc
              .moveTo(left, y - 7)
              .lineTo(left + width, y - 7)
              .strokeColor("#d9e2dd")
              .stroke();
          }
        }
        y += 14;
      }
    }
  }
  const pages = doc.bufferedPageRange();
  for (let index = 0; index < pages.count; index++) {
    doc.switchToPage(index);
    doc
      .font("Report")
      .fontSize(8)
      .fillColor("#596b66")
      .text(
        reportText(
          `Open Hours | ${model.id} | Page ${index + 1} of ${pages.count}`,
        ),
        42,
        734,
        { width, align: "center", lineBreak: false },
      );
  }
  doc.end();
  return output;
}
export const pdfReportRenderer: ReportRenderer = { render: renderReportPdf };
