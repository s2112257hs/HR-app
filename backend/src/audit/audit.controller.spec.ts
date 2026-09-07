import { testUser } from "../../test/test-utils";
import { AuditController } from "./audit.controller";

describe("AuditController", () => {
  it("lists audit logs for the current organisation", () => {
    const auditService = { list: jest.fn(() => ["event"]) };
    const controller = new AuditController(auditService as any);

    expect(controller.list(testUser())).toEqual(["event"]);
    expect(auditService.list).toHaveBeenCalledWith("org-1");
  });
});
