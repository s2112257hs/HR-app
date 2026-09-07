import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { ShiftStatus, UserRole } from "@prisma/client";
import { createPrismaMock, testUser } from "../../test/test-utils";
import { ShiftsService } from "./shifts.service";

describe("ShiftsService", () => {
  let prisma: ReturnType<typeof createPrismaMock>;
  let auditService: { record: jest.Mock };
  let rosterLocksService: { assertWritable: jest.Mock };
  let tenantEntityService: { ensureActiveEmployeeAndDepartment: jest.Mock };
  let service: ShiftsService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = createPrismaMock();
    auditService = { record: jest.fn() };
    rosterLocksService = { assertWritable: jest.fn() };
    tenantEntityService = { ensureActiveEmployeeAndDepartment: jest.fn() };
    prisma.organisation.findUniqueOrThrow.mockResolvedValue({ timezone: "Asia/Tashkent" });
    prisma.dayMarker.findMany.mockResolvedValue([]);
    service = new ShiftsService(prisma, auditService as any, rosterLocksService as any, tenantEntityService as any);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("gets a shift or throws not found", async () => {
    prisma.shift.findFirst.mockResolvedValueOnce(shift()).mockResolvedValueOnce(null);

    await expect(service.get("org-1", "shift-1")).resolves.toMatchObject({ id: "shift-1" });
    await expect(service.get("org-1", "missing")).rejects.toBeInstanceOf(NotFoundException);
  });

  it("checks overlaps and returns a compact response", async () => {
    prisma.shift.findMany.mockResolvedValue([shift()]);

    await expect(
      service.checkOverlap("org-1", {
        employeeId: "employee-1",
        startAt: "2026-08-20T08:00:00.000Z",
        endAt: "2026-08-20T12:00:00.000Z",
        excludeShiftId: "shift-old"
      })
    ).resolves.toEqual({
      hasOverlap: true,
      overlaps: [
        {
          shiftId: "shift-1",
          departmentName: "Front Office",
          departmentShortCode: "FO",
          startAt: expect.any(Date),
          endAt: expect.any(Date)
        }
      ]
    });
    expect(prisma.shift.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: { not: "shift-old" } }) }));
  });

  it("checks overlaps without an excluded shift", async () => {
    prisma.shift.findMany.mockResolvedValue([]);

    await expect(
      service.checkOverlap("org-1", {
        employeeId: "employee-1",
        startAt: "2026-08-20T08:00:00.000Z",
        endAt: "2026-08-20T12:00:00.000Z"
      })
    ).resolves.toEqual({ hasOverlap: false, overlaps: [] });
    expect(prisma.shift.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.not.objectContaining({ id: expect.anything() }) }));
  });

  it("validates ranges before checking overlaps", async () => {
    await expect(service.checkOverlap("org-1", { employeeId: "employee-1", startAt: "bad", endAt: "2026-08-20T12:00:00.000Z" })).rejects.toBeInstanceOf(
      BadRequestException
    );
    await expect(service.checkOverlap("org-1", { employeeId: "employee-1", startAt: "2026-08-20T08:00:00.000Z", endAt: "bad" })).rejects.toBeInstanceOf(
      BadRequestException
    );
    await expect(
      service.checkOverlap("org-1", {
        employeeId: "employee-1",
        startAt: "2026-08-20T12:00:00.000Z",
        endAt: "2026-08-20T08:00:00.000Z"
      })
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("creates shifts when there are no conflicts", async () => {
    prisma.shift.findMany.mockResolvedValue([]);
    prisma.shift.create.mockResolvedValue(shift({ id: "created-shift" }));

    const created = await service.create(testUser({ role: UserRole.ADMIN }), {
      employeeId: "employee-1",
      departmentId: "department-1",
      startAt: "2026-08-20T08:00:00.000Z",
      endAt: "2026-08-20T12:00:00.000Z",
      unpaidBreakMinutes: 15,
      overtimeMinutes: 30,
      notes: " Note "
    });

    expect(created).toMatchObject({ id: "created-shift", hasOverlap: false });
    expect(rosterLocksService.assertWritable).toHaveBeenCalled();
    expect(tenantEntityService.ensureActiveEmployeeAndDepartment).toHaveBeenCalledWith("org-1", "employee-1", "department-1");
    expect(prisma.shift.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ notes: "Note", overtimeMinutes: 30 }) }));
    expect(auditService.record).toHaveBeenCalledWith(expect.objectContaining({ action: "SHIFT_CREATED" }));
  });

  it("rejects create on unpaid break, overlap, or day-marker conflicts", async () => {
    await expect(
      service.create(testUser(), {
        employeeId: "employee-1",
        departmentId: "department-1",
        startAt: "2026-08-20T08:00:00.000Z",
        endAt: "2026-08-20T12:00:00.000Z",
        unpaidBreakMinutes: 999
      })
    ).rejects.toBeInstanceOf(BadRequestException);

    prisma.shift.findMany.mockResolvedValue([shift()]);
    await expect(
      service.create(testUser(), {
        employeeId: "employee-1",
        departmentId: "department-1",
        startAt: "2026-08-20T08:00:00.000Z",
        endAt: "2026-08-20T12:00:00.000Z"
      })
    ).rejects.toBeInstanceOf(ConflictException);

    prisma.shift.findMany.mockResolvedValue([]);
    prisma.dayMarker.findMany.mockResolvedValue([{ employeeId: "employee-1", date: new Date("2026-08-20T00:00:00.000Z"), type: "RDO" }]);
    await expect(
      service.create(testUser(), {
        employeeId: "employee-1",
        departmentId: "department-1",
        startAt: "2026-08-20T08:00:00.000Z",
        endAt: "2026-08-20T12:00:00.000Z"
      })
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("allows acknowledged overlapping creates", async () => {
    prisma.shift.findMany.mockResolvedValue([shift()]);
    prisma.shift.create.mockResolvedValue(shift());

    const created = await service.create(testUser({ role: UserRole.ADMIN }), {
      employeeId: "employee-1",
      departmentId: "department-1",
      startAt: "2026-08-20T08:00:00.000Z",
      endAt: "2026-08-20T12:00:00.000Z",
      overlapAcknowledged: true
    });

    expect(created.hasOverlap).toBe(true);
  });

  it("updates shifts with version checks and derived defaults", async () => {
    prisma.shift.findFirst.mockResolvedValue(shift({ version: 3, notes: "Old" }));
    prisma.shift.findMany.mockResolvedValue([]);
    prisma.shift.update.mockResolvedValue(shift({ version: 4, notes: null }));

    await service.update(testUser({ role: UserRole.ADMIN }), "shift-1", {
      version: 3,
      employeeId: "employee-2",
      departmentId: "department-2",
      startAt: "2026-08-20T09:00:00.000Z",
      endAt: "2026-08-20T12:00:00.000Z",
      notes: " "
    });

    expect(prisma.shift.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          employeeId: "employee-2",
          departmentId: "department-2",
          notes: null,
          version: { increment: 1 }
        })
      })
    );
    expect(auditService.record).toHaveBeenCalledWith(expect.objectContaining({ action: "SHIFT_UPDATED" }));
  });

  it("updates shifts using existing values when optional fields are omitted", async () => {
    prisma.shift.findFirst.mockResolvedValue(shift({ version: 3, notes: "Old note", unpaidBreakMinutes: 15, overtimeMinutes: 30 }));
    prisma.shift.findMany.mockResolvedValue([]);
    prisma.shift.update.mockResolvedValue(shift({ version: 4, notes: "Old note", unpaidBreakMinutes: 15, overtimeMinutes: 30 }));

    await service.update(testUser({ role: UserRole.ADMIN }), "shift-1", { version: 3 });

    expect(prisma.shift.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          employeeId: "employee-1",
          departmentId: "department-1",
          unpaidBreakMinutes: 15,
          overtimeMinutes: 30,
          notes: "Old note"
        })
      })
    );
  });

  it("allows acknowledged overlaps when updating shifts", async () => {
    prisma.shift.findFirst.mockResolvedValue(shift({ version: 3 }));
    prisma.shift.findMany.mockResolvedValue([shift({ id: "overlap-shift" })]);
    prisma.shift.update.mockResolvedValue(shift({ version: 4 }));

    const updated = await service.update(testUser({ role: UserRole.ADMIN }), "shift-1", { version: 3, overlapAcknowledged: true });

    expect(updated).toMatchObject({ id: "shift-1", hasOverlap: true });
  });

  it("rejects unacknowledged overlaps when updating shifts", async () => {
    prisma.shift.findFirst.mockResolvedValue(shift({ version: 3 }));
    prisma.shift.findMany.mockResolvedValue([shift({ id: "overlap-shift" })]);

    await expect(service.update(testUser({ role: UserRole.ADMIN }), "shift-1", { version: 3 })).rejects.toBeInstanceOf(ConflictException);
  });

  it("checks roster-manager edit windows using the shift start date", async () => {
    jest.useFakeTimers().setSystemTime(new Date("2026-08-20T00:00:00.000Z"));
    const manager = testUser({ role: UserRole.ROSTER_MANAGER });
    prisma.shift.findFirst.mockResolvedValue(shift({ version: 1, startAt: new Date("2026-08-21T08:00:00.000Z"), endAt: new Date("2026-08-21T12:00:00.000Z") }));
    prisma.shift.findMany.mockResolvedValue([]);
    prisma.shift.update.mockResolvedValue(shift({ version: 2 }));

    await expect(service.update(manager, "shift-1", { version: 1 })).resolves.toMatchObject({ id: "shift-1" });

    prisma.shift.findFirst.mockResolvedValue(shift({ startAt: new Date("2026-08-19T08:00:00.000Z") }));
    await expect(service.cancel(manager, "shift-1")).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("rejects update when missing or stale", async () => {
    prisma.shift.findFirst.mockResolvedValueOnce(null);
    await expect(service.update(testUser(), "missing", { version: 1 })).rejects.toBeInstanceOf(NotFoundException);

    prisma.shift.findFirst.mockResolvedValueOnce(shift({ version: 2 }));
    await expect(service.update(testUser(), "shift-1", { version: 1 })).rejects.toBeInstanceOf(ConflictException);
  });

  it("cancels shifts and rejects missing shifts", async () => {
    prisma.shift.findFirst.mockResolvedValueOnce(null);
    await expect(service.cancel(testUser(), "missing")).rejects.toBeInstanceOf(NotFoundException);

    prisma.shift.findFirst.mockResolvedValueOnce(shift());
    prisma.shift.update.mockResolvedValue(shift({ status: ShiftStatus.CANCELLED }));
    await service.cancel(testUser({ role: UserRole.ADMIN }), "shift-1");

    expect(prisma.shift.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: ShiftStatus.CANCELLED }) }));
    expect(auditService.record).toHaveBeenCalledWith(expect.objectContaining({ action: "SHIFT_CANCELLED" }));
  });

  it("returns no day-marker conflicts for an empty shift list", async () => {
    await expect((service as any).findDayMarkerConflictsForShifts("org-1", [], "Asia/Tashkent")).resolves.toEqual([]);
    expect(prisma.dayMarker.findMany).not.toHaveBeenCalled();
  });
});

function shift(overrides: Record<string, unknown> = {}) {
  return {
    id: "shift-1",
    organisationId: "org-1",
    employeeId: "employee-1",
    departmentId: "department-1",
    startAt: new Date("2026-08-20T08:00:00.000Z"),
    endAt: new Date("2026-08-20T12:00:00.000Z"),
    unpaidBreakMinutes: 0,
    overtimeMinutes: 0,
    notes: null,
    status: ShiftStatus.SCHEDULED,
    deletedAt: null,
    version: 1,
    employee: { id: "employee-1", isActive: true, deletedAt: null },
    department: { id: "department-1", name: "Front Office", shortCode: "FO", isActive: true, deletedAt: null },
    ...overrides
  };
}
