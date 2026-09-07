import { testUser } from "../../test/test-utils";
import { EmployeesController } from "./employees.controller";

describe("EmployeesController", () => {
  let employeesService: Record<string, jest.Mock>;
  let controller: EmployeesController;

  beforeEach(() => {
    employeesService = {
      list: jest.fn(() => "list"),
      get: jest.fn(() => "get"),
      create: jest.fn(() => "create"),
      reorder: jest.fn(() => "reorder"),
      update: jest.fn(() => "update"),
      deactivate: jest.fn(() => "deactivate"),
      restore: jest.fn(() => "restore")
    };
    controller = new EmployeesController(employeesService as any);
  });

  it("delegates employee routes to EmployeesService", () => {
    const user = testUser();
    const createDto = { firstName: "Ada", lastName: "Lovelace", employeeNumber: "1" };
    const updateDto = { preferredName: "Ada" };

    expect(controller.list(user)).toBe("list");
    expect(controller.list(user, "all", "ada")).toBe("list");
    expect(controller.get(user, "employee-1")).toBe("get");
    expect(controller.create(user, createDto as any)).toBe("create");
    expect(controller.reorder(user, { employeeIds: ["employee-2", "employee-1"] })).toBe("reorder");
    expect(controller.update(user, "employee-1", updateDto)).toBe("update");
    expect(controller.deactivate(user, "employee-1")).toBe("deactivate");
    expect(controller.restore(user, "employee-1")).toBe("restore");
    expect(employeesService.list).toHaveBeenNthCalledWith(1, "org-1", "active", undefined);
    expect(employeesService.list).toHaveBeenNthCalledWith(2, "org-1", "all", "ada");
    expect(employeesService.get).toHaveBeenCalledWith("org-1", "employee-1");
    expect(employeesService.create).toHaveBeenCalledWith(user, createDto);
    expect(employeesService.reorder).toHaveBeenCalledWith(user, ["employee-2", "employee-1"]);
    expect(employeesService.update).toHaveBeenCalledWith(user, "employee-1", updateDto);
    expect(employeesService.deactivate).toHaveBeenCalledWith(user, "employee-1");
    expect(employeesService.restore).toHaveBeenCalledWith(user, "employee-1");
  });
});
