import { DayMarkerType } from "@prisma/client";
import { DateTime } from "luxon";
import { utcDateToDateKey } from "./roster-dates";

type AttendanceMarker = {
  date: Date;
  type: DayMarkerType;
};

export function countAttendanceDays(input: {
  shifts: Array<{ startAt: Date }>;
  dayMarkers: AttendanceMarker[];
  totalDays: number;
  timezone: string;
}) {
  const workedDates = new Set(input.shifts.map((shift) => DateTime.fromJSDate(shift.startAt).setZone(input.timezone).toISODate()).filter(Boolean));
  const markerDatesByType = {
    [DayMarkerType.RDO]: new Set<string>(),
    [DayMarkerType.SICK]: new Set<string>(),
    [DayMarkerType.LEAVE]: new Set<string>()
  };

  for (const marker of input.dayMarkers) {
    const markerDate = utcDateToDateKey(marker.date);
    if (!workedDates.has(markerDate)) {
      markerDatesByType[marker.type].add(markerDate);
    }
  }

  const workedDays = workedDates.size;
  const rdoDays = markerDatesByType.RDO.size;
  const sickDays = markerDatesByType.SICK.size;
  const leaveDays = markerDatesByType.LEAVE.size;

  return {
    workedDays,
    rdoDays,
    sickDays,
    leaveDays,
    blankDays: Math.max(0, input.totalDays - workedDays - rdoDays - sickDays - leaveDays)
  };
}
