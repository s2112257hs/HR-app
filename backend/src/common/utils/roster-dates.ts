import { DateTime } from "luxon";
import { validationError } from "./api-errors";

export type RosterRange = {
  rangeStart: Date;
  rangeEnd: Date;
  dates: string[];
  endDateExclusive: string;
};

export type ParsedRosterDate = {
  dateTime: DateTime;
  dateKey: string;
  date: Date;
};

export function buildRosterRange(date: string, timezone: string, days: number, startTime = "00:00"): RosterRange {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(startTime)) {
    throw validationError("startTime", "Start time must use HH:mm format.");
  }

  const dateStart = DateTime.fromISO(date, { zone: timezone }).startOf("day");
  const start = DateTime.fromISO(`${date}T${startTime}`, { zone: timezone });

  if (!dateStart.isValid || !start.isValid) {
    throw validationError("date", "Date must be a valid ISO date.");
  }

  const dates = Array.from({ length: days }, (_item, index) => dateStart.plus({ days: index }).toISODate()!);
  const end = start.plus({ days });

  return {
    rangeStart: start.toUTC().toJSDate(),
    rangeEnd: end.toUTC().toJSDate(),
    dates,
    endDateExclusive: end.toISODate()!
  };
}

export function parseRosterDate(date: string, timezone: string, field = "date"): ParsedRosterDate {
  const parsed = DateTime.fromISO(date, { zone: timezone }).startOf("day");

  if (!parsed.isValid) {
    throw validationError(field, "Date must be a valid ISO date.");
  }

  const dateKey = parsed.toISODate()!;
  return {
    dateTime: parsed,
    dateKey,
    date: dateKeyToUtcDate(dateKey, field)
  };
}

export function dateKeyToUtcDate(date: string, field = "date") {
  const parsed = DateTime.fromISO(date, { zone: "utc" }).startOf("day");

  if (!parsed.isValid) {
    throw validationError(field, "Date must be a valid ISO date.");
  }

  return parsed.toJSDate();
}

export function utcDateToDateKey(date: Date) {
  return DateTime.fromJSDate(date, { zone: "utc" }).toISODate()!;
}

export function dateKeysOverlappingRange(rangeStart: Date, rangeEnd: Date, timezone: string) {
  const firstDay = DateTime.fromJSDate(rangeStart).setZone(timezone).startOf("day");
  const lastDay = DateTime.fromJSDate(rangeEnd).setZone(timezone).minus({ millisecond: 1 }).startOf("day");
  const dates: string[] = [];

  for (let cursor = firstDay; cursor <= lastDay; cursor = cursor.plus({ days: 1 })) {
    dates.push(cursor.toISODate()!);
  }

  return dates;
}
