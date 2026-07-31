import { ConflictException, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { AuditService } from "../audit/audit.service";
import { AuthenticatedUser } from "../common/types/authenticated-user";
import { PrismaService } from "../prisma/prisma.service";
import { CreateDepartmentDto } from "./dto/create-department.dto";
import { UpdateDepartmentDto } from "./dto/update-department.dto";

@Injectable()
export class DepartmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService
  ) {}

  list(organisationId: string, status: string) {
    return this.prisma.department.findMany({
      where: {
        organisationId,
        ...(status === "inactive"
          ? { isActive: false }
          : status === "all"
            ? {}
            : { isActive: true, deletedAt: null })
      },
      orderBy: [{ displayOrder: "asc" }, { name: "asc" }]
    });
  }

  get(organisationId: string, id: string) {
    return this.prisma.department.findFirstOrThrow({
      where: { id, organisationId }
    });
  }

  async create(currentUser: AuthenticatedUser, dto: CreateDepartmentDto) {
    const created = await this.prisma.$transaction(async (tx) => {
      const last = await tx.department.findFirst({
        where: { organisationId: currentUser.organisationId },
        orderBy: { displayOrder: "desc" },
        select: { displayOrder: true }
      });

      return this.createOrThrowFriendly(tx, {
        organisationId: currentUser.organisationId,
        name: dto.name.trim(),
        shortCode: dto.shortCode.trim().toUpperCase(),
        colourHex: dto.colourHex.trim().toUpperCase(),
        displayOrder: (last?.displayOrder ?? 0) + 1
      });
    });

    await this.auditService.record({
      organisationId: currentUser.organisationId,
      userId: currentUser.sub,
      action: "DEPARTMENT_CREATED",
      entityType: "Department",
      entityId: created.id,
      afterData: created as Prisma.InputJsonValue
    });

    return created;
  }

  async update(currentUser: AuthenticatedUser, id: string, dto: UpdateDepartmentDto) {
    const before = await this.get(currentUser.organisationId, id);
    const updated = await this.updateOrThrowFriendly(id, {
      name: dto.name === undefined ? undefined : dto.name.trim(),
      shortCode: dto.shortCode === undefined ? undefined : dto.shortCode.trim().toUpperCase(),
      colourHex: dto.colourHex === undefined ? undefined : dto.colourHex.trim().toUpperCase()
    });

    await this.auditService.record({
      organisationId: currentUser.organisationId,
      userId: currentUser.sub,
      action: "DEPARTMENT_UPDATED",
      entityType: "Department",
      entityId: id,
      beforeData: before as Prisma.InputJsonValue,
      afterData: updated as Prisma.InputJsonValue
    });

    return updated;
  }

  async deactivate(currentUser: AuthenticatedUser, id: string) {
    const before = await this.get(currentUser.organisationId, id);
    const updated = await this.prisma.department.update({
      where: { id },
      data: { isActive: false, deletedAt: new Date() }
    });

    await this.auditService.record({
      organisationId: currentUser.organisationId,
      userId: currentUser.sub,
      action: "DEPARTMENT_DEACTIVATED",
      entityType: "Department",
      entityId: id,
      beforeData: before as Prisma.InputJsonValue,
      afterData: updated as Prisma.InputJsonValue
    });

    return updated;
  }

  async restore(currentUser: AuthenticatedUser, id: string) {
    const before = await this.get(currentUser.organisationId, id);
    const updated = await this.prisma.department.update({
      where: { id },
      data: { isActive: true, deletedAt: null }
    });

    await this.auditService.record({
      organisationId: currentUser.organisationId,
      userId: currentUser.sub,
      action: "DEPARTMENT_RESTORED",
      entityType: "Department",
      entityId: id,
      beforeData: before as Prisma.InputJsonValue,
      afterData: updated as Prisma.InputJsonValue
    });

    return updated;
  }

  async reorder(currentUser: AuthenticatedUser, departmentIds: string[]) {
    await this.prisma.$transaction(
      departmentIds.map((id, index) =>
        this.prisma.department.updateMany({
          where: { id, organisationId: currentUser.organisationId },
          data: { displayOrder: index + 1 }
        })
      )
    );

    await this.auditService.record({
      organisationId: currentUser.organisationId,
      userId: currentUser.sub,
      action: "DEPARTMENTS_REORDERED",
      entityType: "Department",
      entityId: currentUser.organisationId,
      afterData: { departmentIds } as Prisma.InputJsonValue
    });

    return this.list(currentUser.organisationId, "all");
  }

  private async createOrThrowFriendly(tx: Prisma.TransactionClient, data: Prisma.DepartmentUncheckedCreateInput) {
    try {
      return await tx.department.create({ data });
    } catch (error) {
      this.throwFriendlyUniqueError(error);
      throw error;
    }
  }

  private async updateOrThrowFriendly(id: string, data: Prisma.DepartmentUpdateInput) {
    try {
      return await this.prisma.department.update({
        where: { id },
        data
      });
    } catch (error) {
      this.throwFriendlyUniqueError(error);
      throw error;
    }
  }

  private throwFriendlyUniqueError(error: unknown) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") {
      return;
    }

    const target = Array.isArray(error.meta?.target) ? error.meta.target.join(",") : String(error.meta?.target ?? "");
    if (target.includes("short_code") || target.includes("shortCode")) {
      throw new ConflictException({
        error: "UNIQUE_CONSTRAINT",
        message: "Department short code is already in use.",
        fields: { shortCode: "Short code must be unique within the organisation." }
      });
    }

    throw new ConflictException({
      error: "UNIQUE_CONSTRAINT",
      message: "Department name is already in use.",
      fields: { name: "Department name must be unique within the organisation." }
    });
  }
}
