import { testUser } from "../../test/test-utils";
import { DepartmentsController } from "./departments.controller";

describe("DepartmentsController", () => {
  let departmentsService: Record<string, jest.Mock>;
  let controller: DepartmentsController;

  beforeEach(() => {
    departmentsService = {
      list: jest.fn(() => "list"),
      get: jest.fn(() => "get"),
      create: jest.fn(() => "create"),
      reorder: jest.fn(() => "reorder"),
      update: jest.fn(() => "update"),
      deactivate: jest.fn(() => "deactivate"),
      restore: jest.fn(() => "restore")
    };
    controller = new DepartmentsController(departmentsService as any);
  });

  it("delegates department routes to DepartmentsService", () => {
    const user = testUser();
    const createDto = { name: "Front Office", shortCode: "FO", colourHex: "#FFFFFF" };
    const updateDto = { name: "Rooms" };

    expect(controller.list(user)).toBe("list");
    expect(controller.list(user, "all")).toBe("list");
    expect(controller.get(user, "department-1")).toBe("get");
    expect(controller.create(user, createDto)).toBe("create");
    expect(controller.reorder(user, { departmentIds: ["department-2", "department-1"] })).toBe("reorder");
    expect(controller.update(user, "department-1", updateDto)).toBe("update");
    expect(controller.deactivate(user, "department-1")).toBe("deactivate");
    expect(controller.restore(user, "department-1")).toBe("restore");
    expect(departmentsService.list).toHaveBeenNthCalledWith(1, "org-1", "active");
    expect(departmentsService.list).toHaveBeenNthCalledWith(2, "org-1", "all");
    expect(departmentsService.get).toHaveBeenCalledWith("org-1", "department-1");
    expect(departmentsService.create).toHaveBeenCalledWith(user, createDto);
    expect(departmentsService.reorder).toHaveBeenCalledWith(user, ["department-2", "department-1"]);
    expect(departmentsService.update).toHaveBeenCalledWith(user, "department-1", updateDto);
    expect(departmentsService.deactivate).toHaveBeenCalledWith(user, "department-1");
    expect(departmentsService.restore).toHaveBeenCalledWith(user, "department-1");
  });
});
