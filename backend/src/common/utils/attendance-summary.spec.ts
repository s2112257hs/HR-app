import { DayMarkerType } from "@prisma/client";
import { countAttendanceDays } from "./attendance-summary";
import { dateKeyToUtcDate } from "./roster-dates";

describe("countAttendanceDays", () => {
  it("counts worked days by shift start date and ignores markers on worked dates", () => {
    const counts = countAttendanceDays({
      timezone: "Asia/Tashkent",
      totalDays: 4,
      shifts: [
        { startAt: new Date("2026-08-03T20:00:00+05:00") },
        { startAt: new Date("2026-08-03T21:00:00+05:00") }
      ],
      dayMarkers: [
        { date: dateKeyToUtcDate("2026-08-03"), type: DayMarkerType.SICK },
        { date: dateKeyToUtcDate("2026-08-04"), type: DayMarkerType.RDO },
        { date: dateKeyToUtcDate("2026-08-05"), type: DayMarkerType.LEAVE }
      ]
    });

    expect(counts).toEqual({
      workedDays: 1,
      rdoDays: 1,
      sickDays: 0,
      leaveDays: 1,
      blankDays: 1
    });
  });

  it("never returns negative blank days", () => {
    expect(
      countAttendanceDays({
        timezone: "Asia/Tashkent",
        totalDays: 1,
        shifts: [{ startAt: new Date("2026-08-03T08:00:00+05:00") }],
        dayMarkers: [
          { date: dateKeyToUtcDate("2026-08-04"), type: DayMarkerType.RDO },
          { date: dateKeyToUtcDate("2026-08-05"), type: DayMarkerType.SICK }
        ]
      }).blankDays
    ).toBe(0);
  });
});
