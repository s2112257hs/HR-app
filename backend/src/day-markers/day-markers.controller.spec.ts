import { DayMarkerType } from "@prisma/client";
import { testUser } from "../../test/test-utils";
import { DayMarkersController } from "./day-markers.controller";

describe("DayMarkersController", () => {
  it("delegates day marker routes to DayMarkersService", () => {
    const dayMarkersService = {
      rdoTracker: jest.fn(() => "tracker"),
      set: jest.fn(() => "set"),
      remove: jest.fn(() => "remove")
    };
    const controller = new DayMarkersController(dayMarkersService as any);
    const user = testUser();
    const dto = { employeeId: "employee-1", date: "2026-08-20", type: DayMarkerType.RDO };

    expect(controller.rdoTracker(user, "2026-08-31")).toBe("tracker");
    expect(controller.set(user, dto)).toBe("set");
    expect(controller.remove(user, "marker-1")).toBe("remove");
    expect(dayMarkersService.rdoTracker).toHaveBeenCalledWith("org-1", "2026-08-31");
    expect(dayMarkersService.set).toHaveBeenCalledWith(user, dto);
    expect(dayMarkersService.remove).toHaveBeenCalledWith(user, "marker-1");
  });
});
