import { createPrismaMock, testUser } from "../../test/test-utils";
import { EmployeesService } from "./employees.service";

describe("EmployeesService", () => {
  let prisma: ReturnType<typeof createPrismaMock>;
  let auditService: { record: jest.Mock };
  let tenantEntityService: { ensureActiveDepartment: jest.Mock };
  let service: EmployeesService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = createPrismaMock();
    auditService = { record: jest.fn() };
    tenantEntityService = { ensureActiveDepartment: jest.fn() };
    service = new EmployeesService(prisma, auditService as any, tenantEntityService as any);
  });

  it("lists active employees with optional search filters and sorted response", async () => {
    prisma.employee.findMany.mockResolvedValue([
      employee({ id: "employee-2", firstName: "Zoe", displayOrder: 2, primaryDepartment: { displayOrder: 2, name: "B" } }),
      employee({ id: "employee-1", firstName: "Ada", displayOrder: 1, primaryDepartment: { displayOrder: 1, name: "A" } })
    ]);

    const result = await service.list("org-1", "active", "ada");

    expect(result.map((item) => item.id)).toEqual(["employee-1", "employee-2"]);
    expect(prisma.employee.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          organisationId: "org-1",
          isActive: true,
          deletedAt: null,
          OR: expect.any(Array)
        })
      })
    );
  });

  it("lists inactive and all employees with matching filters", async () => {
    prisma.employee.findMany.mockResolvedValue([]);

    await service.list("org-1", "inactive");
    await service.list("org-1", "all");

    expect(prisma.employee.findMany).toHaveBeenNthCalledWith(1, expect.objectContaining({ where: { organisationId: "org-1", isActive: false } }));
    expect(prisma.employee.findMany).toHaveBeenNthCalledWith(2, expect.objectContaining({ where: { organisationId: "org-1" } }));
  });

  it("gets an employee by tenant id", async () => {
    prisma.employee.findFirstOrThrow.mockResolvedValue(employee());

    await service.get("org-1", "employee-1");

    expect(prisma.employee.findFirstOrThrow).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "employee-1", organisationId: "org-1" } }));
  });

  it("creates employees with trimmed scalar fields and next display order", async () => {
    prisma.employee.findFirst.mockResolvedValue({ displayOrder: 5 });
    prisma.employee.create.mockResolvedValue(employee({ id: "employee-new", firstName: "Alice" }));

    await service.create(testUser(), {
      employeeNumber: " 7 ",
      firstName: " Alice ",
      lastName: " Smith ",
      preferredName: " ",
      phone: " 123 ",
      email: " alice@example.com ",
      employmentType: " Full Time ",
      startDate: "2026-08-01",
      endDate: "2026-08-31",
      primaryDepartmentId: "department-1"
    });

    expect(tenantEntityService.ensureActiveDepartment).toHaveBeenCalledWith("org-1", "department-1", "primaryDepartmentId", expect.any(String));
    expect(prisma.employee.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          employeeNumber: "7",
          firstName: "Alice",
          lastName: "Smith",
          preferredName: null,
          phone: "123",
          email: "alice@example.com",
          employmentType: "Full Time",
          startDate: new Date("2026-08-01"),
          endDate: new Date("2026-08-31"),
          primaryDepartmentId: "department-1",
          displayOrder: 6
        })
      })
    );
    expect(auditService.record).toHaveBeenCalledWith(expect.objectContaining({ action: "EMPLOYEE_CREATED" }));
  });

  it("skips primary department validation when no department is set", async () => {
    prisma.employee.findFirst.mockResolvedValue(null);
    prisma.employee.create.mockResolvedValue(employee());

    await service.create(testUser(), { firstName: "Alice", primaryDepartmentId: null });

    expect(tenantEntityService.ensureActiveDepartment).not.toHaveBeenCalled();
  });

  it("updates employees and preserves omitted scalar fields as undefined", async () => {
    prisma.employee.findFirstOrThrow.mockResolvedValue(employee());
    prisma.employee.update.mockResolvedValue(employee({ firstName: "New" }));

    await service.update(testUser(), "employee-1", { firstName: " New ", primaryDepartmentId: "" });

    expect(prisma.employee.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "employee-1" },
        data: expect.objectContaining({ firstName: "New", primaryDepartmentId: null })
      })
    );
    expect(auditService.record).toHaveBeenCalledWith(expect.objectContaining({ action: "EMPLOYEE_UPDATED" }));
  });

  it("converts optional date and department omissions to undefined on update", async () => {
    prisma.employee.findFirstOrThrow.mockResolvedValue(employee());
    prisma.employee.update.mockResolvedValue(employee());

    await service.update(testUser(), "employee-1", { firstName: undefined, startDate: undefined, endDate: undefined, primaryDepartmentId: undefined });

    expect(prisma.employee.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          firstName: undefined,
          startDate: undefined,
          endDate: undefined,
          primaryDepartmentId: undefined
        })
      })
    );
  });

  it("deactivates and restores employees", async () => {
    prisma.employee.findFirstOrThrow.mockResolvedValue(employee());
    prisma.employee.update.mockResolvedValue(employee());

    await service.deactivate(testUser(), "employee-1");
    await service.restore(testUser(), "employee-1");

    expect(prisma.employee.update).toHaveBeenNthCalledWith(1, expect.objectContaining({ data: { isActive: false, deletedAt: expect.any(Date) } }));
    expect(prisma.employee.update).toHaveBeenNthCalledWith(2, expect.objectContaining({ data: { isActive: true, deletedAt: null } }));
  });

  it("reorders employees and returns all employees", async () => {
    prisma.employee.updateMany.mockResolvedValue({ count: 1 });
    prisma.employee.findMany.mockResolvedValue([employee({ id: "employee-2" }), employee({ id: "employee-1" })]);

    const result = await service.reorder(testUser(), ["employee-2", "employee-1"]);

    expect(result.map((item) => item.id)).toEqual(["employee-2", "employee-1"]);
    expect(auditService.record).toHaveBeenCalledWith(expect.objectContaining({ action: "EMPLOYEES_REORDERED" }));
  });
});

function employee(overrides: Record<string, unknown> = {}) {
  return {
    id: "employee-1",
    organisationId: "org-1",
    employeeNumber: "1",
    firstName: "Ada",
    lastName: "Lovelace",
    preferredName: null,
    phone: null,
    email: null,
    employmentType: null,
    startDate: null,
    endDate: null,
    primaryDepartmentId: "department-1",
    displayOrder: 1,
    isActive: true,
    deletedAt: null,
    rdoBalanceBroughtForward: 0,
    primaryDepartment: {
      id: "department-1",
      name: "Front Office",
      shortCode: "FO",
      colourHex: "#FFFFFF",
      displayOrder: 1
    },
    ...overrides
  };
}
