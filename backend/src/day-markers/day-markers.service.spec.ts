import { BadRequestException, NotFoundException } from "@nestjs/common";
import { DayMarkerType, ShiftStatus, UserRole } from "@prisma/client";
import { DateTime } from "luxon";
import { createPrismaMock, testUser } from "../../test/test-utils";
import { DayMarkersService } from "./day-markers.service";

describe("DayMarkersService", () => {
  let prisma: ReturnType<typeof createPrismaMock>;
  let auditService: { record: jest.Mock };
  let rosterLocksService: { assertWritable: jest.Mock };
  let tenantEntityService: { ensureActiveEmployee: jest.Mock };
  let service: DayMarkersService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = createPrismaMock();
    auditService = { record: jest.fn() };
    rosterLocksService = { assertWritable: jest.fn() };
    tenantEntityService = { ensureActiveEmployee: jest.fn() };
    service = new DayMarkersService(prisma, auditService as any, rosterLocksService as any, tenantEntityService as any);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("creates a marker and cancels overlapping shifts", async () => {
    prisma.organisation.findUniqueOrThrow.mockResolvedValue({ timezone: "Asia/Tashkent" });
    prisma.dayMarker.findUnique.mockResolvedValue(null);
    prisma.dayMarker.create.mockResolvedValue(marker());
    prisma.shift.findMany.mockResolvedValue([{ id: "shift-1" }]);
    prisma.shift.updateMany.mockResolvedValue({ count: 1 });

    const result = await service.set(testUser({ role: UserRole.ADMIN }), { employeeId: "employee-1", date: "2026-08-20", type: DayMarkerType.RDO, notes: " note " });

    expect(result).toMatchObject({ id: "marker-1", date: "2026-08-20", type: DayMarkerType.RDO });
    expect(prisma.dayMarker.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ notes: "note", createdByUserId: "user-1", updatedByUserId: "user-1" })
      })
    );
    expect(prisma.shift.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: ShiftStatus.CANCELLED }) }));
    expect(auditService.record).toHaveBeenCalledWith(expect.objectContaining({ action: "DAY_MARKER_CREATED" }));
  });

  it("creates markers with null notes when notes are omitted", async () => {
    prisma.organisation.findUniqueOrThrow.mockResolvedValue({ timezone: "Asia/Tashkent" });
    prisma.dayMarker.findUnique.mockResolvedValue(null);
    prisma.dayMarker.create.mockResolvedValue(marker({ notes: null }));
    prisma.shift.findMany.mockResolvedValue([]);

    await service.set(testUser({ role: UserRole.ADMIN }), { employeeId: "employee-1", date: "2026-08-20", type: DayMarkerType.LEAVE });

    expect(prisma.dayMarker.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ notes: null }) }));
  });

  it("updates an existing marker without cancelling shifts when there are none", async () => {
    prisma.organisation.findUniqueOrThrow.mockResolvedValue({ timezone: "Asia/Tashkent" });
    prisma.dayMarker.findUnique.mockResolvedValue(marker({ notes: "old" }));
    prisma.dayMarker.update.mockResolvedValue(marker({ type: DayMarkerType.SICK, notes: null }));
    prisma.shift.findMany.mockResolvedValue([]);

    await service.set(testUser({ role: UserRole.ADMIN }), { employeeId: "employee-1", date: "2026-08-20", type: DayMarkerType.SICK, notes: " " });

    expect(prisma.dayMarker.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ type: DayMarkerType.SICK, notes: null }) }));
    expect(prisma.shift.updateMany).not.toHaveBeenCalled();
    expect(auditService.record).toHaveBeenCalledWith(expect.objectContaining({ action: "DAY_MARKER_UPDATED" }));
  });

  it("removes markers or throws not found", async () => {
    prisma.dayMarker.findFirst.mockResolvedValueOnce(null);
    await expect(service.remove(testUser(), "missing")).rejects.toBeInstanceOf(NotFoundException);

    prisma.dayMarker.findFirst.mockResolvedValue(marker());
    prisma.organisation.findUniqueOrThrow.mockResolvedValue({ timezone: "Asia/Tashkent" });
    prisma.dayMarker.delete.mockResolvedValue(marker());

    await service.remove(testUser({ role: UserRole.ADMIN }), "marker-1");

    expect(prisma.dayMarker.delete).toHaveBeenCalledWith({ where: { id: "marker-1" } });
    expect(auditService.record).toHaveBeenCalledWith(expect.objectContaining({ action: "DAY_MARKER_REMOVED" }));
  });

  it("calculates RDO tracker balances from configured week starts", async () => {
    prisma.organisation.findUniqueOrThrow.mockResolvedValue({
      timezone: "Asia/Tashkent",
      rdoTrackingStartDate: new Date("2026-08-03T00:00:00.000Z"),
      weekStartDay: 1
    });
    prisma.employee.findMany.mockResolvedValue([
      {
        id: "employee-1",
        employeeNumber: "1",
        firstName: "Ada",
        lastName: "Lovelace",
        preferredName: null,
        startDate: new Date("2026-08-10T00:00:00.000Z"),
        displayOrder: 1,
        rdoBalanceBroughtForward: 1,
        primaryDepartment: { id: "department-1", name: "Front Office", shortCode: "FO", colourHex: "#FFFFFF", displayOrder: 1 },
        dayMarkers: [{ date: new Date("2026-08-10T00:00:00.000Z"), type: DayMarkerType.RDO }]
      }
    ]);

    const tracker = await service.rdoTracker("org-1", "2026-08-17");

    expect(tracker).toMatchObject({
      asOfDate: "2026-08-17",
      trackingStartDate: "2026-08-03",
      employees: [
        {
          employeeId: "employee-1",
          displayName: "Ada Lovelace",
          requiredRdo: 2,
          rdoTaken: 1,
          rdoOwed: 2
        }
      ]
    });
  });

  it("returns zero required RDO when tracking starts after the as-of date", async () => {
    prisma.organisation.findUniqueOrThrow.mockResolvedValue({
      timezone: "Asia/Tashkent",
      rdoTrackingStartDate: new Date("2026-08-20T00:00:00.000Z"),
      weekStartDay: 1
    });
    prisma.employee.findMany.mockResolvedValue([
      {
        id: "employee-1",
        employeeNumber: "1",
        firstName: "Ada",
        lastName: null,
        preferredName: null,
        startDate: null,
        displayOrder: 1,
        rdoBalanceBroughtForward: 0,
        primaryDepartment: null,
        dayMarkers: []
      }
    ]);

    const tracker = await service.rdoTracker("org-1", "2026-08-17");

    expect(tracker.employees[0]).toMatchObject({ requiredRdo: 0, rdoTaken: 0, rdoOwed: 0, primaryDepartment: null });
  });

  it("uses today in the organisation timezone when no RDO as-of date is supplied", async () => {
    jest.useFakeTimers().setSystemTime(new Date("2026-08-17T01:00:00.000Z"));
    prisma.organisation.findUniqueOrThrow.mockResolvedValue({
      timezone: "Asia/Tashkent",
      rdoTrackingStartDate: new Date("2026-08-03T00:00:00.000Z"),
      weekStartDay: 1
    });
    prisma.employee.findMany.mockResolvedValue([
      {
        id: "employee-1",
        employeeNumber: "1",
        firstName: "Ada",
        lastName: null,
        preferredName: "A",
        startDate: null,
        displayOrder: 1,
        rdoBalanceBroughtForward: 0,
        primaryDepartment: null,
        dayMarkers: []
      }
    ]);

    const tracker = await service.rdoTracker("org-1");

    expect(tracker.asOfDate).toBe("2026-08-17");
    expect(tracker.employees[0]).toMatchObject({ displayName: "A", requiredRdo: 3 });
  });

  it("rejects an invalid generated RDO as-of date defensively", async () => {
    const nowSpy = jest.spyOn(DateTime, "now").mockReturnValue(DateTime.invalid("bad clock") as unknown as ReturnType<typeof DateTime.now>);
    prisma.organisation.findUniqueOrThrow.mockResolvedValue({
      timezone: "Asia/Tashkent",
      rdoTrackingStartDate: new Date("2026-08-03T00:00:00.000Z"),
      weekStartDay: 1
    });

    await expect(service.rdoTracker("org-1")).rejects.toBeInstanceOf(BadRequestException);
    nowSpy.mockRestore();
  });
});

function marker(overrides: Record<string, unknown> = {}) {
  return {
    id: "marker-1",
    organisationId: "org-1",
    employeeId: "employee-1",
    date: new Date("2026-08-20T00:00:00.000Z"),
    type: DayMarkerType.RDO,
    notes: "note",
    createdAt: new Date("2026-08-01T00:00:00.000Z"),
    updatedAt: new Date("2026-08-01T00:00:00.000Z"),
    ...overrides
  };
}
