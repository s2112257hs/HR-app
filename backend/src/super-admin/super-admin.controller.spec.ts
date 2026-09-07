import { UserRole } from "@prisma/client";
import { testUser } from "../../test/test-utils";
import { SuperAdminController } from "./super-admin.controller";

describe("SuperAdminController", () => {
  let superAdminService: Record<string, jest.Mock>;
  let controller: SuperAdminController;

  beforeEach(() => {
    superAdminService = {
      listOrganisations: jest.fn(() => "organisations"),
      listUsers: jest.fn(() => "users"),
      createOrganisation: jest.fn(() => "create-organisation"),
      createAdmin: jest.fn(() => "create-admin"),
      updateOrganisationCode: jest.fn(() => "update-code"),
      deleteOrganisation: jest.fn(() => "delete-organisation"),
      deleteDepartment: jest.fn(() => "delete-department"),
      deleteEmployee: jest.fn(() => "delete-employee"),
      deleteUser: jest.fn(() => "delete-user"),
      createMembership: jest.fn(() => "membership"),
      updateCredentials: jest.fn(() => "credentials")
    };
    controller = new SuperAdminController(superAdminService as any);
  });

  it("delegates super-admin routes to SuperAdminService", () => {
    const user = testUser({ isSuperAdmin: true });
    const organisationDto = { name: "Property", timezone: "Asia/Tashkent" };
    const adminDto = { organisationId: "org-1", name: "Admin", email: "admin@example.com", password: "password123" };
    const membershipDto = { userId: "user-2", organisationId: "org-2", role: UserRole.VIEWER };
    const credentialsDto = { username: "root", newPassword: "new-password" };

    expect(controller.listOrganisations()).toBe("organisations");
    expect(controller.listUsers()).toBe("users");
    expect(controller.createOrganisation(organisationDto)).toBe("create-organisation");
    expect(controller.createAdmin(adminDto)).toBe("create-admin");
    expect(controller.updateOrganisationCode("org-1", { code: "1234" })).toBe("update-code");
    expect(controller.deleteOrganisation(user, "org-1")).toBe("delete-organisation");
    expect(controller.deleteDepartment("department-1")).toBe("delete-department");
    expect(controller.deleteEmployee("employee-1")).toBe("delete-employee");
    expect(controller.deleteUser(user, "user-2")).toBe("delete-user");
    expect(controller.createMembership(membershipDto)).toBe("membership");
    expect(controller.updateCredentials(user, credentialsDto)).toBe("credentials");
    expect(controller.changePassword(user, credentialsDto)).toBe("credentials");
    expect(superAdminService.listOrganisations).toHaveBeenCalledWith();
    expect(superAdminService.listUsers).toHaveBeenCalledWith();
    expect(superAdminService.createOrganisation).toHaveBeenCalledWith(organisationDto);
    expect(superAdminService.createAdmin).toHaveBeenCalledWith(adminDto);
    expect(superAdminService.updateOrganisationCode).toHaveBeenCalledWith("org-1", { code: "1234" });
    expect(superAdminService.deleteOrganisation).toHaveBeenCalledWith(user, "org-1");
    expect(superAdminService.deleteDepartment).toHaveBeenCalledWith("department-1");
    expect(superAdminService.deleteEmployee).toHaveBeenCalledWith("employee-1");
    expect(superAdminService.deleteUser).toHaveBeenCalledWith(user, "user-2");
    expect(superAdminService.createMembership).toHaveBeenCalledWith(membershipDto);
    expect(superAdminService.updateCredentials).toHaveBeenNthCalledWith(1, user, credentialsDto);
    expect(superAdminService.updateCredentials).toHaveBeenNthCalledWith(2, user, credentialsDto);
  });
});
