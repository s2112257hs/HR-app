import { UserRole } from "@prisma/client";
import { testUser } from "../../test/test-utils";
import { UsersController } from "./users.controller";

describe("UsersController", () => {
  it("delegates user routes to UsersService", () => {
    const usersService = {
      list: jest.fn(() => "list"),
      create: jest.fn(() => "create"),
      update: jest.fn(() => "update"),
      setActive: jest.fn(() => "set-active")
    };
    const controller = new UsersController(usersService as any);
    const user = testUser();
    const createDto = { name: "User", email: "user@example.com", password: "password123", role: UserRole.VIEWER };

    expect(controller.list(user)).toBe("list");
    expect(controller.create(user, createDto)).toBe("create");
    expect(controller.update(user, "user-2", { role: UserRole.ADMIN })).toBe("update");
    expect(controller.deactivate(user, "user-2")).toBe("set-active");
    expect(controller.restore(user, "user-2")).toBe("set-active");
    expect(usersService.list).toHaveBeenCalledWith("org-1");
    expect(usersService.create).toHaveBeenCalledWith(user, createDto);
    expect(usersService.update).toHaveBeenCalledWith(user, "user-2", { role: UserRole.ADMIN });
    expect(usersService.setActive).toHaveBeenNthCalledWith(1, user, "user-2", false);
    expect(usersService.setActive).toHaveBeenNthCalledWith(2, user, "user-2", true);
  });
});
