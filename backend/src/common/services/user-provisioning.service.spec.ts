import { ConflictException } from "@nestjs/common";
import { Prisma, UserRole } from "@prisma/client";
import { createPrismaMock } from "../../../test/test-utils";
import { UserProvisioningService } from "./user-provisioning.service";

describe("UserProvisioningService", () => {
  let prisma: ReturnType<typeof createPrismaMock>;
  let service: UserProvisioningService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = createPrismaMock();
    service = new UserProvisioningService(prisma);
  });

  it("normalises email and optional username values", () => {
    expect(service.normaliseEmail(" USER@Example.COM ")).toBe("user@example.com");
    expect(service.normaliseOptionalUsername(undefined)).toBeUndefined();
    expect(service.normaliseOptionalUsername(null)).toBeNull();
    expect(service.normaliseOptionalUsername("  Manager.One ")).toBe("manager.one");
    expect(service.normaliseOptionalUsername("  ")).toBeNull();
  });

  it("creates a user and active membership in one transaction", async () => {
    const tx = createPrismaMock();
    tx.user.create.mockResolvedValue({ id: "user-1", email: "person@example.com", role: UserRole.ADMIN });
    tx.userMembership.create.mockResolvedValue({ id: "membership-1" });

    const user = await service.createUserWithMembershipInTransaction(tx, {
      organisationId: "org-1",
      name: " Person ",
      username: " Person.One ",
      email: " PERSON@Example.COM ",
      password: "password123",
      role: UserRole.ADMIN
    });

    expect(user).toMatchObject({ id: "user-1" });
    expect(tx.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          organisationId: "org-1",
          name: "Person",
          username: "person.one",
          email: "person@example.com",
          role: UserRole.ADMIN,
          isSuperAdmin: false
        })
      })
    );
    expect(tx.userMembership.create).toHaveBeenCalledWith({
      data: { userId: "user-1", organisationId: "org-1", role: UserRole.ADMIN }
    });
  });

  it("wraps user provisioning in a prisma transaction", async () => {
    prisma.user.create.mockResolvedValue({ id: "user-1", email: "person@example.com", role: UserRole.VIEWER });
    prisma.userMembership.create.mockResolvedValue({ id: "membership-1" });

    await service.createUserWithMembership({
      organisationId: "org-1",
      name: "Person",
      email: "person@example.com",
      password: "password123",
      role: UserRole.VIEWER,
      isSuperAdmin: true
    });

    expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function));
    expect(prisma.user.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ isSuperAdmin: true }) }));
  });

  it("upserts active memberships", async () => {
    prisma.userMembership.upsert.mockResolvedValue({ id: "membership-1" });

    await service.upsertMembership("user-1", "org-1", UserRole.ROSTER_MANAGER);

    expect(prisma.userMembership.upsert).toHaveBeenCalledWith({
      where: { userId_organisationId: { userId: "user-1", organisationId: "org-1" } },
      create: { userId: "user-1", organisationId: "org-1", role: UserRole.ROSTER_MANAGER },
      update: { role: UserRole.ROSTER_MANAGER, isActive: true }
    });
  });

  it("adds organisation and user details to membership upsert responses", async () => {
    prisma.userMembership.upsert.mockResolvedValue({ id: "membership-1" });

    await service.upsertMembershipWithDetails("user-1", "org-1", UserRole.VIEWER);

    expect(prisma.userMembership.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        include: {
          organisation: { select: { id: true, code: true, name: true } },
          user: { select: { id: true, email: true, name: true } }
        }
      })
    );
  });

  it("converts duplicate email and username errors into friendly conflicts", () => {
    expect(() =>
      service.throwFriendlyUniqueUserError(
        new Prisma.PrismaClientKnownRequestError("Unique failed", {
          code: "P2002",
          clientVersion: "test",
          meta: { target: ["email"] }
        }),
        "this property"
      )
    ).toThrow(ConflictException);

    expect(() =>
      service.throwFriendlyUniqueUserError(
        new Prisma.PrismaClientKnownRequestError("Unique failed", {
          code: "P2002",
          clientVersion: "test",
          meta: { target: ["username"] }
        })
      )
    ).toThrow(ConflictException);
  });

  it("handles prisma unique target metadata supplied as a string", () => {
    expect(() =>
      service.throwFriendlyUniqueUserError(
        new Prisma.PrismaClientKnownRequestError("Unique failed", {
          code: "P2002",
          clientVersion: "test",
          meta: { target: "username" }
        })
      )
    ).toThrow(ConflictException);
  });

  it("falls back to duplicate email messaging when unique target metadata is absent", () => {
    expect(() =>
      service.throwFriendlyUniqueUserError(
        new Prisma.PrismaClientKnownRequestError("Unique failed", {
          code: "P2002",
          clientVersion: "test"
        })
      )
    ).toThrow(ConflictException);
  });

  it("ignores non-unique prisma errors in friendly error conversion", () => {
    expect(() => service.throwFriendlyUniqueUserError(new Error("Other"))).not.toThrow();
  });
});
