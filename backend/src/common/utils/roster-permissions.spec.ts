import { ForbiddenException } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { testUser } from "../../../test/test-utils";
import { assertManagerCanEditTargetDate, assertManagerCanEditTargetDates } from "./roster-permissions";

describe("roster permission utils", () => {
  it("allows admins to edit past dates", () => {
    expect(() => assertManagerCanEditTargetDate(testUser({ role: UserRole.ADMIN }), "2000-01-01", "Asia/Tashkent")).not.toThrow();
  });

  it("allows roster managers to edit current or future dates", () => {
    expect(() => assertManagerCanEditTargetDates(testUser({ role: UserRole.ROSTER_MANAGER }), ["2999-01-01"], "Asia/Tashkent")).not.toThrow();
  });

  it("blocks roster managers from editing past dates", () => {
    expect(() => assertManagerCanEditTargetDates(testUser({ role: UserRole.ROSTER_MANAGER }), ["2000-01-01"], "Asia/Tashkent", "startAt")).toThrow(
      ForbiddenException
    );
  });
});
