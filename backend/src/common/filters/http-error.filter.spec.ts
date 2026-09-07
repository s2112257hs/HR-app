import { BadRequestException, ConflictException, HttpException, HttpStatus } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { HttpErrorFilter } from "./http-error.filter";

describe("HttpErrorFilter", () => {
  let filter: HttpErrorFilter;

  beforeEach(() => {
    filter = new HttpErrorFilter();
  });

  it("maps prisma unique constraint errors to conflict responses", () => {
    const { response, host } = responseHost();
    const error = new Prisma.PrismaClientKnownRequestError("Unique failed", {
      code: "P2002",
      clientVersion: "test",
      meta: { target: ["organisation_id", "short_code"] }
    });

    filter.catch(error, host);

    expect(response.status).toHaveBeenCalledWith(HttpStatus.CONFLICT);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: "UNIQUE_CONSTRAINT",
        fields: { shortCode: "This value is already in use." }
      })
    );
  });

  it("normalises validation exception arrays into field messages", () => {
    const { response, host } = responseHost();

    filter.catch(new BadRequestException(["property secret should not exist", "email must be an email"]), host);

    expect(response.status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: "Bad Request",
        message: "The request contains invalid information.",
        fields: {
          secret: "property secret should not exist",
          email: "email must be an email"
        }
      })
    );
  });

  it("preserves explicit response fields and array metadata", () => {
    const { response, host } = responseHost();

    filter.catch(
      new ConflictException({
        error: "OVERLAP",
        message: "Overlap found.",
        fields: { property: "employeeId is invalid" },
        overlaps: [{ id: "shift-1" }],
        targetCells: [{ date: "2026-08-20" }],
        targetDates: ["2026-08-20"]
      }),
      host
    );

    expect(response.status).toHaveBeenCalledWith(HttpStatus.CONFLICT);
    expect(response.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: "OVERLAP",
        fields: { employeeId: "employeeId is invalid" },
        overlaps: [{ id: "shift-1" }],
        targetCells: [{ date: "2026-08-20" }],
        targetDates: ["2026-08-20"]
      })
    );
  });

  it("uses sensible defaults for string and unknown exceptions", () => {
    const stringCase = responseHost();
    const unknownCase = responseHost();

    filter.catch(new HttpException("Unavailable", HttpStatus.SERVICE_UNAVAILABLE), stringCase.host);
    filter.catch(new Error("boom"), unknownCase.host);

    expect(stringCase.response.json).toHaveBeenCalledWith({ statusCode: HttpStatus.SERVICE_UNAVAILABLE, error: "INTERNAL_SERVER_ERROR", message: "Unavailable" });
    expect(unknownCase.response.status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(unknownCase.response.json).toHaveBeenCalledWith({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      error: "INTERNAL_SERVER_ERROR",
      message: "The request could not be completed."
    });
  });

  it("falls back to root for unknown prisma unique fields", () => {
    const { response, host } = responseHost();
    const error = new Prisma.PrismaClientKnownRequestError("Unique failed", {
      code: "P2002",
      clientVersion: "test"
    });

    filter.catch(error, host);

    expect(response.json).toHaveBeenCalledWith(expect.objectContaining({ fields: { root: "This value is already in use." } }));
  });
});

function responseHost() {
  const response = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn()
  };
  const host = {
    switchToHttp: jest.fn(() => ({
      getResponse: jest.fn(() => response)
    }))
  };

  return { response, host: host as any };
}
