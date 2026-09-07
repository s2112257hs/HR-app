import { DayMarkerType } from "@prisma/client";
import { testUser } from "../../test/test-utils";
import { RosterController } from "./roster.controller";

describe("RosterController", () => {
  let rosterService: Record<string, jest.Mock>;
  let rosterLocksService: Record<string, jest.Mock>;
  let controller: RosterController;

  beforeEach(() => {
    rosterService = {
      daily: jest.fn(() => "daily"),
      weekly: jest.fn(() => "weekly"),
      validateWeekly: jest.fn(() => "validation"),
      overtimeSummary: jest.fn(() => "ot"),
      attendanceSummary: jest.fn(() => "attendance"),
      copyWeeklyCell: jest.fn(() => "copy"),
      clearWeeklyCellsForUser: jest.fn(() => "clear"),
      restoreWeeklyCells: jest.fn(() => "restore")
    };
    rosterLocksService = {
      status: jest.fn(() => "status"),
      acquire: jest.fn(() => "acquire"),
      heartbeat: jest.fn(() => "heartbeat"),
      steal: jest.fn(() => "steal"),
      release: jest.fn(() => "release")
    };
    controller = new RosterController(rosterService as any, rosterLocksService as any);
  });

  it("delegates roster routes and parses alignment query values", () => {
    const user = testUser();
    const copyDto = { employeeId: "employee-1", sourceDate: "2026-08-20", targetStartDate: "2026-08-21", targetEndDate: "2026-08-22" };
    const clearDto = { cells: [{ employeeId: "employee-1", date: "2026-08-20" }] };
    const restoreDto = { cells: [{ employeeId: "employee-1", date: "2026-08-20", marker: { type: DayMarkerType.RDO }, shifts: [] }] };

    expect(controller.daily(user, "2026-08-20")).toBe("daily");
    expect(controller.daily(user, "2026-08-20", "07:00")).toBe("daily");
    expect(controller.weekly(user, "2026-08-20")).toBe("weekly");
    expect(controller.weekly(user, "2026-08-20", "false")).toBe("weekly");
    expect(controller.validateWeekly(user, "2026-08-20")).toBe("validation");
    expect(controller.validateWeekly(user, "2026-08-20", "false")).toBe("validation");
    expect(controller.overtimeSummary(user, "2026-08-01", "2026-08-31")).toBe("ot");
    expect(controller.attendanceSummary(user, "2026-08-01", "2026-08-31")).toBe("attendance");
    expect(controller.copyWeeklyCell(user, copyDto)).toBe("copy");
    expect(controller.clearWeeklyCells(user, clearDto)).toBe("clear");
    expect(controller.restoreWeeklyCells(user, restoreDto as any)).toBe("restore");
    expect(rosterService.daily).toHaveBeenNthCalledWith(1, "org-1", "2026-08-20", "00:00");
    expect(rosterService.daily).toHaveBeenNthCalledWith(2, "org-1", "2026-08-20", "07:00");
    expect(rosterService.weekly).toHaveBeenNthCalledWith(1, "org-1", "2026-08-20", true);
    expect(rosterService.weekly).toHaveBeenNthCalledWith(2, "org-1", "2026-08-20", false);
    expect(rosterService.validateWeekly).toHaveBeenNthCalledWith(1, "org-1", "2026-08-20", true);
    expect(rosterService.validateWeekly).toHaveBeenNthCalledWith(2, "org-1", "2026-08-20", false);
    expect(rosterService.overtimeSummary).toHaveBeenCalledWith("org-1", "2026-08-01", "2026-08-31");
    expect(rosterService.attendanceSummary).toHaveBeenCalledWith("org-1", "2026-08-01", "2026-08-31");
    expect(rosterService.copyWeeklyCell).toHaveBeenCalledWith(user, copyDto);
    expect(rosterService.clearWeeklyCellsForUser).toHaveBeenCalledWith(user, clearDto);
    expect(rosterService.restoreWeeklyCells).toHaveBeenCalledWith(user, restoreDto);
  });

  it("delegates roster lock routes to RosterLocksService", () => {
    const user = testUser();

    expect(controller.lockStatus(user)).toBe("status");
    expect(controller.acquireLock(user)).toBe("acquire");
    expect(controller.heartbeatLock(user)).toBe("heartbeat");
    expect(controller.stealLock(user)).toBe("steal");
    expect(controller.releaseLock(user)).toBe("release");
    expect(rosterLocksService.status).toHaveBeenCalledWith("org-1");
    expect(rosterLocksService.acquire).toHaveBeenCalledWith(user);
    expect(rosterLocksService.heartbeat).toHaveBeenCalledWith(user);
    expect(rosterLocksService.steal).toHaveBeenCalledWith(user);
    expect(rosterLocksService.release).toHaveBeenCalledWith(user);
  });
});
