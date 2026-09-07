import { BadRequestException } from "@nestjs/common";
import { validationError } from "./api-errors";

describe("validationError", () => {
  it("builds the shared validation error response shape", () => {
    const error = validationError("fieldName", "Field is invalid.");

    expect(error).toBeInstanceOf(BadRequestException);
    expect(error.getResponse()).toEqual({
      error: "VALIDATION_ERROR",
      message: "The request contains invalid information.",
      fields: {
        fieldName: "Field is invalid."
      }
    });
  });
});
