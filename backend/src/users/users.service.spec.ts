import { BadRequestException } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { createPrismaMock, testUser } from "../../test/test-utils";
import { UsersService } from "./users.service";

describe("UsersService", () => {
  let prisma: ReturnType<typeof createPrismaMock>;
  let auditService: { record: jest.Mock };
  let userProvisioningService: {
    createUserWithMembership: jest.Mock;
    throwFriendlyUniqueUserError: jest.Mock;
    normaliseOptionalUsername: jest.Mock;
    normaliseEmail: jest.Mock;
    hashPassword: jest.Mock;
    upsertMembership: jest.Mock;
  };
  let service: UsersService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = createPrismaMock();
    auditService = { record: jest.fn() };
    userProvisioningService = {
      createUserWithMembership: jest.fn(),
      throwFriendlyUniqueUserError: jest.fn(),
      normaliseOptionalUsername: jest.fn((value) => value?.trim().toLowerCase() || null),
      normaliseEmail: jest.fn((value) => value.trim().toLowerCase()),
      hashPassword: jest.fn(async () => "hashed-password"),
      upsertMembership: jest.fn()
    };
    service = new UsersService(prisma, auditService as any, userProvisioningService as any);
  });

  it("lists users with active membership role for the selected organisation", async () => {
    prisma.user.findMany.mockResolvedValue([
      userWithMembership({
        organisationId: "org-primary",
        role: UserRole.VIEWER,
        memberships: [{ role: UserRole.ADMIN, organisation: { id: "org-1", code: "0001", name: "One" } }]
      })
    ]);

    const users = await service.list("org-1");

    expect(users[0]).toMatchObject({
      role: UserRole.ADMIN,
      primaryOrganisation: { id: "org-primary", code: "000P", name: "Primary" },
      activeOrganisationAccess: { organisation: { id: "org-1", code: "0001", name: "One" }, role: UserRole.ADMIN }
    });
    expect(prisma.user.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ memberships: { some: { organisationId: "org-1", isActive: true } } }) }));
  });

  it("falls back to the base role when a selected membership is absent from the result", async () => {
    prisma.user.findMany.mockResolvedValue([userWithMembership({ memberships: [], role: UserRole.ROSTER_MANAGER })]);

    const users = await service.list("org-1");

    expect(users[0]).toMatchObject({ role: UserRole.ROSTER_MANAGER, activeOrganisationAccess: null });
  });

  it("creates a user only in the signed-in organisation", async () => {
    userProvisioningService.createUserWithMembership.mockResolvedValue({ id: "user-new", role: UserRole.VIEWER });

    await service.create(testUser(), {
      organisationId: "org-1",
      name: "User",
      email: "user@example.com",
      password: "password123",
      role: UserRole.VIEWER
    });

    expect(userProvisioningService.createUserWithMembership).toHaveBeenCalledWith(
      expect.objectContaining({ organisationId: "org-1", email: "user@example.com", role: UserRole.VIEWER })
    );
    expect(auditService.record).toHaveBeenCalledWith(expect.objectContaining({ action: "USER_CREATED" }));
  });

  it("rejects create requests for another organisation", async () => {
    await expect(
      service.create(testUser(), {
        organisationId: "org-2",
        name: "User",
        email: "user@example.com",
        password: "password123",
        role: UserRole.VIEWER
      })
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("delegates friendly unique errors during create", async () => {
    const error = new Error("duplicate");
    userProvisioningService.createUserWithMembership.mockRejectedValue(error);

    await expect(
      service.create(testUser(), {
        name: "User",
        email: "user@example.com",
        password: "password123",
        role: UserRole.VIEWER
      })
    ).rejects.toBe(error);
    expect(userProvisioningService.throwFriendlyUniqueUserError).toHaveBeenCalledWith(error);
  });

  it("updates scalar fields and current-organisation membership role", async () => {
    prisma.user.findFirstOrThrow
      .mockResolvedValueOnce(userWithMembership({ organisationId: "org-primary", role: UserRole.VIEWER }))
      .mockResolvedValueOnce(userWithMembership({ organisationId: "org-primary", role: UserRole.VIEWER, memberships: [{ role: UserRole.ROSTER_MANAGER, organisation: organisation() }] }));
    prisma.user.update.mockResolvedValue({ id: "user-1" });

    const updated = await service.update(testUser(), "user-1", {
      name: " Updated ",
      username: " New.User ",
      email: " New@Example.COM ",
      password: "password123",
      role: UserRole.ROSTER_MANAGER
    });

    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: "user-1" },
      data: {
        name: "Updated",
        username: "new.user",
        email: "new@example.com",
        passwordHash: "hashed-password"
      },
      select: expect.any(Object)
    });
    expect(userProvisioningService.upsertMembership).toHaveBeenCalledWith("user-1", "org-1", UserRole.ROSTER_MANAGER);
    expect(updated.role).toBe(UserRole.ROSTER_MANAGER);
  });

  it("also updates base role when editing the primary organisation account", async () => {
    prisma.user.findFirstOrThrow.mockResolvedValue(userWithMembership({ organisationId: "org-1" }));
    prisma.user.update.mockResolvedValue({ id: "user-1" });

    await service.update(testUser(), "user-1", { role: UserRole.ADMIN });

    expect(prisma.user.update).toHaveBeenCalledWith(expect.objectContaining({ data: { role: UserRole.ADMIN } }));
  });

  it("delegates friendly unique errors during update", async () => {
    const error = new Error("duplicate");
    prisma.user.findFirstOrThrow.mockResolvedValue(userWithMembership());
    prisma.user.update.mockRejectedValue(error);

    await expect(service.update(testUser(), "user-1", { email: "duplicate@example.com" })).rejects.toBe(error);
    expect(userProvisioningService.throwFriendlyUniqueUserError).toHaveBeenCalledWith(error);
  });

  it("sets active state and exposes membership role in the response", async () => {
    prisma.user.findFirstOrThrow.mockResolvedValue(userWithMembership());
    prisma.user.update.mockResolvedValue(userWithMembership({ isActive: false }));

    await service.setActive(testUser(), "user-1", false);
    await service.deactivate(testUser(), "user-1");
    await service.restore(testUser(), "user-1");

    expect(prisma.user.update).toHaveBeenCalledWith(expect.objectContaining({ data: { isActive: false } }));
    expect(auditService.record).toHaveBeenCalledWith(expect.objectContaining({ action: "USER_DEACTIVATED" }));
    expect(auditService.record).toHaveBeenCalledWith(expect.objectContaining({ action: "USER_RESTORED" }));
  });
});

function organisation() {
  return { id: "org-1", code: "0001", name: "One" };
}

function userWithMembership(overrides: Record<string, any> = {}) {
  return {
    id: "user-1",
    organisationId: "org-primary",
    name: "User",
    username: "user",
    email: "user@example.com",
    role: UserRole.VIEWER,
    isActive: true,
    lastLoginAt: null,
    createdAt: new Date("2026-08-01T00:00:00.000Z"),
    updatedAt: new Date("2026-08-01T00:00:00.000Z"),
    memberships: [{ role: UserRole.VIEWER, organisation: organisation() }],
    organisation: { id: "org-primary", code: "000P", name: "Primary" },
    ...overrides
  };
}
