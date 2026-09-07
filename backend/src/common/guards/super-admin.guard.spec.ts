import { createHttpContext, createPrismaMock, testUser } from "../../../test/test-utils";
import { SuperAdminGuard } from "./super-admin.guard";

describe("SuperAdminGuard", () => {
  let prisma: ReturnType<typeof createPrismaMock>;
  let guard: SuperAdminGuard;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = createPrismaMock();
    guard = new SuperAdminGuard(prisma);
  });

  it("rejects requests without a super admin JWT claim", async () => {
    await expect(guard.canActivate(createHttpContext(testUser({ isSuperAdmin: false })))).resolves.toBe(false);
    expect(prisma.user.findFirst).not.toHaveBeenCalled();
  });

  it("requires the super admin account to still be active in the database", async () => {
    prisma.user.findFirst.mockResolvedValue({ id: "user-1" });

    await expect(guard.canActivate(createHttpContext(testUser({ isSuperAdmin: true })))).resolves.toBe(true);
    expect(prisma.user.findFirst).toHaveBeenCalledWith({
      where: { id: "user-1", isActive: true, isSuperAdmin: true },
      select: { id: true }
    });
  });

  it("rejects stale super admin claims", async () => {
    prisma.user.findFirst.mockResolvedValue(null);

    await expect(guard.canActivate(createHttpContext(testUser({ isSuperAdmin: true })))).resolves.toBe(false);
  });
});
