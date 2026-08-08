import { BadRequestException } from "@nestjs/common";
import { DayMarkerType } from "@prisma/client";
import { countAttendanceDays } from "../src/common/utils/attendance-summary";
import { durationMinutes, rangesOverlap } from "../src/common/utils/overlap";
import { buildRosterRange, dateKeysOverlappingRange, dateKeyToUtcDate, parseRosterDate, utcDateToDateKey } from "../src/common/utils/roster-dates";

describe("roster rules", () => {
  it("returns seven consecutive dates from the selected leftmost date", () => {
    const range = buildRosterRange("2026-08-20", "Indian/Maldives", 7);

    expect(range.dates).toEqual([
      "2026-08-20",
      "2026-08-21",
      "2026-08-22",
      "2026-08-23",
      "2026-08-24",
      "2026-08-25",
      "2026-08-26"
    ]);
    expect(range.endDateExclusive).toBe("2026-08-27");
  });

  it("supports a rolling daily window from any selected start time", () => {
    const range = buildRosterRange("2026-08-20", "Indian/Maldives", 1, "07:00");

    expect(range.dates).toEqual(["2026-08-20"]);
    expect(range.rangeStart.toISOString()).toBe("2026-08-20T02:00:00.000Z");
    expect(range.rangeEnd.toISOString()).toBe("2026-08-21T02:00:00.000Z");
  });

  it("treats back-to-back shifts as non-overlapping", () => {
    expect(
      rangesOverlap(
        { startAt: new Date("2026-08-20T08:00:00+05:00"), endAt: new Date("2026-08-20T12:00:00+05:00") },
        { startAt: new Date("2026-08-20T12:00:00+05:00"), endAt: new Date("2026-08-20T16:00:00+05:00") }
      )
    ).toBe(false);
  });

  it("detects normal and overnight overlaps", () => {
    expect(
      rangesOverlap(
        { startAt: new Date("2026-08-20T08:00:00+05:00"), endAt: new Date("2026-08-20T12:00:00+05:00") },
        { startAt: new Date("2026-08-20T11:59:00+05:00"), endAt: new Date("2026-08-20T16:00:00+05:00") }
      )
    ).toBe(true);

    expect(
      rangesOverlap(
        { startAt: new Date("2026-08-20T22:00:00+05:00"), endAt: new Date("2026-08-21T06:00:00+05:00") },
        { startAt: new Date("2026-08-21T05:00:00+05:00"), endAt: new Date("2026-08-21T08:00:00+05:00") }
      )
    ).toBe(true);
  });

  it("calculates duration in whole minutes", () => {
    expect(durationMinutes(new Date("2026-08-20T08:00:00+05:00"), new Date("2026-08-20T09:45:30+05:00"))).toBe(105);
  });

  it("rejects invalid roster start times", () => {
    expect(() => buildRosterRange("2026-08-20", "Indian/Maldives", 1, "7am")).toThrow(BadRequestException);
  });

  it("rejects invalid roster dates", () => {
    expect(() => buildRosterRange("not-a-date", "Indian/Maldives", 1)).toThrow(BadRequestException);
  });

  it("parses local roster dates into date keys and UTC date columns", () => {
    const parsed = parseRosterDate("2026-08-20", "Indian/Maldives");

    expect(parsed.dateKey).toBe("2026-08-20");
    expect(parsed.date.toISOString()).toBe("2026-08-20T00:00:00.000Z");
    expect(dateKeyToUtcDate("2026-08-21").toISOString()).toBe("2026-08-21T00:00:00.000Z");
    expect(utcDateToDateKey(parsed.date)).toBe("2026-08-20");
  });

  it("rejects invalid shared date helper inputs", () => {
    expect(() => parseRosterDate("not-a-date", "Indian/Maldives", "sourceDate")).toThrow(BadRequestException);
    expect(() => dateKeyToUtcDate("not-a-date", "date")).toThrow(BadRequestException);
  });

  it("returns each local date touched by an overnight range", () => {
    expect(
      dateKeysOverlappingRange(
        new Date("2026-08-20T20:00:00+05:00"),
        new Date("2026-08-22T00:00:00+05:00"),
        "Indian/Maldives"
      )
    ).toEqual(["2026-08-20", "2026-08-21"]);
  });

  it("counts overnight shifts as one worked day on the shift start date", () => {
    const counts = countAttendanceDays({
      timezone: "Asia/Tashkent",
      totalDays: 3,
      shifts: [{ startAt: new Date("2026-08-03T20:00:00+05:00") }],
      dayMarkers: [{ date: dateKeyToUtcDate("2026-08-05"), type: DayMarkerType.RDO }]
    });

    expect(counts).toEqual({
      workedDays: 1,
      rdoDays: 1,
      sickDays: 0,
      leaveDays: 0,
      blankDays: 1
    });
  });
});
