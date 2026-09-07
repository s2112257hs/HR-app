import { testUser } from "../../test/test-utils";
import { SettingsController } from "./settings.controller";

describe("SettingsController", () => {
  let settingsService: Record<string, jest.Mock>;
  let controller: SettingsController;

  beforeEach(() => {
    settingsService = {
      get: jest.fn(() => "get"),
      update: jest.fn(() => "update"),
      listRdoBalances: jest.fn(() => "balances"),
      updateRdoBalances: jest.fn(() => "update-balances"),
      listValidationRules: jest.fn(() => "rules"),
      createValidationRule: jest.fn(() => "create-rule"),
      updateValidationRule: jest.fn(() => "update-rule"),
      setValidationRuleActive: jest.fn(() => "toggle-rule")
    };
    controller = new SettingsController(settingsService as any);
  });

  it("delegates settings routes to SettingsService", () => {
    const user = testUser();
    const settingsDto = { rdoTrackingStartDate: "2026-08-01", weekStartDay: 1 };
    const balancesDto = { balances: [{ employeeId: "employee-1", rdoBalanceBroughtForward: 1 }] };
    const ruleDto = { name: "Morning", departmentId: "department-1", startTime: "08:00", endTime: "12:00", minimumStaff: 1 };

    expect(controller.get(user)).toBe("get");
    expect(controller.update(user, settingsDto)).toBe("update");
    expect(controller.listRdoBalances(user)).toBe("balances");
    expect(controller.updateRdoBalances(user, balancesDto)).toBe("update-balances");
    expect(controller.listValidationRules(user)).toBe("rules");
    expect(controller.createValidationRule(user, ruleDto)).toBe("create-rule");
    expect(controller.updateValidationRule(user, "rule-1", { name: "Updated" })).toBe("update-rule");
    expect(controller.deactivateValidationRule(user, "rule-1")).toBe("toggle-rule");
    expect(controller.reactivateValidationRule(user, "rule-1")).toBe("toggle-rule");
    expect(settingsService.get).toHaveBeenCalledWith("org-1");
    expect(settingsService.update).toHaveBeenCalledWith(user, settingsDto);
    expect(settingsService.listRdoBalances).toHaveBeenCalledWith("org-1");
    expect(settingsService.updateRdoBalances).toHaveBeenCalledWith(user, balancesDto);
    expect(settingsService.listValidationRules).toHaveBeenCalledWith("org-1");
    expect(settingsService.createValidationRule).toHaveBeenCalledWith(user, ruleDto);
    expect(settingsService.updateValidationRule).toHaveBeenCalledWith(user, "rule-1", { name: "Updated" });
    expect(settingsService.setValidationRuleActive).toHaveBeenNthCalledWith(1, user, "rule-1", false);
    expect(settingsService.setValidationRuleActive).toHaveBeenNthCalledWith(2, user, "rule-1", true);
  });
});
