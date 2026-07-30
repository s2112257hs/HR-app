import { addDays, format, parseISO } from "date-fns";

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

