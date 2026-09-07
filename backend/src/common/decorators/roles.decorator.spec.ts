import "reflect-metadata";
import { UserRole } from "@prisma/client";
import { ROLES_KEY, Roles } from "./roles.decorator";

describe("Roles decorator", () => {
  it("stores required roles as metadata", () => {
    class Example {
      @Roles(UserRole.ADMIN, UserRole.ROSTER_MANAGER)
      handler() {
        return true;
      }
    }

    expect(Reflect.getMetadata(ROLES_KEY, Example.prototype.handler)).toEqual([UserRole.ADMIN, UserRole.ROSTER_MANAGER]);
  });
});
