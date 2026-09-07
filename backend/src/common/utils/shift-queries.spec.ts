import { ShiftStatus } from "@prisma/client";
import { scheduledShiftsOverlappingDateWhere, scheduledShiftsStartingOnDateWhere } from "./shift-queries";

describe("shift query utils", () => {
  it("builds a start-date bounded scheduled-shift filter", () => {
    const where = scheduledShiftsStartingOnDateWhere("org-1", "employee-1", "2026-08-20", "Indian/Maldives") as any;

    expect(where).toMatchObject({
      organisationId: "org-1",
      employeeId: "employee-1",
      deletedAt: null,
      status: ShiftStatus.SCHEDULED
    });
    expect(where.startAt.gte.toISOString()).toBe("2026-08-19T19:00:00.000Z");
    expect(where.startAt.lt.toISOString()).toBe("2026-08-20T19:00:00.000Z");
  });

  it("builds an overlapping-day scheduled-shift filter", () => {
    const where = scheduledShiftsOverlappingDateWhere("org-1", "employee-1", "2026-08-20", "Indian/Maldives") as any;

    expect(where.startAt.lt.toISOString()).toBe("2026-08-20T19:00:00.000Z");
    expect(where.endAt.gt.toISOString()).toBe("2026-08-19T19:00:00.000Z");
  });
});
