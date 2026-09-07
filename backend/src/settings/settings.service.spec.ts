import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { createPrismaMock, testUser } from "../../test/test-utils";
import { SettingsService } from "./settings.service";

describe("SettingsService", () => {
  let prisma: ReturnType<typeof createPrismaMock>;
  let auditService: { record: jest.Mock };
  let tenantEntityService: { ensureActiveDepartment: jest.Mock };
  let service: SettingsService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = createPrismaMock();
    auditService = { record: jest.fn() };
    tenantEntityService = { ensureActiveDepartment: jest.fn() };
    service = new SettingsService(prisma, auditService as any, tenantEntityService as any);
  });

  it("gets organisation settings as date keys", async () => {
    prisma.organisation.findUniqueOrThrow.mockResolvedValue(organisationSettings());

    await expect(service.get("org-1")).resolves.toEqual({
      id: "org-1",
      name: "Property",
      timezone: "Asia/Tashkent",
      rdoTrackingStartDate: "2026-08-01",
      weekStartDay: 1
    });
  });

  it("updates settings after validating date and week start day", async () => {
    prisma.organisation.findUniqueOrThrow.mockResolvedValue(organisationSettings());
    prisma.organisation.update.mockResolvedValue({ ...organisationSettings(), weekStartDay: 7 });

    const result = await service.update(testUser(), { rdoTrackingStartDate: "2026-08-02", weekStartDay: 7 });

    expect(result.weekStartDay).toBe(7);
    expect(prisma.organisation.update).toHaveBeenCalledWith(expect.objectContaining({ data: { rdoTrackingStartDate: new Date("2026-08-02"), weekStartDay: 7 } }));
    expect(auditService.record).toHaveBeenCalledWith(expect.objectContaining({ action: "SETTINGS_UPDATED" }));
  });

  it("rejects invalid week start days", async () => {
    prisma.organisation.findUniqueOrThrow.mockResolvedValue(organisationSettings());

    await expect(service.update(testUser(), { rdoTrackingStartDate: "2026-08-02", weekStartDay: 8 })).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.update(testUser(), { rdoTrackingStartDate: "2026-08-02", weekStartDay: 0 })).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.update(testUser(), { rdoTrackingStartDate: "2026-08-02", weekStartDay: 1.5 })).rejects.toBeInstanceOf(BadRequestException);
  });

  it("lists and updates RDO balances for active employees only", async () => {
    prisma.employee.findMany
      .mockResolvedValueOnce([employeeForBalance({ rdoBalanceBroughtForward: 2 })])
      .mockResolvedValueOnce([{ id: "employee-1", rdoBalanceBroughtForward: 0 }])
      .mockResolvedValueOnce([employeeForBalance({ rdoBalanceBroughtForward: 3 })]);
    prisma.employee.updateMany.mockResolvedValue({ count: 1 });

    await expect(service.listRdoBalances("org-1")).resolves.toEqual([
      expect.objectContaining({ employeeId: "employee-1", displayName: "Ada Lovelace", rdoBalanceBroughtForward: 2 })
    ]);
    const updated = await service.updateRdoBalances(testUser(), { balances: [{ employeeId: "employee-1", rdoBalanceBroughtForward: 3 }] });

    expect(updated[0].rdoBalanceBroughtForward).toBe(3);
    expect(prisma.$transaction).toHaveBeenCalledWith([expect.any(Promise)]);
    expect(auditService.record).toHaveBeenCalledWith(expect.objectContaining({ action: "RDO_BALANCES_UPDATED" }));
  });

  it("lists RDO balances for employees without a primary department", async () => {
    prisma.employee.findMany.mockResolvedValue([employeeForBalance({ primaryDepartment: null })]);

    await expect(service.listRdoBalances("org-1")).resolves.toEqual([expect.objectContaining({ primaryDepartment: null })]);
  });

  it("rejects RDO balances for missing or inactive employees", async () => {
    prisma.employee.findMany.mockResolvedValue([]);

    await expect(service.updateRdoBalances(testUser(), { balances: [{ employeeId: "missing", rdoBalanceBroughtForward: 1 }] })).rejects.toBeInstanceOf(
      BadRequestException
    );
  });

  it("lists validation rules using response shape", async () => {
    prisma.validationRule.findMany.mockResolvedValue([validationRule()]);

    const rules = await service.listValidationRules("org-1");

    expect(rules[0]).toMatchObject({ id: "rule-1", department: { id: "department-1", isActive: true } });
  });

  it("creates validation rules after department and coexistence validation", async () => {
    prisma.employee.count.mockResolvedValue(2);
    prisma.validationRule.findMany.mockResolvedValue([]);
    prisma.validationRule.create.mockResolvedValue(validationRule({ name: " Breakfast " }));

    const rule = await service.createValidationRule(testUser(), {
      name: " Breakfast ",
      departmentId: "department-1",
      startTime: "07:00",
      endTime: "11:00",
      minimumStaff: 1
    });

    expect(rule.name).toBe(" Breakfast ");
    expect(tenantEntityService.ensureActiveDepartment).toHaveBeenCalledWith("org-1", "department-1");
    expect(auditService.record).toHaveBeenCalledWith(expect.objectContaining({ action: "VALIDATION_RULE_CREATED" }));
  });

  it("rejects invalid validation rule names, times, and impossible combined staffing", async () => {
    await expect(
      service.createValidationRule(testUser(), { name: " ", departmentId: "department-1", startTime: "07:00", endTime: "11:00", minimumStaff: 1 })
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.createValidationRule(testUser(), { name: "Rule", departmentId: "department-1", startTime: "7am", endTime: "11:00", minimumStaff: 1 })
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.createValidationRule(testUser(), { name: "Rule", departmentId: "department-1", startTime: "11:00", endTime: "07:00", minimumStaff: 1 })
    ).rejects.toBeInstanceOf(BadRequestException);

    prisma.employee.count.mockResolvedValue(1);
    prisma.validationRule.findMany.mockResolvedValue([validationRule({ departmentId: "department-2", minimumStaff: 1 })]);
    await expect(
      service.createValidationRule(testUser(), { name: "Rule", departmentId: "department-1", startTime: "07:00", endTime: "11:00", minimumStaff: 1 })
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("updates validation rules and checks active department only when department changes", async () => {
    prisma.validationRule.findFirst.mockResolvedValue(validationRule());
    prisma.employee.count.mockResolvedValue(3);
    prisma.validationRule.findMany.mockResolvedValue([]);
    prisma.validationRule.update.mockResolvedValue(validationRule({ name: "Updated", departmentId: "department-2" }));

    await service.updateValidationRule(testUser(), "rule-1", { name: "Updated", departmentId: "department-2", minimumStaff: 2 });

    expect(tenantEntityService.ensureActiveDepartment).toHaveBeenCalledWith("org-1", "department-2");
    expect(prisma.validationRule.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ name: "Updated", minimumStaff: 2 }) }));
  });

  it("updates validation rules without rechecking department when it is unchanged", async () => {
    prisma.validationRule.findFirst.mockResolvedValue(validationRule());
    prisma.employee.count.mockResolvedValue(3);
    prisma.validationRule.findMany.mockResolvedValue([]);
    prisma.validationRule.update.mockResolvedValue(validationRule({ endTime: "23:59" }));

    await service.updateValidationRule(testUser(), "rule-1", { endTime: "23:59" });

    expect(tenantEntityService.ensureActiveDepartment).not.toHaveBeenCalled();
    expect(prisma.validationRule.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ departmentId: "department-1", endTime: "23:59" }) }));
  });

  it("throws not found when updating or toggling missing validation rules", async () => {
    prisma.validationRule.findFirst.mockResolvedValue(null);

    await expect(service.updateValidationRule(testUser(), "missing", { name: "Nope" })).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.setValidationRuleActive(testUser(), "missing", true)).rejects.toBeInstanceOf(NotFoundException);
  });

  it("deactivates and reactivates validation rules", async () => {
    prisma.validationRule.findFirst.mockResolvedValue(validationRule());
    prisma.validationRule.update.mockResolvedValue(validationRule({ isActive: false }));
    prisma.employee.count.mockResolvedValue(3);
    prisma.validationRule.findMany.mockResolvedValue([]);

    await service.deactivateValidationRule(testUser(), "rule-1");
    await service.reactivateValidationRule(testUser(), "rule-1");

    expect(prisma.validationRule.update).toHaveBeenNthCalledWith(1, expect.objectContaining({ data: { isActive: false } }));
    expect(prisma.validationRule.update).toHaveBeenNthCalledWith(2, expect.objectContaining({ data: { isActive: true } }));
  });

  it("converts duplicate validation rule names to conflicts", async () => {
    prisma.employee.count.mockResolvedValue(3);
    prisma.validationRule.findMany.mockResolvedValue([]);
    prisma.validationRule.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("Unique failed", {
        code: "P2002",
        clientVersion: "test"
      })
    );

    await expect(
      service.createValidationRule(testUser(), { name: "Rule", departmentId: "department-1", startTime: "07:00", endTime: "11:00", minimumStaff: 1 })
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("rethrows non-unique validation rule create errors unchanged", async () => {
    const error = new Error("create failed");
    prisma.employee.count.mockResolvedValue(3);
    prisma.validationRule.findMany.mockResolvedValue([]);
    prisma.validationRule.create.mockRejectedValue(error);

    await expect(
      service.createValidationRule(testUser(), { name: "Rule", departmentId: "department-1", startTime: "07:00", endTime: "11:00", minimumStaff: 1 })
    ).rejects.toBe(error);
  });

  it("maps duplicate validation rule names during updates and rethrows other errors", async () => {
    prisma.validationRule.findFirst.mockResolvedValue(validationRule());
    prisma.employee.count.mockResolvedValue(3);
    prisma.validationRule.findMany.mockResolvedValue([]);
    prisma.validationRule.update.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError("Unique failed", {
        code: "P2002",
        clientVersion: "test"
      })
    );

    await expect(service.updateValidationRule(testUser(), "rule-1", { name: "Duplicate" })).rejects.toBeInstanceOf(ConflictException);

    const error = new Error("database unavailable");
    prisma.validationRule.update.mockRejectedValue(error);
    await expect(service.updateValidationRule(testUser(), "rule-1", { name: "Other" })).rejects.toBe(error);
  });
});

function organisationSettings() {
  return {
    id: "org-1",
    name: "Property",
    timezone: "Asia/Tashkent",
    rdoTrackingStartDate: new Date("2026-08-01T00:00:00.000Z"),
    weekStartDay: 1
  };
}

function employeeForBalance(overrides: Record<string, unknown> = {}) {
  return {
    id: "employee-1",
    firstName: "Ada",
    lastName: "Lovelace",
    preferredName: null,
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

function validationRule(overrides: Record<string, unknown> = {}) {
  return {
    id: "rule-1",
    organisationId: "org-1",
    departmentId: "department-1",
    name: "Breakfast",
    startTime: "07:00",
    endTime: "11:00",
    minimumStaff: 1,
    isActive: true,
    createdAt: new Date("2026-08-01T00:00:00.000Z"),
    updatedAt: new Date("2026-08-01T00:00:00.000Z"),
    department: {
      id: "department-1",
      name: "Front Office",
      shortCode: "FO",
      colourHex: "#FFFFFF",
      isActive: true
    },
    ...overrides
  };
}
