import { ConflictException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { createPrismaMock, testUser } from "../../test/test-utils";
import { DepartmentsService } from "./departments.service";

describe("DepartmentsService", () => {
  let prisma: ReturnType<typeof createPrismaMock>;
  let auditService: { record: jest.Mock };
  let service: DepartmentsService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = createPrismaMock();
    auditService = { record: jest.fn() };
    service = new DepartmentsService(prisma, auditService as any);
  });

  it("lists departments by active, inactive, or all status", async () => {
    prisma.department.findMany.mockResolvedValue([]);

    await service.list("org-1", "active");
    await service.list("org-1", "inactive");
    await service.list("org-1", "all");

    expect(prisma.department.findMany).toHaveBeenNthCalledWith(1, expect.objectContaining({ where: { organisationId: "org-1", isActive: true, deletedAt: null } }));
    expect(prisma.department.findMany).toHaveBeenNthCalledWith(2, expect.objectContaining({ where: { organisationId: "org-1", isActive: false } }));
    expect(prisma.department.findMany).toHaveBeenNthCalledWith(3, expect.objectContaining({ where: { organisationId: "org-1" } }));
  });

  it("gets a department by tenant id", async () => {
    prisma.department.findFirstOrThrow.mockResolvedValue({ id: "department-1" });

    await service.get("org-1", "department-1");

    expect(prisma.department.findFirstOrThrow).toHaveBeenCalledWith({ where: { id: "department-1", organisationId: "org-1" } });
  });

  it("creates a department with normalised fields and next display order", async () => {
    prisma.department.findFirst.mockResolvedValue({ displayOrder: 3 });
    prisma.department.create.mockResolvedValue({ id: "department-1", name: "Front Office" });

    const created = await service.create(testUser(), { name: " Front Office ", shortCode: " fo ", colourHex: " #abc123 " });

    expect(created).toEqual({ id: "department-1", name: "Front Office" });
    expect(prisma.department.create).toHaveBeenCalledWith({
      data: {
        organisationId: "org-1",
        name: "Front Office",
        shortCode: "FO",
        colourHex: "#ABC123",
        displayOrder: 4
      }
    });
    expect(auditService.record).toHaveBeenCalledWith(expect.objectContaining({ action: "DEPARTMENT_CREATED" }));
  });

  it("updates department scalar fields and records an audit event", async () => {
    prisma.department.findFirstOrThrow.mockResolvedValue({ id: "department-1", name: "Old" });
    prisma.department.update.mockResolvedValue({ id: "department-1", name: "New" });

    await service.update(testUser(), "department-1", { name: " New ", shortCode: " nw ", colourHex: " #fff000 " });

    expect(prisma.department.update).toHaveBeenCalledWith({
      where: { id: "department-1" },
      data: { name: "New", shortCode: "NW", colourHex: "#FFF000" }
    });
    expect(auditService.record).toHaveBeenCalledWith(expect.objectContaining({ action: "DEPARTMENT_UPDATED" }));
  });

  it("deactivates and restores departments", async () => {
    prisma.department.findFirstOrThrow.mockResolvedValue({ id: "department-1" });
    prisma.department.update.mockResolvedValue({ id: "department-1" });

    await service.deactivate(testUser(), "department-1");
    await service.restore(testUser(), "department-1");

    expect(prisma.department.update).toHaveBeenNthCalledWith(1, { where: { id: "department-1" }, data: { isActive: false, deletedAt: expect.any(Date) } });
    expect(prisma.department.update).toHaveBeenNthCalledWith(2, { where: { id: "department-1" }, data: { isActive: true, deletedAt: null } });
  });

  it("reorders departments and returns the full list", async () => {
    prisma.department.updateMany.mockResolvedValue({ count: 1 });
    prisma.department.findMany.mockResolvedValue([{ id: "department-2" }, { id: "department-1" }]);

    const result = await service.reorder(testUser(), ["department-2", "department-1"]);

    expect(result).toEqual([{ id: "department-2" }, { id: "department-1" }]);
    expect(prisma.$transaction).toHaveBeenCalledWith([expect.any(Promise), expect.any(Promise)]);
    expect(auditService.record).toHaveBeenCalledWith(expect.objectContaining({ action: "DEPARTMENTS_REORDERED" }));
  });

  it("converts unique short code and name failures into conflicts", async () => {
    prisma.department.findFirstOrThrow.mockResolvedValue({ id: "department-1" });
    prisma.department.update.mockRejectedValueOnce(uniqueError(["shortCode"])).mockRejectedValueOnce(uniqueError(["name"]));

    await expect(service.update(testUser(), "department-1", { shortCode: "FO" })).rejects.toBeInstanceOf(ConflictException);
    await expect(service.update(testUser(), "department-1", { name: "Front Office" })).rejects.toBeInstanceOf(ConflictException);
  });

  it("handles string or absent unique metadata when mapping department conflicts", async () => {
    prisma.department.findFirstOrThrow.mockResolvedValue({ id: "department-1" });
    prisma.department.update.mockRejectedValueOnce(uniqueError("short_code")).mockRejectedValueOnce(uniqueError(undefined));

    await expect(service.update(testUser(), "department-1", { shortCode: "FO" })).rejects.toBeInstanceOf(ConflictException);
    await expect(service.update(testUser(), "department-1", { name: "Front Office" })).rejects.toBeInstanceOf(ConflictException);
  });

  it("rethrows non-unique create and update errors unchanged", async () => {
    const createError = new Error("create failed");
    const updateError = new Error("update failed");
    prisma.department.findFirst.mockResolvedValue(null);
    prisma.department.create.mockRejectedValue(createError);
    await expect(service.create(testUser(), { name: "Front", shortCode: "FO", colourHex: "#FFFFFF" })).rejects.toBe(createError);

    prisma.department.findFirstOrThrow.mockResolvedValue({ id: "department-1" });
    prisma.department.update.mockRejectedValue(updateError);
    await expect(service.update(testUser(), "department-1", { name: "Front" })).rejects.toBe(updateError);
  });
});

function uniqueError(target?: string[] | string) {
  return new Prisma.PrismaClientKnownRequestError("Unique failed", {
    code: "P2002",
    clientVersion: "test",
    meta: target === undefined ? undefined : { target }
  });
}
