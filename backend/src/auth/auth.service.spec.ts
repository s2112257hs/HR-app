import { ForbiddenException, UnauthorizedException } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import * as bcrypt from "bcryptjs";
import { createPrismaMock, testUser } from "../../test/test-utils";
import { AuthService } from "./auth.service";

jest.mock("bcryptjs", () => ({
  compare: jest.fn()
}));

describe("AuthService", () => {
  let prisma: ReturnType<typeof createPrismaMock>;
  let jwtService: { signAsync: jest.Mock; verifyAsync: jest.Mock };
  let configService: { getOrThrow: jest.Mock };
  let service: AuthService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = createPrismaMock();
    jwtService = {
      signAsync: jest.fn(async (_payload, options) => (options.secret === "access-secret" ? "access-token" : "refresh-token")),
      verifyAsync: jest.fn()
    };
    configService = { getOrThrow: jest.fn((key: string) => (key === "JWT_ACCESS_SECRET" ? "access-secret" : "refresh-secret")) };
    (bcrypt.compare as jest.Mock).mockResolvedValue(true);
    service = new AuthService(prisma, jwtService as any, configService as any);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("rejects empty login identifiers", async () => {
    await expect(service.login({ email: " ", password: "password123" })).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(service.login({ password: "password123" } as any)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("logs in with an organisation code using email or username", async () => {
    prisma.organisation.findUnique.mockResolvedValue(organisation());
    prisma.user.findMany.mockResolvedValue([user({ memberships: [{ organisationId: "org-1", role: UserRole.ROSTER_MANAGER }] })]);
    prisma.user.update.mockResolvedValue({});

    const result = await service.login({ login: " USER@Example.COM ", password: "password123", orgCode: "0001" });

    expect(result).toMatchObject({ accessToken: "access-token", refreshToken: "refresh-token", user: { role: UserRole.ROSTER_MANAGER, orgCode: "0001" } });
    expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: "user-1" }, data: { lastLoginAt: expect.any(Date) } });
  });

  it("rejects login with an unknown organisation code or bad password", async () => {
    prisma.organisation.findUnique.mockResolvedValueOnce(null);
    await expect(service.login({ login: "user@example.com", password: "password123", orgCode: "9999" })).rejects.toBeInstanceOf(UnauthorizedException);

    prisma.organisation.findUnique.mockResolvedValue(organisation());
    prisma.user.findMany.mockResolvedValue([user()]);
    (bcrypt.compare as jest.Mock).mockResolvedValue(false);
    await expect(service.login({ login: "user@example.com", password: "bad", orgCode: "0001" })).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("logs in without an organisation code using the default membership", async () => {
    prisma.user.findMany.mockResolvedValue([
      {
        ...user({ organisationId: "org-primary" }),
        organisation: { id: "org-primary", code: "000P" },
        memberships: [{ organisationId: "org-2", role: UserRole.VIEWER, organisation: { id: "org-2", code: "0002" } }]
      }
    ]);
    prisma.user.update.mockResolvedValue({});

    const result = await service.login({ email: "user@example.com", password: "password123" });

    expect(result.user).toMatchObject({ organisationId: "org-2", role: UserRole.VIEWER });
  });

  it("skips non-matching passwords when logging in without an organisation code", async () => {
    prisma.user.findMany.mockResolvedValue([
      {
        ...user({ id: "user-bad", organisationId: "org-primary" }),
        organisation: { id: "org-primary", code: "000P" },
        memberships: [{ organisationId: "org-primary", role: UserRole.VIEWER, organisation: { id: "org-primary", code: "000P" } }]
      },
      {
        ...user({ id: "user-good", organisationId: "org-primary" }),
        organisation: { id: "org-primary", code: "000P" },
        memberships: [{ organisationId: "org-primary", role: UserRole.ADMIN, organisation: { id: "org-primary", code: "000P" } }]
      }
    ]);
    (bcrypt.compare as jest.Mock).mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    prisma.user.update.mockResolvedValue({});

    const result = await service.login({ email: "user@example.com", password: "password123" });

    expect(result.user).toMatchObject({ id: "user-good", role: UserRole.ADMIN });
  });

  it("uses primary organisation context for super admin login without a code", async () => {
    prisma.user.findMany.mockResolvedValue([
      {
        ...user({ isSuperAdmin: true }),
        organisation: { id: "org-primary", code: "000P" },
        memberships: []
      }
    ]);
    prisma.user.update.mockResolvedValue({});

    const result = await service.login({ email: "root@example.com", password: "password123" });

    expect(result.user).toMatchObject({ organisationId: "org-primary", role: UserRole.ADMIN, isSuperAdmin: true });
  });

  it("rejects login without a default organisation context", async () => {
    prisma.user.findMany.mockResolvedValue([{ ...user(), organisation: organisation(), memberships: [] }]);

    await expect(service.login({ email: "user@example.com", password: "password123" })).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("lists organisations for super admins and normal users", async () => {
    prisma.user.findFirst
      .mockResolvedValueOnce({ ...user({ isSuperAdmin: true }), memberships: [] })
      .mockResolvedValueOnce({ ...user(), memberships: [{ role: UserRole.VIEWER, organisation: organisation({ name: "One" }) }] })
      .mockResolvedValueOnce(null);
    prisma.organisation.findMany.mockResolvedValue([organisation({ id: "org-1", code: "0001" })]);

    await expect(service.getOrganisations("super")).resolves.toEqual([{ id: "org-1", code: "0001", name: "Property", role: UserRole.ADMIN }]);
    await expect(service.getOrganisations("user-1")).resolves.toEqual([{ id: "org-1", code: "0001", name: "One", role: UserRole.VIEWER }]);
    await expect(service.getOrganisations("missing")).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("switches organisation when the active auth context exists", async () => {
    prisma.user.findFirst.mockResolvedValue(user({ memberships: [{ organisationId: "org-2", role: UserRole.ADMIN }] }));
    prisma.organisation.findUnique.mockResolvedValue(organisation({ id: "org-2", code: "0002" }));

    const result = await service.switchOrganisation(testUser(), "org-2");

    expect(result.user).toMatchObject({ organisationId: "org-2", role: UserRole.ADMIN });
  });

  it("allows super admins to switch into any existing organisation", async () => {
    prisma.user.findFirst.mockResolvedValue(user({ isSuperAdmin: true, memberships: [] }));
    prisma.organisation.findUnique.mockResolvedValue(organisation({ id: "org-2", code: "0002" }));

    const result = await service.switchOrganisation(testUser(), "org-2");

    expect(result.user).toMatchObject({ organisationId: "org-2", role: UserRole.ADMIN, isSuperAdmin: true });
  });

  it("rejects organisation switches without active access", async () => {
    prisma.user.findFirst.mockResolvedValue(user({ memberships: [] }));
    prisma.organisation.findUnique.mockResolvedValue(organisation({ id: "org-2" }));

    await expect(service.switchOrganisation(testUser(), "org-2")).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("refreshes tokens or rejects invalid refresh tokens", async () => {
    jwtService.verifyAsync.mockResolvedValue({ sub: "user-1", organisationId: "org-1" });
    prisma.user.findFirst.mockResolvedValue(user({ memberships: [{ organisationId: "org-1", role: UserRole.ADMIN }] }));
    prisma.organisation.findUnique.mockResolvedValue(organisation());

    await expect(service.refresh("refresh-token")).resolves.toMatchObject({ accessToken: "access-token" });

    jwtService.verifyAsync.mockRejectedValue(new Error("bad token"));
    await expect(service.refresh("bad-token")).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("rejects refresh tokens whose active organisation context no longer exists", async () => {
    jwtService.verifyAsync.mockResolvedValue({ sub: "user-1", organisationId: "org-missing" });
    prisma.user.findFirst.mockResolvedValue(user({ memberships: [{ organisationId: "org-missing", role: UserRole.ADMIN }] }));
    prisma.organisation.findUnique.mockResolvedValue(null);

    await expect(service.refresh("refresh-token")).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it("returns current user details or rejects missing context", async () => {
    prisma.user.findFirst.mockResolvedValueOnce(user({ memberships: [{ organisationId: "org-1", role: UserRole.ADMIN }] })).mockResolvedValueOnce(null);
    prisma.organisation.findUnique.mockResolvedValue(organisation());

    await expect(service.me("user-1", "org-1")).resolves.toMatchObject({ id: "user-1", activeOrganisationId: "org-1", role: UserRole.ADMIN });
    await expect(service.me("missing", "org-1")).rejects.toBeInstanceOf(UnauthorizedException);
  });
});

function organisation(overrides: Record<string, unknown> = {}) {
  return {
    id: "org-1",
    code: "0001",
    name: "Property",
    ...overrides
  };
}

function user(overrides: Record<string, unknown> = {}) {
  return {
    id: "user-1",
    organisationId: "org-1",
    name: "User",
    username: "user",
    email: "user@example.com",
    passwordHash: "hashed-password",
    role: UserRole.ADMIN,
    isActive: true,
    isSuperAdmin: false,
    lastLoginAt: null,
    memberships: [{ organisationId: "org-1", role: UserRole.ADMIN }],
    ...overrides
  };
}
