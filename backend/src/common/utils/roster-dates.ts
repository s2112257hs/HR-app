import { BadRequestException } from "@nestjs/common";
import { DateTime } from "luxon";

export type RosterRange = {
  rangeStart: Date;
  rangeEnd: Date;
  dates: string[];
  endDateExclusive: string;
};

export function buildRosterRange(date: string, timezone: string, days: number, startTime = "00:00"): RosterRange {
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(startTime)) {
    throw new BadRequestException({
      error: "VALIDATION_ERROR",
      message: "The request contains invalid information.",
      fields: {
        startTime: "Start time must use HH:mm format."
      }
    });
  }

  const dateStart = DateTime.fromISO(date, { zone: timezone }).startOf("day");
  const start = DateTime.fromISO(`${date}T${startTime}`, { zone: timezone });

  if (!dateStart.isValid || !start.isValid) {
    throw new BadRequestException({
      error: "VALIDATION_ERROR",
      message: "The request contains invalid information.",
      fields: {
        date: "Date must be a valid ISO date."
      }
    });
  }

  const dates = Array.from({ length: days }, (_item, index) => dateStart.plus({ days: index }).toISODate() ?? date);
  const end = start.plus({ days });

  return {
    rangeStart: start.toUTC().toJSDate(),
    rangeEnd: end.toUTC().toJSDate(),
    dates,
    endDateExclusive: end.toISODate() ?? date
  };
}
