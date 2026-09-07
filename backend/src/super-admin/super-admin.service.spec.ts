import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { createPrismaMock, testUser } from "../../test/test-utils";
import { SuperAdminService } from "./super-admin.service";

describe("SuperAdminService", () => {
  let prisma: ReturnType<typeof createPrismaMock>;
  let userProvisioningService: {
    createUserWithMembershipInTransaction: jest.Mock;
    upsertMembershipWithDetails: jest.Mock;
    throwFriendlyUniqueUserError: jest.Mock;
    normaliseOptionalUsername: jest.Mock;
    hashPassword: jest.Mock;
  };
  let service: SuperAdminService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = createPrismaMock();
    userProvisioningService = {
      createUserWithMembershipInTransaction: jest.fn(),
      upsertMembershipWithDetails: jest.fn(),
      throwFriendlyUniqueUserError: jest.fn(),
      normaliseOptionalUsername: jest.fn((value) => value?.trim().toLowerCase() || null),
      hashPassword: jest.fn(async () => "hashed-password")
    };
    service = new SuperAdminService(prisma, userProvisioningService as any);
  });

  it("lists organisations with stats", async () => {
    prisma.organisation.findMany.mockResolvedValue([{ ...organisation(), _count: { users: 1, employees: 2, departments: 3, shifts: 4 } }]);

    await expect(service.listOrganisations()).resolves.toEqual([
      expect.objectContaining({ id: "org-1", stats: { usersCount: 1, employeesCount: 2, departmentsCount: 3, shiftsCount: 4 } })
    ]);
  });

  it("lists tenant users with primary organisation and active memberships", async () => {
    prisma.user.findMany.mockResolvedValue([
      {
        ...user(),
        organisation: organisation(),
        memberships: [{ organisation: organisation({ id: "org-2", code: "0002" }), role: UserRole.VIEWER, isActive: true }]
      }
    ]);

    await expect(service.listUsers()).resolves.toEqual([
      expect.objectContaining({ primaryOrganisation: organisation(), memberships: [expect.objectContaining({ role: UserRole.VIEWER })] })
    ]);
  });

  it("creates an organisation without requiring an admin", async () => {
    prisma.organisation.findMany.mockResolvedValue([{ code: "0001" }, { code: "0003" }]);
    prisma.organisation.create.mockResolvedValue(organisation({ id: "org-new", code: "0002", name: "New", weekStartDay: 2 }));

    const result = await service.createOrganisation({ name: " New ", timezone: " Asia/Tashkent ", weekStartDay: 2 });

    expect(result).toEqual({
      organisation: { id: "org-new", code: "0002", name: "New", timezone: "Asia/Tashkent", weekStartDay: 2 },
      adminUser: null
    });
    expect(userProvisioningService.createUserWithMembershipInTransaction).not.toHaveBeenCalled();
  });

  it("creates an organisation with an initial admin when full admin details are provided", async () => {
    prisma.organisation.findUnique.mockResolvedValue(null);
    prisma.organisation.create.mockResolvedValue(organisation({ id: "org-new", code: "1234" }));
    userProvisioningService.createUserWithMembershipInTransaction.mockResolvedValue({ id: "admin-1", email: "admin@example.com", name: "Admin", role: UserRole.ADMIN });

    const result = await service.createOrganisation({
      code: "1234",
      name: "Property",
      timezone: "Asia/Tashkent",
      adminName: " Admin ",
      adminEmail: " admin@example.com ",
      adminPassword: "password123"
    });

    expect(result.adminUser).toMatchObject({ id: "admin-1", role: UserRole.ADMIN });
    expect(userProvisioningService.createUserWithMembershipInTransaction).toHaveBeenCalledWith(expect.any(Object), expect.objectContaining({ role: UserRole.ADMIN }));
  });

  it("rejects partial admin details and duplicate organisation codes", async () => {
    await expect(service.createOrganisation({ name: "Property", timezone: "Asia/Tashkent", adminName: "Admin" })).rejects.toBeInstanceOf(BadRequestException);

    prisma.organisation.findUnique.mockResolvedValue(organisation());
    await expect(service.createOrganisation({ code: "0001", name: "Property", timezone: "Asia/Tashkent" })).rejects.toBeInstanceOf(ConflictException);
  });

  it("updates organisation codes after checking uniqueness", async () => {
    prisma.organisation.findUnique.mockResolvedValue(organisation());
    prisma.organisation.findFirst.mockResolvedValue(null);
    prisma.organisation.update.mockResolvedValue(organisation({ code: "1234" }));

    await service.updateOrganisationCode("org-1", { code: " 1234 " });

    expect(prisma.organisation.update).toHaveBeenCalledWith(expect.objectContaining({ data: { code: "1234" } }));
  });

  it("rejects missing or duplicate organisation code updates", async () => {
    prisma.organisation.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(organisation());
    await expect(service.updateOrganisationCode("missing", { code: "0002" })).rejects.toBeInstanceOf(NotFoundException);

    prisma.organisation.findFirst.mockResolvedValue(organisation({ id: "other" }));
    await expect(service.updateOrganisationCode("org-1", { code: "0002" })).rejects.toBeInstanceOf(ConflictException);
  });

  it("creates property admins for existing properties and maps duplicate errors", async () => {
    prisma.organisation.findUnique.mockResolvedValue(organisation());
    userProvisioningService.createUserWithMembershipInTransaction.mockResolvedValue({ id: "admin-1", name: "Admin", username: "admin", email: "admin@example.com", role: UserRole.ADMIN });

    await expect(service.createAdmin({ organisationId: "org-1", name: "Admin", email: "admin@example.com", password: "password123" })).resolves.toMatchObject({
      id: "admin-1",
      organisation: { id: "org-1", code: "0001", name: "Property" }
    });

    prisma.organisation.findUnique.mockResolvedValue(null);
    await expect(service.createAdmin({ organisationId: "missing", name: "Admin", email: "admin@example.com", password: "password123" })).rejects.toBeInstanceOf(NotFoundException);
  });

  it("delegates friendly duplicate user errors when creating property admins", async () => {
    const error = new Error("duplicate admin");
    prisma.organisation.findUnique.mockResolvedValue(organisation());
    userProvisioningService.createUserWithMembershipInTransaction.mockRejectedValue(error);

    await expect(service.createAdmin({ organisationId: "org-1", name: "Admin", email: "admin@example.com", password: "password123" })).rejects.toBe(error);
    expect(userProvisioningService.throwFriendlyUniqueUserError).toHaveBeenCalledWith(error, "this property");
  });

  it("creates memberships after checking target identity conflicts", async () => {
    prisma.user.findUnique.mockResolvedValue(user());
    prisma.organisation.findUnique.mockResolvedValue(organisation({ id: "org-2" }));
    prisma.user.findFirst.mockResolvedValue(null);
    userProvisioningService.upsertMembershipWithDetails.mockResolvedValue({ id: "membership-1" });

    await expect(service.createMembership({ userId: "user-1", organisationId: "org-2", role: UserRole.VIEWER })).resolves.toEqual({ id: "membership-1" });
  });

  it("creates memberships for users without usernames", async () => {
    prisma.user.findUnique.mockResolvedValue(user({ username: null }));
    prisma.organisation.findUnique.mockResolvedValue(organisation({ id: "org-2" }));
    prisma.user.findFirst.mockResolvedValue(null);
    userProvisioningService.upsertMembershipWithDetails.mockResolvedValue({ id: "membership-1" });

    await service.createMembership({ userId: "user-1", organisationId: "org-2", role: UserRole.ADMIN });

    expect(prisma.user.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ OR: [{ email: "user@example.com" }] }) }));
  });

  it("rejects memberships for missing users, missing orgs, or duplicate target identities", async () => {
    prisma.user.findUnique.mockResolvedValueOnce(null);
    await expect(service.createMembership({ userId: "missing", organisationId: "org-2", role: UserRole.VIEWER })).rejects.toBeInstanceOf(NotFoundException);

    prisma.user.findUnique.mockResolvedValue(user());
    prisma.organisation.findUnique.mockResolvedValueOnce(null);
    await expect(service.createMembership({ userId: "user-1", organisationId: "missing", role: UserRole.VIEWER })).rejects.toBeInstanceOf(NotFoundException);

    prisma.organisation.findUnique.mockResolvedValue(organisation({ id: "org-2" }));
    prisma.user.findFirst.mockResolvedValue({ ...user({ id: "other" }), organisation: organisation({ code: "0001", name: "One" }) });
    await expect(service.createMembership({ userId: "user-1", organisationId: "org-2", role: UserRole.VIEWER })).rejects.toBeInstanceOf(ConflictException);
  });

  it("reports username-only target identity conflicts", async () => {
    prisma.user.findUnique.mockResolvedValue(user({ email: "source@example.com", username: "shared" }));
    prisma.organisation.findUnique.mockResolvedValue(organisation({ id: "org-2", code: "0002", name: "Two" }));
    prisma.user.findFirst.mockResolvedValue({ ...user({ id: "other", email: "other@example.com", username: "shared" }), organisation: organisation({ code: "0001", name: "One" }) });

    await expect(service.createMembership({ userId: "user-1", organisationId: "org-2", role: UserRole.VIEWER })).rejects.toBeInstanceOf(ConflictException);
  });

  it("reports email-only target identity conflicts", async () => {
    prisma.user.findUnique.mockResolvedValue(user({ email: "shared@example.com", username: "source" }));
    prisma.organisation.findUnique.mockResolvedValue(organisation({ id: "org-2", code: "0002", name: "Two" }));
    prisma.user.findFirst.mockResolvedValue({ ...user({ id: "other", email: "shared@example.com", username: "other" }), organisation: organisation({ code: "0001", name: "One" }) });

    await expect(service.createMembership({ userId: "user-1", organisationId: "org-2", role: UserRole.VIEWER })).rejects.toBeInstanceOf(ConflictException);
  });

  it("permanently deletes departments and employees with dependent records", async () => {
    prisma.department.findUnique.mockResolvedValue({ id: "department-1", organisationId: "org-1", name: "Front", shortCode: "FO" });
    prisma.shift.deleteMany.mockResolvedValue({ count: 2 });
    prisma.validationRule.deleteMany.mockResolvedValue({ count: 1 });
    prisma.employee.updateMany.mockResolvedValue({ count: 3 });
    prisma.department.delete.mockResolvedValue({});

    await expect(service.deleteDepartment("department-1")).resolves.toMatchObject({ deleted: { shiftsCount: 2, validationRulesCount: 1 } });

    prisma.employee.findUnique.mockResolvedValue({ id: "employee-1", organisationId: "org-1", firstName: "Ada", lastName: "Lovelace", preferredName: null, employeeNumber: "1" });
    prisma.dayMarker.deleteMany.mockResolvedValue({ count: 1 });
    prisma.employee.delete.mockResolvedValue({});

    await expect(service.deleteEmployee("employee-1")).resolves.toMatchObject({ deleted: { shiftsCount: 2, dayMarkersCount: 1, name: "Ada Lovelace" } });
  });

  it("rejects hard deletes for missing department or employee", async () => {
    prisma.department.findUnique.mockResolvedValue(null);
    await expect(service.deleteDepartment("missing")).rejects.toBeInstanceOf(NotFoundException);

    prisma.employee.findUnique.mockResolvedValue(null);
    await expect(service.deleteEmployee("missing")).rejects.toBeInstanceOf(NotFoundException);
  });

  it("deletes organisations unless active or owning a super admin", async () => {
    prisma.organisation.findUnique.mockResolvedValue({ ...organisation(), _count: { users: 1, employees: 2, departments: 3, shifts: 4 } });
    prisma.user.findFirst.mockResolvedValue(null);
    prisma.user.findMany.mockResolvedValue([{ id: "user-2" }]);
    prisma.organisation.delete.mockResolvedValue({});

    await expect(service.deleteOrganisation(testUser({ organisationId: "org-active" }), "org-1")).resolves.toMatchObject({ ok: true, deleted: { id: "org-1" } });

    prisma.organisation.findUnique.mockResolvedValue(null);
    await expect(service.deleteOrganisation(testUser({ organisationId: "org-active" }), "missing")).rejects.toBeInstanceOf(NotFoundException);

    prisma.organisation.findUnique.mockResolvedValue({ ...organisation(), _count: { users: 1, employees: 2, departments: 3, shifts: 4 } });
    await expect(service.deleteOrganisation(testUser({ organisationId: "org-1" }), "org-1")).rejects.toBeInstanceOf(BadRequestException);
    prisma.user.findFirst.mockResolvedValue({ id: "super-1", email: "root@example.com" });
    await expect(service.deleteOrganisation(testUser({ organisationId: "org-active" }), "org-1")).rejects.toBeInstanceOf(BadRequestException);
  });

  it("deletes organisations that have no primary users without rewriting user references", async () => {
    prisma.organisation.findUnique.mockResolvedValue({ ...organisation(), _count: { users: 0, employees: 0, departments: 0, shifts: 0 } });
    prisma.user.findFirst.mockResolvedValue(null);
    prisma.user.findMany.mockResolvedValue([]);
    prisma.organisation.delete.mockResolvedValue({});

    await expect(service.deleteOrganisation(testUser({ organisationId: "org-active" }), "org-1")).resolves.toMatchObject({ ok: true });
    expect(prisma.rosterLock.deleteMany).not.toHaveBeenCalled();
  });

  it("rejects generated organisation codes after all numeric codes are exhausted", async () => {
    prisma.organisation.findMany.mockResolvedValue(Array.from({ length: 9999 }, (_item, index) => ({ code: String(index + 1).padStart(4, "0") })));

    await expect(service.createOrganisation({ name: "Overflow", timezone: "Asia/Tashkent" })).rejects.toBeInstanceOf(BadRequestException);
  });

  it("deletes users except self and super admin accounts", async () => {
    prisma.user.findUnique.mockResolvedValue({ ...user({ id: "user-2" }), organisation: organisation() });
    prisma.user.delete.mockResolvedValue({});

    await expect(service.deleteUser(testUser(), "user-2")).resolves.toMatchObject({ ok: true, deleted: { id: "user-2" } });

    prisma.user.findUnique.mockResolvedValue(null);
    await expect(service.deleteUser(testUser(), "missing")).rejects.toBeInstanceOf(NotFoundException);

    prisma.user.findUnique.mockResolvedValue(user({ id: "user-1" }));
    await expect(service.deleteUser(testUser(), "user-1")).rejects.toBeInstanceOf(BadRequestException);

    prisma.user.findUnique.mockResolvedValue(user({ id: "super-1", isSuperAdmin: true }));
    await expect(service.deleteUser(testUser(), "super-1")).rejects.toBeInstanceOf(BadRequestException);
  });

  it("updates super admin credentials", async () => {
    prisma.user.findUnique.mockResolvedValue(user({ isSuperAdmin: true }));
    prisma.user.update.mockResolvedValue(user({ username: "root" }));

    await expect(service.updateCredentials({ sub: "user-1" }, { username: " Root ", newPassword: "new-password" })).resolves.toMatchObject({ ok: true });
    expect(prisma.user.update).toHaveBeenCalledWith(expect.objectContaining({ data: { username: "root", passwordHash: "hashed-password" } }));
  });

  it("rejects invalid super admin credential updates", async () => {
    prisma.user.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(user({ isSuperAdmin: true })).mockResolvedValueOnce(user({ isSuperAdmin: true }));
    await expect(service.updateCredentials({ sub: "missing" }, { username: "root" })).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.updateCredentials({ sub: "user-1" }, {})).rejects.toBeInstanceOf(BadRequestException);

    const error = new Error("duplicate");
    prisma.user.update.mockRejectedValue(error);
    await expect(service.updateCredentials({ sub: "user-1" }, { username: "root" })).rejects.toBe(error);
    expect(userProvisioningService.throwFriendlyUniqueUserError).toHaveBeenCalledWith(error, "this property");
  });
});

function organisation(overrides: Record<string, unknown> = {}) {
  return {
    id: "org-1",
    code: "0001",
    name: "Property",
    timezone: "Asia/Tashkent",
    weekStartDay: 1,
    createdAt: new Date("2026-08-01T00:00:00.000Z"),
    ...overrides
  };
}

function user(overrides: Record<string, unknown> = {}) {
  return {
    id: "user-1",
    name: "User",
    username: "user",
    email: "user@example.com",
    role: UserRole.ADMIN,
    isActive: true,
    isSuperAdmin: false,
    organisation: organisation(),
    ...overrides
  };
}
