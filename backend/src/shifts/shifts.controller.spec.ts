import { testUser } from "../../test/test-utils";
import { ShiftsController } from "./shifts.controller";

describe("ShiftsController", () => {
  it("delegates shift routes to ShiftsService", () => {
    const shiftsService = {
      get: jest.fn(() => "get"),
      checkOverlap: jest.fn(() => "overlap"),
      create: jest.fn(() => "create"),
      update: jest.fn(() => "update"),
      cancel: jest.fn(() => "cancel")
    };
    const controller = new ShiftsController(shiftsService as any);
    const user = testUser();
    const rangeDto = { employeeId: "employee-1", startAt: "2026-08-20T08:00:00.000Z", endAt: "2026-08-20T12:00:00.000Z" };

    expect(controller.get(user, "shift-1")).toBe("get");
    expect(controller.checkOverlap(user, rangeDto)).toBe("overlap");
    expect(controller.create(user, { ...rangeDto, departmentId: "department-1" })).toBe("create");
    expect(controller.update(user, "shift-1", { version: 1 })).toBe("update");
    expect(controller.delete(user, "shift-1")).toBe("cancel");
    expect(shiftsService.get).toHaveBeenCalledWith("org-1", "shift-1");
    expect(shiftsService.checkOverlap).toHaveBeenCalledWith("org-1", rangeDto);
    expect(shiftsService.create).toHaveBeenCalledWith(user, { ...rangeDto, departmentId: "department-1" });
    expect(shiftsService.update).toHaveBeenCalledWith(user, "shift-1", { version: 1 });
    expect(shiftsService.cancel).toHaveBeenCalledWith(user, "shift-1");
  });
});
