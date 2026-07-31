import { addDays, differenceInCalendarDays, format, parseISO } from "date-fns";
import type { Shift } from "../../../types/api";

export function todayKey() {
  return format(new Date(), "yyyy-MM-dd");
}

export function getSevenDates(startDate: string) {
  const start = parseISO(startDate);
  return Array.from({ length: 7 }, (_item, index) => format(addDays(start, index), "yyyy-MM-dd"));
}

export function addDateDays(date: string, amount: number) {
  return format(addDays(parseISO(date), amount), "yyyy-MM-dd");
}

export function dateLabel(date: string) {
  return format(parseISO(date), "EEE d MMM");
}

export function timeLabel(iso: string) {
  return format(parseISO(iso), "HH:mm");
}

export function timeLabel12(iso: string) {
  return format(parseISO(iso), "h:mm a");
}

export function clockLabel12(time: string) {
  const [hours, minutes] = time.split(":").map(Number);
  const suffix = hours >= 12 ? "PM" : "AM";
  const hour = hours % 12 || 12;
  return `${hour}:${String(minutes).padStart(2, "0")} ${suffix}`;
}

export function timeRangeLabel12(startTime: string, endTime: string) {
  return `${clockLabel12(startTime)}-${clockLabel12(endTime)}`;
}

export function dateKeyFromIso(iso: string) {
  return format(parseISO(iso), "yyyy-MM-dd");
}

export function toLocalDateTimeIso(date: string, time: string, addOneDay = false) {
  const base = addOneDay ? addDays(parseISO(date), 1) : parseISO(date);
  const datePart = format(base, "yyyy-MM-dd");
  return new Date(`${datePart}T${time}:00`).toISOString();
}

export function isNextDay(startAt: string, endAt: string) {
  return dateKeyFromIso(startAt) !== dateKeyFromIso(endAt);
}

export function weeklyShiftDate(shift: Pick<Shift, "startAt" | "rosterSegments">) {
  return shift.rosterSegments?.[0]?.date ?? dateKeyFromIso(shift.startAt);
}

export function shiftAppearsOnWeeklyDate(shift: Pick<Shift, "startAt" | "rosterSegments">, date: string) {
  return weeklyShiftDate(shift) === date;
}

export function weeklyShiftTimeText(shift: Pick<Shift, "startAt" | "endAt" | "rosterSegments">) {
  const segments = shift.rosterSegments;

  if (segments?.length) {
    const first = segments[0];
    const last = segments[segments.length - 1];
    const daysLater = Math.max(0, differenceInCalendarDays(parseISO(last.date), parseISO(first.date)));
    return `${timeRangeLabel12(first.startTime, last.endTime)}${daysLater > 0 ? ` +${daysLater}` : ""}`;
  }

  return `${timeLabel12(shift.startAt)}-${timeLabel12(shift.endAt)}${isNextDay(shift.startAt, shift.endAt) ? " +1" : ""}`;
}
