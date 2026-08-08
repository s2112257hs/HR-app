import { Prisma, ShiftStatus } from "@prisma/client";
import { buildRosterRange } from "./roster-dates";

export function scheduledShiftsStartingOnDateWhere(organisationId: string, employeeId: string, date: string, timezone: string): Prisma.ShiftWhereInput {
  const range = buildRosterRange(date, timezone, 1);
  return {
    organisationId,
    employeeId,
    deletedAt: null,
    status: ShiftStatus.SCHEDULED,
    startAt: { gte: range.rangeStart, lt: range.rangeEnd }
  };
}

export function scheduledShiftsOverlappingDateWhere(organisationId: string, employeeId: string, date: string, timezone: string): Prisma.ShiftWhereInput {
  const range = buildRosterRange(date, timezone, 1);
  return {
    organisationId,
    employeeId,
    deletedAt: null,
    status: ShiftStatus.SCHEDULED,
    startAt: { lt: range.rangeEnd },
    endAt: { gt: range.rangeStart }
  };
}
