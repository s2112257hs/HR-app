import { BadRequestException } from "@nestjs/common";

export function validationError(field: string, message: string) {
  return new BadRequestException({
    error: "VALIDATION_ERROR",
    message: "The request contains invalid information.",
    fields: {
      [field]: message
    }
  });
}
