import { testUser } from "../../test/test-utils";
import { AuthController } from "./auth.controller";

describe("AuthController", () => {
  let authService: {
    login: jest.Mock;
    refresh: jest.Mock;
    me: jest.Mock;
    getOrganisations: jest.Mock;
    switchOrganisation: jest.Mock;
  };
  let controller: AuthController;

  beforeEach(() => {
    authService = {
      login: jest.fn(() => "login"),
      refresh: jest.fn(() => "refresh"),
      me: jest.fn(() => "me"),
      getOrganisations: jest.fn(() => "organisations"),
      switchOrganisation: jest.fn(() => "switch")
    };
    controller = new AuthController(authService as any);
  });

  it("delegates auth endpoints to AuthService", () => {
    const user = testUser();
    const loginDto = { email: "user@example.com", password: "password123" };

    expect(controller.login(loginDto)).toBe("login");
    expect(controller.refresh({ refreshToken: "refresh-token" })).toBe("refresh");
    expect(controller.logout()).toEqual({ ok: true });
    expect(controller.me(user)).toBe("me");
    expect(controller.getOrganisations(user)).toBe("organisations");
    expect(controller.switchOrganisation(user, { organisationId: "org-2" })).toBe("switch");
    expect(authService.login).toHaveBeenCalledWith(loginDto);
    expect(authService.refresh).toHaveBeenCalledWith("refresh-token");
    expect(authService.me).toHaveBeenCalledWith("user-1", "org-1");
    expect(authService.getOrganisations).toHaveBeenCalledWith("user-1");
    expect(authService.switchOrganisation).toHaveBeenCalledWith(user, "org-2");
  });
});
