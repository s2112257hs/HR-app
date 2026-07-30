import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { Response } from "express";

type ErrorBody = {
  statusCode: number;
  error: string;
  message: string;
  fields?: Record<string, string>;
  overlaps?: unknown[];
};

@Catch()
export class HttpErrorFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    const prismaBody = this.prismaErrorBody(exception);

    if (prismaBody) {
      response.status(prismaBody.statusCode).json(prismaBody);
      return;
    }

    const status = exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const exceptionResponse = exception instanceof HttpException ? exception.getResponse() : undefined;
    const body = this.buildBody(status, exceptionResponse);

    response.status(status).json(body);
  }

  private buildBody(status: number, exceptionResponse: unknown): ErrorBody {
    if (typeof exceptionResponse === "object" && exceptionResponse !== null) {
      const payload = exceptionResponse as Record<string, unknown>;
      const message = Array.isArray(payload.message)
        ? "The request contains invalid information."
        : String(payload.message ?? this.defaultMessage(status));

      return {
        statusCode: status,
        error: String(payload.error ?? this.defaultError(status)),
        message,
        fields: this.responseFields(payload.fields) ?? this.validationFields(payload.message),
        overlaps: Array.isArray(payload.overlaps) ? payload.overlaps : undefined
      };
    }

    return {
      statusCode: status,
      error: this.defaultError(status),
      message: typeof exceptionResponse === "string" ? exceptionResponse : this.defaultMessage(status)
    };
  }

  private validationFields(message: unknown): Record<string, string> | undefined {
    if (!Array.isArray(message)) {
      return undefined;
    }

    return message.reduce<Record<string, string>>((fields, item) => {
      const [fieldName] = String(item).split(" ");
      fields[fieldName] = String(item);
      return fields;
    }, {});
  }

  private responseFields(fields: unknown): Record<string, string> | undefined {
    if (typeof fields !== "object" || fields === null || Array.isArray(fields)) {
      return undefined;
    }

    return Object.entries(fields).reduce<Record<string, string>>((result, [field, message]) => {
      result[field] = String(message);
      return result;
    }, {});
  }

  private prismaErrorBody(exception: unknown): ErrorBody | undefined {
    if (!(exception instanceof Prisma.PrismaClientKnownRequestError)) {
      return undefined;
    }

    if (exception.code === "P2002") {
      const fields = this.uniqueConstraintFields(exception.meta?.target);
      return {
        statusCode: HttpStatus.CONFLICT,
        error: "UNIQUE_CONSTRAINT",
        message: "A record with this value already exists.",
        fields: fields.reduce<Record<string, string>>((result, field) => {
          result[field] = "This value is already in use.";
          return result;
        }, {})
      };
    }

    return undefined;
  }

  private uniqueConstraintFields(target: unknown): string[] {
    const values = Array.isArray(target) ? target.map(String) : typeof target === "string" ? [target] : [];
    const fields = values
      .map((field) => this.toCamelCase(field))
      .filter((field) => field !== "organisationId" && field !== "id");

    return fields.length > 0 ? fields : ["root"];
  }

  private toCamelCase(field: string): string {
    return field.replace(/_([a-z])/g, (_match, letter: string) => letter.toUpperCase());
  }

  private defaultError(status: number): string {
    if (status === HttpStatus.BAD_REQUEST) {
      return "VALIDATION_ERROR";
    }
    if (status === HttpStatus.CONFLICT) {
      return "CONFLICT";
    }
    if (status === HttpStatus.UNAUTHORIZED) {
      return "UNAUTHORIZED";
    }
    if (status === HttpStatus.FORBIDDEN) {
      return "FORBIDDEN";
    }
    return "INTERNAL_SERVER_ERROR";
  }

  private defaultMessage(status: number): string {
    if (status === HttpStatus.BAD_REQUEST) {
      return "The request contains invalid information.";
    }
    return "The request could not be completed.";
  }
}
