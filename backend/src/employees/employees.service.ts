import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { AuditService } from "../audit/audit.service";
import { TenantEntityService } from "../common/services/tenant-entity.service";
import { AuthenticatedUser } from "../common/types/authenticated-user";
import { sortByPrimaryDepartment } from "../common/utils/employees";
import { PrismaService } from "../prisma/prisma.service";
import { CreateEmployeeDto } from "./dto/create-employee.dto";
import { UpdateEmployeeDto } from "./dto/update-employee.dto";

const EMPLOYEE_INCLUDE = {
  primaryDepartment: {
    select: {
      id: true,
      name: true,
      shortCode: true,
      colourHex: true,
      displayOrder: true
    }
  }
} satisfies Prisma.EmployeeInclude;

@Injectable()
export class EmployeesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly tenantEntityService: TenantEntityService
  ) {}

  list(organisationId: string, status: string, search?: string) {
    const where: Prisma.EmployeeWhereInput = {
      organisationId,
      ...(status === "inactive"
        ? { isActive: false }
        : status === "all"
          ? {}
          : { isActive: true, deletedAt: null }),
      ...(search
        ? {
            OR: [
              { firstName: { contains: search, mode: "insensitive" } },
              { lastName: { contains: search, mode: "insensitive" } },
              { preferredName: { contains: search, mode: "insensitive" } },
              { employeeNumber: { contains: search, mode: "insensitive" } }
            ]
          }
        : {})
    };

    return this.prisma.employee
      .findMany({
        where,
        include: EMPLOYEE_INCLUDE,
        orderBy: [{ displayOrder: "asc" }, { firstName: "asc" }]
      })
      .then((employees) => sortByPrimaryDepartment(employees));
  }

  get(organisationId: string, id: string) {
    return this.prisma.employee.findFirstOrThrow({
      where: { id, organisationId },
      include: EMPLOYEE_INCLUDE
    });
  }

  async create(currentUser: AuthenticatedUser, dto: CreateEmployeeDto) {
    await this.ensurePrimaryDepartment(currentUser.organisationId, dto.primaryDepartmentId);

    const created = await this.prisma.$transaction(async (tx) => {
      const last = await tx.employee.findFirst({
        where: { organisationId: currentUser.organisationId },
        orderBy: { displayOrder: "desc" },
        select: { displayOrder: true }
      });

      return tx.employee.create({
        data: {
          organisationId: currentUser.organisationId,
          ...this.toEmployeeData(dto),
          firstName: dto.firstName.trim(),
          displayOrder: (last?.displayOrder ?? 0) + 1
        },
        include: EMPLOYEE_INCLUDE
      });
    });

    await this.auditService.record({
      organisationId: currentUser.organisationId,
      userId: currentUser.sub,
      action: "EMPLOYEE_CREATED",
      entityType: "Employee",
      entityId: created.id,
      afterData: created as Prisma.InputJsonValue
    });

    return created;
  }

  async update(currentUser: AuthenticatedUser, id: string, dto: UpdateEmployeeDto) {
    const before = await this.get(currentUser.organisationId, id);
    await this.ensurePrimaryDepartment(currentUser.organisationId, dto.primaryDepartmentId);
    const updated = await this.prisma.employee.update({
      where: { id },
      data: this.toEmployeeData(dto),
      include: EMPLOYEE_INCLUDE
    });

    await this.auditService.record({
      organisationId: currentUser.organisationId,
      userId: currentUser.sub,
      action: "EMPLOYEE_UPDATED",
      entityType: "Employee",
      entityId: id,
      beforeData: before as Prisma.InputJsonValue,
      afterData: updated as Prisma.InputJsonValue
    });

    return updated;
  }

  async deactivate(currentUser: AuthenticatedUser, id: string) {
    const before = await this.get(currentUser.organisationId, id);
    const updated = await this.prisma.employee.update({
      where: { id },
      data: { isActive: false, deletedAt: new Date() },
      include: EMPLOYEE_INCLUDE
    });

    await this.auditService.record({
      organisationId: currentUser.organisationId,
      userId: currentUser.sub,
      action: "EMPLOYEE_DEACTIVATED",
      entityType: "Employee",
      entityId: id,
      beforeData: before as Prisma.InputJsonValue,
      afterData: updated as Prisma.InputJsonValue
    });

    return updated;
  }

  async restore(currentUser: AuthenticatedUser, id: string) {
    const before = await this.get(currentUser.organisationId, id);
    const updated = await this.prisma.employee.update({
      where: { id },
      data: { isActive: true, deletedAt: null },
      include: EMPLOYEE_INCLUDE
    });

    await this.auditService.record({
      organisationId: currentUser.organisationId,
      userId: currentUser.sub,
      action: "EMPLOYEE_RESTORED",
      entityType: "Employee",
      entityId: id,
      beforeData: before as Prisma.InputJsonValue,
      afterData: updated as Prisma.InputJsonValue
    });

    return updated;
  }

  async reorder(currentUser: AuthenticatedUser, employeeIds: string[]) {
    await this.prisma.$transaction(
      employeeIds.map((id, index) =>
        this.prisma.employee.updateMany({
          where: { id, organisationId: currentUser.organisationId },
          data: { displayOrder: index + 1 }
        })
      )
    );

    await this.auditService.record({
      organisationId: currentUser.organisationId,
      userId: currentUser.sub,
      action: "EMPLOYEES_REORDERED",
      entityType: "Employee",
      entityId: currentUser.organisationId,
      afterData: { employeeIds } as Prisma.InputJsonValue
    });

    return this.list(currentUser.organisationId, "all");
  }

  private toEmployeeData(dto: CreateEmployeeDto | UpdateEmployeeDto): EmployeeScalarData {
    return {
      employeeNumber: this.trimOptional(dto.employeeNumber),
      firstName: dto.firstName === undefined ? undefined : dto.firstName.trim(),
      lastName: this.trimOptional(dto.lastName),
      preferredName: this.trimOptional(dto.preferredName),
      phone: this.trimOptional(dto.phone),
      email: this.trimOptional(dto.email),
      employmentType: this.trimOptional(dto.employmentType),
      startDate: dto.startDate ? new Date(dto.startDate) : undefined,
      endDate: dto.endDate ? new Date(dto.endDate) : undefined,
      primaryDepartmentId: dto.primaryDepartmentId === undefined ? undefined : dto.primaryDepartmentId || null
    };
  }

  private async ensurePrimaryDepartment(organisationId: string, primaryDepartmentId?: string | null) {
    if (!primaryDepartmentId) {
      return;
    }

    await this.tenantEntityService.ensureActiveDepartment(
      organisationId,
      primaryDepartmentId,
      "primaryDepartmentId",
      "Primary department must be active and belong to the current organisation."
    );
  }

  private trimOptional(value?: string): string | null | undefined {
    if (value === undefined) {
      return undefined;
    }
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
}

type EmployeeScalarData = {
  employeeNumber?: string | null;
  firstName?: string;
  lastName?: string | null;
  preferredName?: string | null;
  phone?: string | null;
  email?: string | null;
  employmentType?: string | null;
  startDate?: Date;
  endDate?: Date;
  primaryDepartmentId?: string | null;
};
