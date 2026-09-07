/* istanbul ignore file */
import { ExecutionContext } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { AuthenticatedUser } from "../src/common/types/authenticated-user";

export const testUser = (overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser => ({
  sub: "user-1",
  organisationId: "org-1",
  orgCode: "0001",
  email: "user@example.com",
  name: "Test User",
  role: UserRole.ADMIN,
  ...overrides
});

export function createPrismaMock(overrides: Record<string, unknown> = {}) {
  const prisma: Record<string, any> = {};
  Object.assign(prisma, {
    $transaction: jest.fn(async (input: unknown): Promise<unknown> => {
      if (typeof input === "function") {
        return input(prisma);
      }
      return Promise.all(input as Promise<unknown>[]);
    }),
    auditLog: methods("create", "findMany", "deleteMany"),
    dayMarker: methods("create", "delete", "deleteMany", "findFirst", "findMany", "findUnique", "update", "updateMany"),
    department: methods("create", "delete", "findFirst", "findFirstOrThrow", "findMany", "findUnique", "update", "updateMany"),
    employee: methods("count", "create", "delete", "findFirst", "findFirstOrThrow", "findMany", "findUnique", "update", "updateMany"),
    organisation: methods("create", "delete", "findFirst", "findMany", "findUnique", "findUniqueOrThrow", "update"),
    rosterLock: methods("delete", "deleteMany", "findUnique", "upsert"),
    shift: methods("count", "create", "deleteMany", "findFirst", "findMany", "update", "updateMany"),
    user: methods("create", "delete", "findFirst", "findFirstOrThrow", "findMany", "findUnique", "findUniqueOrThrow", "update"),
    userMembership: methods("create", "upsert"),
    validationRule: methods("create", "deleteMany", "findFirst", "findMany", "update"),
    ...overrides
  });

  return prisma as any;
}

export function createHttpContext(user?: AuthenticatedUser): ExecutionContext {
  return {
    getHandler: jest.fn(),
    getClass: jest.fn(),
    switchToHttp: jest.fn(() => ({
      getRequest: jest.fn(() => ({ user }))
    }))
  } as unknown as ExecutionContext;
}

function methods(...names: string[]) {
  return Object.fromEntries(names.map((name) => [name, jest.fn()]));
}
