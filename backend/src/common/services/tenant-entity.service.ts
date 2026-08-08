import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { validationError } from "../utils/api-errors";

const ACTIVE_EMPLOYEE_MESSAGE = "Employee must be active and belong to the current organisation.";
const ACTIVE_DEPARTMENT_MESSAGE = "Department must be active and belong to the current organisation.";

@Injectable()
export class TenantEntityService {
  constructor(private readonly prisma: PrismaService) {}

  async ensureActiveEmployee(organisationId: string, employeeId: string, field = "employeeId", message = ACTIVE_EMPLOYEE_MESSAGE) {
    const employee = await this.prisma.employee.findFirst({
      where: { id: employeeId, organisationId, isActive: true, deletedAt: null },
      select: { id: true }
    });

    if (!employee) {
      throw validationError(field, message);
    }
  }

  async ensureActiveDepartment(organisationId: string, departmentId: string, field = "departmentId", message = ACTIVE_DEPARTMENT_MESSAGE) {
    const department = await this.prisma.department.findFirst({
      where: { id: departmentId, organisationId, isActive: true, deletedAt: null },
      select: { id: true }
    });

    if (!department) {
      throw validationError(field, message);
    }
  }

  async ensureActiveEmployeeAndDepartment(organisationId: string, employeeId: string, departmentId: string) {
    const [employee, department] = await Promise.all([
      this.prisma.employee.findFirst({
        where: { id: employeeId, organisationId, isActive: true, deletedAt: null },
        select: { id: true }
      }),
      this.prisma.department.findFirst({
        where: { id: departmentId, organisationId, isActive: true, deletedAt: null },
        select: { id: true }
      })
    ]);

    if (!employee) {
      throw validationError("employeeId", ACTIVE_EMPLOYEE_MESSAGE);
    }
    if (!department) {
      throw validationError("departmentId", ACTIVE_DEPARTMENT_MESSAGE);
    }
  }
}
