import { jsPDF } from "jspdf";
import { DayMarker, RosterResponse, Shift } from "../../../types/api";
import { dateKeyFromIso, dateLabel, isNextDay, timeLabel } from "./dates";

const PAGE_MARGIN = 28;
const EMPLOYEE_COLUMN_WIDTH = 92;
const HEADER_HEIGHT = 28;
const MIN_ROW_HEIGHT = 38;
const CELL_PADDING = 5;

type PdfOptions = {
  darkMode?: boolean;
};

type PdfColours = {
  page: [number, number, number];
  panel: [number, number, number];
  header: [number, number, number];
  border: [number, number, number];
  text: [number, number, number];
  muted: [number, number, number];
};

export function downloadWeeklyRosterPdf(roster: RosterResponse, options: PdfOptions = {}) {
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const colours = pdfColours(options.darkMode);
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const tableWidth = pageWidth - PAGE_MARGIN * 2;
  const dateColumnWidth = (tableWidth - EMPLOYEE_COLUMN_WIDTH) / roster.dates.length;
  let y = PAGE_MARGIN;

  fillPage(doc, colours);
  drawTitle(doc, roster, colours);
  y += 34;
  drawHeader(doc, roster.dates, y, dateColumnWidth, colours);
  y += HEADER_HEIGHT;

  roster.employees.forEach((employee) => {
    const rowHeight = getRowHeight(roster.dates, employee.shifts, employee.dayMarkers);

    if (y + rowHeight > pageHeight - PAGE_MARGIN) {
      doc.addPage();
      fillPage(doc, colours);
      y = PAGE_MARGIN;
      drawHeader(doc, roster.dates, y, dateColumnWidth, colours);
      y += HEADER_HEIGHT;
    }

    const primaryDepartmentRgb = employee.primaryDepartment ? hexToRgb(employee.primaryDepartment.colourHex) : null;
    const employeeFill = primaryDepartmentRgb ? mixRgb(primaryDepartmentRgb, colours.panel, options.darkMode ? 0.72 : 0.9) : colours.panel;

    doc.setDrawColor(...colours.border);
    doc.setFillColor(...employeeFill);
    doc.rect(PAGE_MARGIN, y, EMPLOYEE_COLUMN_WIDTH, rowHeight);

    if (primaryDepartmentRgb) {
      doc.setFillColor(...primaryDepartmentRgb);
      doc.rect(PAGE_MARGIN, y, 4, rowHeight, "F");
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(...colours.text);
    doc.text(employee.displayName, PAGE_MARGIN + CELL_PADDING + (primaryDepartmentRgb ? 4 : 0), y + 15, {
      maxWidth: EMPLOYEE_COLUMN_WIDTH - CELL_PADDING * 2 - (primaryDepartmentRgb ? 4 : 0)
    });

    roster.dates.forEach((date, index) => {
      const x = PAGE_MARGIN + EMPLOYEE_COLUMN_WIDTH + index * dateColumnWidth;
      doc.setDrawColor(...colours.border);
      doc.setFillColor(...colours.panel);
      doc.rect(x, y, dateColumnWidth, rowHeight);
      const marker = getDayMarkerForDate(employee.dayMarkers, date);
      if (marker) {
        drawDayMarker(doc, marker, x, y, dateColumnWidth, rowHeight, Boolean(options.darkMode));
      } else {
        drawShiftLines(doc, getShiftsForDate(employee.shifts, date), date, x, y, dateColumnWidth, colours, Boolean(options.darkMode));
      }
    });

    y += rowHeight;
  });

  doc.save(`weekly-roster-${roster.startDate}.pdf`);
}

function fillPage(doc: jsPDF, colours: PdfColours) {
  doc.setFillColor(...colours.page);
  doc.rect(0, 0, doc.internal.pageSize.getWidth(), doc.internal.pageSize.getHeight(), "F");
}

function drawTitle(doc: jsPDF, roster: RosterResponse, colours: PdfColours) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(...colours.text);
  doc.text("Weekly roster", PAGE_MARGIN, PAGE_MARGIN + 2);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...colours.muted);
  doc.text(`${roster.startDate} to ${roster.endDateExclusive} | ${roster.timezone}`, PAGE_MARGIN, PAGE_MARGIN + 18);
}

