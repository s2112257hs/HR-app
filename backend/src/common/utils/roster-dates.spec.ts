import { BadRequestException } from "@nestjs/common";
import { buildRosterRange, dateKeysOverlappingRange, dateKeyToUtcDate, parseRosterDate, utcDateToDateKey } from "./roster-dates";

describe("roster date utils", () => {
  it("returns consecutive dates and UTC bounds for a roster window", () => {
    const range = buildRosterRange("2026-08-20", "Indian/Maldives", 7);

    expect(range.dates).toEqual(["2026-08-20", "2026-08-21", "2026-08-22", "2026-08-23", "2026-08-24", "2026-08-25", "2026-08-26"]);
    expect(range.endDateExclusive).toBe("2026-08-27");
    expect(range.rangeStart.toISOString()).toBe("2026-08-19T19:00:00.000Z");
  });

  it("supports a rolling daily window from a selected start time", () => {
    const range = buildRosterRange("2026-08-20", "Indian/Maldives", 1, "07:00");

    expect(range.dates).toEqual(["2026-08-20"]);
    expect(range.rangeStart.toISOString()).toBe("2026-08-20T02:00:00.000Z");
    expect(range.rangeEnd.toISOString()).toBe("2026-08-21T02:00:00.000Z");
  });

  it("parses local roster dates into date keys and UTC date columns", () => {
    const parsed = parseRosterDate("2026-08-20", "Indian/Maldives");

    expect(parsed.dateKey).toBe("2026-08-20");
    expect(parsed.date.toISOString()).toBe("2026-08-20T00:00:00.000Z");
    expect(dateKeyToUtcDate("2026-08-21").toISOString()).toBe("2026-08-21T00:00:00.000Z");
    expect(utcDateToDateKey(parsed.date)).toBe("2026-08-20");
  });

  it("returns each local date touched by an overnight range", () => {
    expect(dateKeysOverlappingRange(new Date("2026-08-20T20:00:00+05:00"), new Date("2026-08-22T00:00:00+05:00"), "Indian/Maldives")).toEqual([
      "2026-08-20",
      "2026-08-21"
    ]);
  });

  it("rejects invalid dates and start times", () => {
    expect(() => buildRosterRange("2026-08-20", "Indian/Maldives", 1, "7am")).toThrow(BadRequestException);
    expect(() => buildRosterRange("not-a-date", "Indian/Maldives", 1)).toThrow(BadRequestException);
    expect(() => parseRosterDate("not-a-date", "Indian/Maldives", "sourceDate")).toThrow(BadRequestException);
    expect(() => dateKeyToUtcDate("not-a-date", "date")).toThrow(BadRequestException);
  });
});
