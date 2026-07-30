import { describe, expect, it } from "vitest";
import { getSevenDates } from "../src/features/roster/utilities/dates";
import { getGridHours, minutesToTime, snapMinutes } from "../src/features/roster/utilities/time";
import { getContrastText } from "../src/utilities/colour";

describe("roster frontend utilities", () => {
  it("generates seven consecutive columns from the selected leftmost date", () => {
    expect(getSevenDates("2026-08-20")).toEqual([
      "2026-08-20",
      "2026-08-21",
      "2026-08-22",
      "2026-08-23",
      "2026-08-24",
      "2026-08-25",
      "2026-08-26"
    ]);
  });

  it("snaps daily selections to the frontend interval", () => {
    expect(snapMinutes(14)).toBe(0);
    expect(snapMinutes(15)).toBe(30);
    expect(snapMinutes(23)).toBe(30);
  });

  it("shows the daily grid as a full 24 hour range", () => {
    expect(getGridHours()[0]).toBe("00:00");
    expect(getGridHours()).toHaveLength(24);
    expect(getGridHours().at(-1)).toBe("23:00");
    expect(minutesToTime(24 * 60)).toBe("00:00");
  });

  it("rotates the daily grid headings from the selected start time", () => {
    expect(getGridHours("07:00").slice(0, 3)).toEqual(["07:00", "08:00", "09:00"]);
    expect(getGridHours("07:00").at(-1)).toBe("06:00");
    expect(minutesToTime(19 * 60, "07:00")).toBe("02:00");
  });

  it("keeps department colours readable", () => {
    expect(getContrastText("#2563EB")).toBe("#FFFFFF");
    expect(getContrastText("#F8FAFC")).toBe("#17202A");
  });
});