function drawHeader(doc: jsPDF, dates: string[], y: number, dateColumnWidth: number, colours: PdfColours) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(...colours.muted);
  doc.setFillColor(...colours.header);
  doc.setDrawColor(...colours.border);
  doc.rect(PAGE_MARGIN, y, EMPLOYEE_COLUMN_WIDTH, HEADER_HEIGHT, "FD");
  doc.text("Employee", PAGE_MARGIN + CELL_PADDING, y + 17);

  dates.forEach((date, index) => {
    const x = PAGE_MARGIN + EMPLOYEE_COLUMN_WIDTH + index * dateColumnWidth;
    doc.setFillColor(...colours.header);
    doc.rect(x, y, dateColumnWidth, HEADER_HEIGHT, "FD");
    doc.text(dateLabel(date), x + CELL_PADDING, y + 17, {
      maxWidth: dateColumnWidth - CELL_PADDING * 2
    });
  });
}

function drawShiftLines(doc: jsPDF, shifts: Shift[], date: string, x: number, y: number, width: number, colours: PdfColours, darkMode: boolean) {
  shifts.forEach((shift, index) => {
    const lineY = y + CELL_PADDING + index * 16;
    const departmentRgb = hexToRgb(shift.department.colourHex);
    const tint = mixRgb(departmentRgb, darkMode ? colours.panel : [255, 255, 255], darkMode ? 0.42 : 0.78);
    const segment = shift.rosterSegments?.find((segment) => segment.date === date);
    const timeText = segment ? `${segment.startTime}-${segment.endTime}` : `${timeLabel(shift.startAt)}-${timeLabel(shift.endAt)}${isNextDay(shift.startAt, shift.endAt) ? " +1" : ""}`;
    const text = `${shift.department.shortCode} ${timeText}${shift.hasOverlap ? " !" : ""}`;

    doc.setFillColor(...tint);
    doc.setDrawColor(...departmentRgb);
    doc.roundedRect(x + CELL_PADDING, lineY - 1, width - CELL_PADDING * 2, 13, 2, 2, "FD");
    doc.setFont("helvetica", shift.hasOverlap ? "bold" : "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...colours.text);
    doc.text(text, x + CELL_PADDING + 4, lineY + 8, {
      maxWidth: width - CELL_PADDING * 2 - 4
    });
  });
}

function drawDayMarker(doc: jsPDF, marker: DayMarker, x: number, y: number, width: number, height: number, darkMode: boolean) {
  if (marker.type === "RDO" || marker.type === "LEAVE") {
    doc.setFillColor(0, 0, 0);
    doc.setDrawColor(255, 45, 45);
    doc.rect(x, y, width, height, "FD");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(15);
    doc.setTextColor(255, 45, 45);
    doc.text(marker.type, x + width / 2, y + height / 2 + 5, { align: "center" });
    return;
  }

  doc.setFillColor(...(darkMode ? ([63, 21, 29] as [number, number, number]) : ([255, 245, 246] as [number, number, number])));
  doc.setDrawColor(190, 18, 60);
  doc.rect(x, y, width, height, "FD");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.setTextColor(...(darkMode ? ([254, 205, 211] as [number, number, number]) : ([180, 35, 52] as [number, number, number])));
  doc.text(marker.type, x + width / 2, y + height / 2 + 5, { align: "center" });
}

function getRowHeight(dates: string[], shifts: Shift[], dayMarkers: DayMarker[]) {
  const maxLines = Math.max(1, ...dates.map((date) => (getDayMarkerForDate(dayMarkers, date) ? 1 : getShiftsForDate(shifts, date).length)));
  return Math.max(MIN_ROW_HEIGHT, CELL_PADDING * 2 + maxLines * 16);
}

function getShiftsForDate(shifts: Shift[], date: string) {
  return shifts
    .filter((shift) => (shift.rosterSegments ? shift.rosterSegments.some((segment) => segment.date === date) : dateKeyFromIso(shift.startAt) === date))
    .sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
}

function getDayMarkerForDate(dayMarkers: DayMarker[], date: string) {
  return dayMarkers.find((marker) => marker.date === date);
}

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  return [parseInt(clean.slice(0, 2), 16), parseInt(clean.slice(2, 4), 16), parseInt(clean.slice(4, 6), 16)];
}

function mixRgb(foreground: [number, number, number], background: [number, number, number], backgroundWeight: number): [number, number, number] {
  return foreground.map((value, index) => Math.round(value * (1 - backgroundWeight) + background[index] * backgroundWeight)) as [number, number, number];
}

function pdfColours(darkMode?: boolean): PdfColours {
  if (darkMode) {
    return {
      page: [15, 23, 32],
      panel: [23, 32, 42],
      header: [31, 42, 55],
      border: [64, 78, 92],
      text: [226, 232, 240],
      muted: [176, 188, 199]
    };
  }

  return {
    page: [255, 255, 255],
    panel: [255, 255, 255],
    header: [248, 250, 251],
    border: [210, 219, 226],
    text: [24, 35, 47],
    muted: [101, 115, 130]
  };
}
