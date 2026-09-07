import { durationMinutes, rangesOverlap } from "./overlap";

describe("overlap utils", () => {
  it("treats intersecting ranges as overlapping", () => {
    expect(
      rangesOverlap(
        { startAt: new Date("2026-08-20T08:00:00+05:00"), endAt: new Date("2026-08-20T12:00:00+05:00") },
        { startAt: new Date("2026-08-20T11:59:00+05:00"), endAt: new Date("2026-08-20T16:00:00+05:00") }
      )
    ).toBe(true);
  });

  it("treats back-to-back ranges as non-overlapping", () => {
    expect(
      rangesOverlap(
        { startAt: new Date("2026-08-20T08:00:00+05:00"), endAt: new Date("2026-08-20T12:00:00+05:00") },
        { startAt: new Date("2026-08-20T12:00:00+05:00"), endAt: new Date("2026-08-20T16:00:00+05:00") }
      )
    ).toBe(false);
  });

  it("calculates whole-minute duration", () => {
    expect(durationMinutes(new Date("2026-08-20T08:00:00+05:00"), new Date("2026-08-20T09:45:30+05:00"))).toBe(105);
  });
});
