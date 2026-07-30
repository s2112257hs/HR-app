import { rangesOverlap } from "../src/common/utils/overlap";
import { buildRosterRange } from "../src/common/utils/roster-dates";

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
});
