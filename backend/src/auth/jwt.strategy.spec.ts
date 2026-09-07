import { testUser } from "../../test/test-utils";
import { JwtStrategy } from "./jwt.strategy";

describe("JwtStrategy", () => {
  it("uses configured access secret and returns the JWT payload as the authenticated user", () => {
    const configService = { getOrThrow: jest.fn(() => "access-secret") };
    const strategy = new JwtStrategy(configService as any);
    const user = testUser();

    expect(strategy.validate(user)).toBe(user);
    expect(configService.getOrThrow).toHaveBeenCalledWith("JWT_ACCESS_SECRET");
  });
});
