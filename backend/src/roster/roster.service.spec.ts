import { BadRequestException, ConflictException } from "@nestjs/common";
import { DayMarkerType, ShiftStatus, UserRole } from "@prisma/client";
import { createPrismaMock, testUser } from "../../test/test-utils";
import { RosterService } from "./roster.service";

describe("RosterService", () => {
  let prisma: ReturnType<typeof createPrismaMock>;
  let auditService: { record: jest.Mock };
  let rosterLocksService: { assertWritable: jest.Mock };
  let tenantEntityService: { ensureActiveEmployee: jest.Mock; ensureActiveDepartment: jest.Mock };
  let service: RosterService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = createPrismaMock();
    auditService = { record: jest.fn() };
    rosterLocksService = { assertWritable: jest.fn() };
    tenantEntityService = { ensureActiveEmployee: jest.fn(), ensureActiveDepartment: jest.fn() };
    service = new RosterService(prisma, auditService as any, rosterLocksService as any, tenantEntityService as any);
  });

  it("loads a daily roster with shifts, markers, overlap flags, and roster segments", async () => {
    prisma.organisation.findUniqueOrThrow.mockResolvedValue({ timezone: "Asia/Tashkent", weekStartDay: 1 });
    prisma.employee.findMany.mockResolvedValue([rosterEmployee()]);

    const roster = await service.daily("org-1", "2026-08-20", "07:00");

    expect(roster).toMatchObject({
      startDate: "2026-08-20",
      endDateExclusive: "2026-08-21",
      dates: ["2026-08-20"],
      employees: [
        {
          id: "employee-1",
          displayName: "Ada Lovelace",
          dayMarkers: [expect.objectContaining({ date: "2026-08-20", type: DayMarkerType.RDO })],
          shifts: [expect.objectContaining({ rosterSegments: expect.any(Array), hasOverlap: false })]
        }
      ]
    });
  });

  it("rejects a daily roster without a date", async () => {
    await expect(service.daily("org-1", "")).rejects.toBeInstanceOf(BadRequestException);
  });

  it("loads weekly rosters aligned to configured week start or exact requested start", async () => {
    prisma.organisation.findUniqueOrThrow.mockResolvedValue({ timezone: "Asia/Tashkent", weekStartDay: 1 });
    prisma.employee.findMany.mockResolvedValue([]);

    const aligned = await service.weekly("org-1", "2026-08-20", true);
    const exact = await service.weekly("org-1", "2026-08-20", false);

    expect(aligned.startDate).toBe("2026-08-17");
    expect(exact.startDate).toBe("2026-08-20");
  });

  it("uses default weekly alignment for roster and validation calls", async () => {
    prisma.organisation.findUniqueOrThrow.mockResolvedValue({ timezone: "Asia/Tashkent", weekStartDay: 1 });
    prisma.employee.findMany.mockResolvedValue([]);
    prisma.validationRule.findMany.mockResolvedValue([]);
    prisma.shift.findMany.mockResolvedValue([]);

    await expect(service.weekly("org-1", "2026-08-20")).resolves.toMatchObject({ startDate: "2026-08-17" });
    await expect(service.validateWeekly("org-1", "2026-08-20")).resolves.toMatchObject({ startDate: "2026-08-17", valid: true });
  });

  it("renders employees without departments and flags overlapping roster shifts", async () => {
    prisma.organisation.findUniqueOrThrow.mockResolvedValue({ timezone: "Asia/Tashkent", weekStartDay: 1 });
    prisma.employee.findMany.mockResolvedValue([
      rosterEmployee({
        primaryDepartmentId: null,
        primaryDepartment: null,
        shifts: [
          shift({ id: "shift-1", startAt: new Date("2026-08-20T08:00:00.000Z"), endAt: new Date("2026-08-20T12:00:00.000Z") }),
          shift({ id: "shift-2", startAt: new Date("2026-08-20T09:00:00.000Z"), endAt: new Date("2026-08-20T13:00:00.000Z") })
        ]
      })
    ]);

    const roster = await service.daily("org-1", "2026-08-20");

    expect(roster.employees[0]).toMatchObject({ primaryDepartment: null, primaryDepartmentId: null });
    expect(roster.employees[0].shifts).toEqual([expect.objectContaining({ hasOverlap: true }), expect.objectContaining({ hasOverlap: true })]);
  });

  it("rejects invalid weekly start dates", async () => {
    prisma.organisation.findUniqueOrThrow.mockResolvedValue({ timezone: "Asia/Tashkent", weekStartDay: 1 });

    await expect(service.weekly("org-1", "", true)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.weekly("org-1", "not-a-date", true)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.weekly("org-1", "", false)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.weekly("org-1", "not-a-date", false)).rejects.toBeInstanceOf(BadRequestException);
  });

  it("validates weekly staffing rules and reports shortfalls", async () => {
    prisma.organisation.findUniqueOrThrow.mockResolvedValue({ timezone: "Asia/Tashkent", weekStartDay: 1 });
    prisma.validationRule.findMany.mockResolvedValue([validationRule({ minimumStaff: 2 })]);
    prisma.shift.findMany.mockResolvedValue([{ employeeId: "employee-1", departmentId: "department-1", startAt: new Date("2026-08-17T03:00:00.000Z"), endAt: new Date("2026-08-17T08:00:00.000Z") }]);

    const validation = await service.validateWeekly("org-1", "2026-08-17", true);

    expect(validation.valid).toBe(false);
    expect(validation.violations[0]).toMatchObject({ ruleName: "Breakfast", actualMinimumStaff: 1 });
  });

  it("validates rules that end at 23:59 as covering the full remaining day", async () => {
    prisma.organisation.findUniqueOrThrow.mockResolvedValue({ timezone: "Asia/Tashkent", weekStartDay: 1 });
    prisma.validationRule.findMany.mockResolvedValue([validationRule({ endTime: "23:59", minimumStaff: 1 })]);
    prisma.shift.findMany.mockResolvedValue([]);

    const validation = await service.validateWeekly("org-1", "2026-08-17", false);

    expect(validation.violations[0]).toMatchObject({ endTime: "23:59" });
  });

  it("returns valid weekly validation when rules are covered", async () => {
    prisma.organisation.findUniqueOrThrow.mockResolvedValue({ timezone: "Asia/Tashkent", weekStartDay: 1 });
    prisma.validationRule.findMany.mockResolvedValue([validationRule({ minimumStaff: 1 })]);
    prisma.shift.findMany.mockResolvedValue(
      Array.from({ length: 7 }, (_item, index) => ({
        employeeId: `employee-${index + 1}`,
        departmentId: "department-1",
        startAt: new Date(Date.UTC(2026, 7, 17 + index, 3, 0, 0)),
        endAt: new Date(Date.UTC(2026, 7, 17 + index, 8, 0, 0))
      }))
    );

    await expect(service.validateWeekly("org-1", "2026-08-17", false)).resolves.toMatchObject({ valid: true, checkedRules: 1 });
  });

  it("summarises overtime by overlapping minutes within a selected date range", async () => {
    prisma.organisation.findUniqueOrThrow.mockResolvedValue({ timezone: "Asia/Tashkent" });
    prisma.employee.findMany.mockResolvedValue([
      {
        ...rosterEmployee(),
        shifts: [
          {
            startAt: new Date("2026-08-20T18:00:00.000Z"),
            endAt: new Date("2026-08-21T02:00:00.000Z"),
            overtimeMinutes: 30,
            department: department()
          }
        ]
      }
    ]);

    const summary = await service.overtimeSummary("org-1", "2026-08-21", "2026-08-21");

    expect(summary.totals).toEqual({ hoursWorkedMinutes: 420, overtimeMinutes: 30 });
  });

  it("summarises overtime for employees without primary departments", async () => {
    prisma.organisation.findUniqueOrThrow.mockResolvedValue({ timezone: "Asia/Tashkent" });
    prisma.employee.findMany.mockResolvedValue([rosterEmployee({ primaryDepartment: null, shifts: [] })]);

    const summary = await service.overtimeSummary("org-1", "2026-08-20", "2026-08-20");

    expect(summary.employees[0]).toMatchObject({ primaryDepartment: null, hoursWorkedMinutes: 0, overtimeMinutes: 0 });
  });

  it("summarises attendance days by shift start date, marker type, and blanks", async () => {
    prisma.organisation.findUniqueOrThrow.mockResolvedValue({ timezone: "Asia/Tashkent" });
    prisma.employee.findMany.mockResolvedValue([
      {
        ...rosterEmployee(),
        shifts: [{ startAt: new Date("2026-08-20T15:00:00.000Z") }],
        dayMarkers: [{ date: new Date("2026-08-21T00:00:00.000Z"), type: DayMarkerType.SICK }]
      }
    ]);

    const summary = await service.attendanceSummary("org-1", "2026-08-20", "2026-08-22");

    expect(summary.employees[0]).toMatchObject({ workedDays: 1, sickDays: 1, blankDays: 1, totalDays: 3 });
  });

  it("summarises attendance for employees without primary departments", async () => {
    prisma.organisation.findUniqueOrThrow.mockResolvedValue({ timezone: "Asia/Tashkent" });
    prisma.employee.findMany.mockResolvedValue([rosterEmployee({ primaryDepartment: null, shifts: [], dayMarkers: [] })]);

    const summary = await service.attendanceSummary("org-1", "2026-08-20", "2026-08-20");

    expect(summary.employees[0]).toMatchObject({ primaryDepartment: null, blankDays: 1, totalDays: 1 });
  });

  it("rejects invalid summary date ranges", async () => {
    prisma.organisation.findUniqueOrThrow.mockResolvedValue({ timezone: "Asia/Tashkent" });

    await expect(service.overtimeSummary("org-1", "", "2026-08-22")).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.overtimeSummary("org-1", "2026-08-20", "")).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.attendanceSummary("org-1", "not-a-date", "2026-08-22")).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.attendanceSummary("org-1", "2026-08-20", "not-a-date")).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.overtimeSummary("org-1", "2026-08-23", "2026-08-22")).rejects.toBeInstanceOf(BadRequestException);
  });

  it("returns EMPTY when copying from a blank weekly cell", async () => {
    prisma.organisation.findUniqueOrThrow.mockResolvedValue({ timezone: "Asia/Tashkent" });
    prisma.dayMarker.findUnique.mockResolvedValue(null);
    prisma.shift.findMany.mockResolvedValue([]);

    await expect(
      service.copyWeeklyCell(testUser({ role: UserRole.ADMIN }), {
        employeeId: "employee-1",
        sourceDate: "2026-08-20",
        targetStartDate: "2026-08-21",
        targetEndDate: "2026-08-22"
      })
    ).resolves.toEqual({ copiedKind: "EMPTY", copiedCount: 0, targetDates: ["2026-08-21", "2026-08-22"] });
  });

  it("copies markers to weekly target cells after clearing existing data", async () => {
    prisma.organisation.findUniqueOrThrow.mockResolvedValue({ timezone: "Asia/Tashkent" });
    prisma.dayMarker.findUnique.mockResolvedValue(marker());
    prisma.dayMarker.findMany.mockResolvedValue([]);
    prisma.shift.count.mockResolvedValue(0);
    prisma.dayMarker.create.mockResolvedValue({ id: "new-marker" });
    prisma.shift.findMany.mockResolvedValue([]);

    const result = await service.copyWeeklyCell(testUser({ role: UserRole.ADMIN }), {
      employeeId: "employee-1",
      sourceDate: "2026-08-20",
      targetStartDate: "2026-08-21",
      targetEndDate: "2026-08-21"
    });

    expect(result).toEqual({ copiedKind: DayMarkerType.RDO, copiedCount: 1, targetDates: ["2026-08-21"] });
    expect(auditService.record).toHaveBeenCalledWith(expect.objectContaining({ action: "WEEKLY_CELL_COPIED", entityType: "DayMarker" }));
  });

  it("asks for confirmation before replacing existing weekly cells", async () => {
    prisma.organisation.findUniqueOrThrow.mockResolvedValue({ timezone: "Asia/Tashkent" });
    prisma.dayMarker.findUnique.mockResolvedValue(marker());
    prisma.dayMarker.findMany.mockResolvedValue([{ date: new Date("2026-08-21T00:00:00.000Z"), type: DayMarkerType.SICK }]);
    prisma.shift.count.mockResolvedValue(0);

    await expect(
      service.copyWeeklyCell(testUser({ role: UserRole.ADMIN }), {
        employeeId: "employee-1",
        sourceDate: "2026-08-20",
        targetStartDate: "2026-08-21",
        targetEndDate: "2026-08-21"
      })
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("asks for replacement confirmation when target cells have shifts but no markers", async () => {
    prisma.organisation.findUniqueOrThrow.mockResolvedValue({ timezone: "Asia/Tashkent" });
    prisma.dayMarker.findUnique.mockResolvedValue(marker());
    prisma.dayMarker.findMany.mockResolvedValue([]);
    prisma.shift.count.mockResolvedValue(1);

    await expect(
      service.copyWeeklyCell(testUser({ role: UserRole.ADMIN }), {
        employeeId: "employee-1",
        sourceDate: "2026-08-20",
        targetStartDate: "2026-08-21",
        targetEndDate: "2026-08-21"
      })
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("copies shifts and rejects inactive source shift references", async () => {
    prisma.organisation.findUniqueOrThrow.mockResolvedValue({ timezone: "Asia/Tashkent" });
    prisma.dayMarker.findUnique.mockResolvedValue(null);
    prisma.shift.findMany.mockResolvedValueOnce([{ ...shift(), employee: { isActive: false, deletedAt: null }, department: { isActive: true, deletedAt: null } }]);

    await expect(
      service.copyWeeklyCell(testUser({ role: UserRole.ADMIN }), {
        employeeId: "employee-1",
        sourceDate: "2026-08-20",
        targetStartDate: "2026-08-21",
        targetEndDate: "2026-08-21"
      })
    ).rejects.toBeInstanceOf(BadRequestException);

    prisma.shift.findMany.mockReset();
    prisma.shift.findMany.mockResolvedValueOnce([shift()]).mockResolvedValue([]);
    prisma.dayMarker.findMany.mockResolvedValue([]);
    prisma.shift.count.mockResolvedValue(0);
    prisma.shift.create.mockResolvedValue({ id: "new-shift" });

    const result = await service.copyWeeklyCell(testUser({ role: UserRole.ADMIN }), {
      employeeId: "employee-1",
      sourceDate: "2026-08-20",
      targetStartDate: "2026-08-21",
      targetEndDate: "2026-08-21"
    });

    expect(result).toEqual({ copiedKind: "SHIFT", copiedCount: 1, targetDates: ["2026-08-21"] });
  });

  it("rejects weekly copy ranges longer than the maximum", async () => {
    prisma.organisation.findUniqueOrThrow.mockResolvedValue({ timezone: "Asia/Tashkent" });

    await expect(
      service.copyWeeklyCell(testUser({ role: UserRole.ADMIN }), {
        employeeId: "employee-1",
        sourceDate: "2026-08-20",
        targetStartDate: "2026-08-21",
        targetEndDate: "2026-12-31"
      })
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("rejects invalid weekly copy target ranges", async () => {
    prisma.organisation.findUniqueOrThrow.mockResolvedValue({ timezone: "Asia/Tashkent" });

    await expect(
      service.copyWeeklyCell(testUser({ role: UserRole.ADMIN }), {
        employeeId: "employee-1",
        sourceDate: "2026-08-20",
        targetStartDate: "bad",
        targetEndDate: "2026-08-21"
      })
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.copyWeeklyCell(testUser({ role: UserRole.ADMIN }), {
        employeeId: "employee-1",
        sourceDate: "2026-08-20",
        targetStartDate: "2026-08-21",
        targetEndDate: "bad"
      })
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.copyWeeklyCell(testUser({ role: UserRole.ADMIN }), {
        employeeId: "employee-1",
        sourceDate: "2026-08-20",
        targetStartDate: "2026-08-22",
        targetEndDate: "2026-08-21"
      })
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("clears and restores weekly cells", async () => {
    prisma.organisation.findUniqueOrThrow.mockResolvedValue({ timezone: "Asia/Tashkent" });
    prisma.dayMarker.findMany.mockResolvedValue([{ id: "marker-1" }]);
    prisma.dayMarker.deleteMany.mockResolvedValue({ count: 1 });
    prisma.shift.findMany.mockResolvedValue([{ id: "shift-1" }]);
    prisma.shift.updateMany.mockResolvedValue({ count: 1 });
    prisma.dayMarker.create.mockResolvedValue({ id: "restored-marker" });
    prisma.shift.create.mockResolvedValue({ id: "restored-shift" });

    await expect(service.clearWeeklyCellsForUser(testUser({ role: UserRole.ADMIN }), { cells: [{ employeeId: "employee-1", date: "2026-08-20" }] })).resolves.toMatchObject({
      clearedCount: 1
    });
    await expect(
      service.restoreWeeklyCells(testUser({ role: UserRole.ADMIN }), {
        cells: [
          { employeeId: "employee-1", date: "2026-08-20", marker: { type: DayMarkerType.RDO, notes: " note " }, shifts: [] },
          {
            employeeId: "employee-1",
            date: "2026-08-21",
            marker: null,
            shifts: [{ departmentId: "department-1", startAt: "2026-08-21T08:00:00.000Z", endAt: "2026-08-21T12:00:00.000Z", unpaidBreakMinutes: 0 }]
          }
        ]
      })
    ).resolves.toMatchObject({ restoredCount: 2 });
  });

  it("deduplicates and clears empty weekly cells without delete or cancel calls", async () => {
    prisma.organisation.findUniqueOrThrow.mockResolvedValue({ timezone: "Asia/Tashkent" });
    prisma.dayMarker.findMany.mockResolvedValue([]);
    prisma.shift.findMany.mockResolvedValue([]);

    const result = await service.clearWeeklyCellsForUser(testUser({ role: UserRole.ADMIN }), {
      cells: [
        { employeeId: "employee-1", date: "2026-08-20" },
        { employeeId: "employee-1", date: "2026-08-20" }
      ]
    });

    expect(result).toMatchObject({ clearedCount: 1, cells: [expect.objectContaining({ removedMarkerIds: [], cancelledShiftIds: [] })] });
    expect(tenantEntityService.ensureActiveEmployee).toHaveBeenCalledTimes(1);
    expect(prisma.dayMarker.deleteMany).not.toHaveBeenCalled();
    expect(prisma.shift.updateMany).not.toHaveBeenCalled();
  });

  it("queries overlaps using the shared scheduled shift criteria", async () => {
    prisma.shift.findMany.mockResolvedValue([shift()]);

    await expect((service as any).findOverlaps("org-1", "employee-1", new Date("2026-08-20T08:00:00.000Z"), new Date("2026-08-20T12:00:00.000Z"))).resolves.toEqual([
      shift()
    ]);
    expect(prisma.shift.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ employeeId: "employee-1", status: ShiftStatus.SCHEDULED }) }));
  });
});

function department() {
  return { id: "department-1", name: "Front Office", shortCode: "FO", colourHex: "#FFFFFF", displayOrder: 1, isActive: true, deletedAt: null };
}

function rosterEmployee(overrides: Record<string, unknown> = {}) {
  return {
    id: "employee-1",
    employeeNumber: "1",
    firstName: "Ada",
    lastName: "Lovelace",
    preferredName: null,
    primaryDepartmentId: "department-1",
    primaryDepartment: department(),
    displayOrder: 1,
    isActive: true,
    dayMarkers: [marker()],
    shifts: [shift()],
    ...overrides
  };
}

function marker(overrides: Record<string, unknown> = {}) {
  return {
    id: "marker-1",
    employeeId: "employee-1",
    date: new Date("2026-08-20T00:00:00.000Z"),
    type: DayMarkerType.RDO,
    notes: null,
    ...overrides
  };
}

function shift(overrides: Record<string, unknown> = {}) {
  return {
    id: "shift-1",
    employeeId: "employee-1",
    departmentId: "department-1",
    startAt: new Date("2026-08-20T15:00:00.000Z"),
    endAt: new Date("2026-08-20T23:00:00.000Z"),
    unpaidBreakMinutes: 0,
    overtimeMinutes: 30,
    notes: null,
    status: ShiftStatus.SCHEDULED,
    version: 1,
    department: department(),
    employee: { isActive: true, deletedAt: null },
    ...overrides
  };
}

function validationRule(overrides: Record<string, unknown> = {}) {
  return {
    id: "rule-1",
    name: "Breakfast",
    departmentId: "department-1",
    startTime: "08:00",
    endTime: "12:00",
    minimumStaff: 1,
    department: department(),
    ...overrides
  };
}
