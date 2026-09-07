import { Reflector } from "@nestjs/core";
import { UserRole } from "@prisma/client";
import { createHttpContext, testUser } from "../../../test/test-utils";
import { RolesGuard } from "./roles.guard";

describe("RolesGuard", () => {
  const reflector = { getAllAndOverride: jest.fn() } as unknown as jest.Mocked<Reflector>;
  let guard: RolesGuard;

  beforeEach(() => {
    jest.clearAllMocks();
    guard = new RolesGuard(reflector);
  });

  it("allows routes without role metadata", () => {
    reflector.getAllAndOverride.mockReturnValue([]);

    expect(guard.canActivate(createHttpContext())).toBe(true);
  });

  it("treats missing role metadata as public", () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);

    expect(guard.canActivate(createHttpContext())).toBe(true);
  });

  it("rejects authenticated requests without a user", () => {
    reflector.getAllAndOverride.mockReturnValue([UserRole.ADMIN]);

    expect(guard.canActivate(createHttpContext())).toBe(false);
  });

  it("allows super admins through every role check", () => {
    reflector.getAllAndOverride.mockReturnValue([UserRole.ADMIN]);

    expect(guard.canActivate(createHttpContext(testUser({ role: UserRole.VIEWER, isSuperAdmin: true })))).toBe(true);
  });

  it("uses role hierarchy for ordinary users", () => {
    reflector.getAllAndOverride.mockReturnValue([UserRole.ROSTER_MANAGER]);

    expect(guard.canActivate(createHttpContext(testUser({ role: UserRole.ADMIN })))).toBe(true);
    expect(guard.canActivate(createHttpContext(testUser({ role: UserRole.VIEWER })))).toBe(false);
  });
});
