import { BadRequestException } from "@nestjs/common";
import { createPrismaMock } from "../../../test/test-utils";
import { TenantEntityService } from "./tenant-entity.service";

describe("TenantEntityService", () => {
  let prisma: ReturnType<typeof createPrismaMock>;
  let service: TenantEntityService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = createPrismaMock();
    service = new TenantEntityService(prisma);
  });

  it("allows active employees and departments in the same organisation", async () => {
    prisma.employee.findFirst.mockResolvedValue({ id: "employee-1" });
    prisma.department.findFirst.mockResolvedValue({ id: "department-1" });

    await expect(service.ensureActiveEmployee("org-1", "employee-1")).resolves.toBeUndefined();
    await expect(service.ensureActiveDepartment("org-1", "department-1")).resolves.toBeUndefined();
    await expect(service.ensureActiveEmployeeAndDepartment("org-1", "employee-1", "department-1")).resolves.toBeUndefined();
  });

  it("throws a validation error when an employee is not active in the organisation", async () => {
    prisma.employee.findFirst.mockResolvedValue(null);

    await expect(service.ensureActiveEmployee("org-1", "employee-1", "employeeId", "Employee invalid.")).rejects.toBeInstanceOf(BadRequestException);
  });

  it("throws a validation error when a department is not active in the organisation", async () => {
    prisma.employee.findFirst.mockResolvedValue({ id: "employee-1" });
    prisma.department.findFirst.mockResolvedValue(null);

    await expect(service.ensureActiveEmployeeAndDepartment("org-1", "employee-1", "department-1")).rejects.toBeInstanceOf(BadRequestException);
  });

  it("throws a validation error when a department lookup fails directly", async () => {
    prisma.department.findFirst.mockResolvedValue(null);

    await expect(service.ensureActiveDepartment("org-1", "department-1", "departmentId", "Department invalid.")).rejects.toBeInstanceOf(BadRequestException);
  });

  it("stops combined validation at a missing employee before checking department failure", async () => {
    prisma.employee.findFirst.mockResolvedValue(null);
    prisma.department.findFirst.mockResolvedValue(null);

    await expect(service.ensureActiveEmployeeAndDepartment("org-1", "employee-1", "department-1")).rejects.toBeInstanceOf(BadRequestException);
  });
});
