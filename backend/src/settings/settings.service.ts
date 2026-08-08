import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { AuditService } from "../audit/audit.service";
import { TenantEntityService } from "../common/services/tenant-entity.service";
import { AuthenticatedUser } from "../common/types/authenticated-user";
import { validationError } from "../common/utils/api-errors";
import { employeeDisplayName } from "../common/utils/employees";
import { dateKeyToUtcDate, utcDateToDateKey } from "../common/utils/roster-dates";
import { PrismaService } from "../prisma/prisma.service";
import { CreateValidationRuleDto } from "./dto/create-validation-rule.dto";
import { UpdateRdoBalancesDto } from "./dto/update-rdo-balances.dto";
import { UpdateSettingsDto } from "./dto/update-settings.dto";
import { UpdateValidationRuleDto } from "./dto/update-validation-rule.dto";

type ValidationRuleData = {
  name: string;
  departmentId: string;
  startTime: string;
  endTime: string;
  minimumStaff: number;
  isActive: boolean;
};

type ValidationRuleForResponse = {
  id: string;
  organisationId: string;
  departmentId: string;
  name: string;
  startTime: string;
  endTime: string;
  minimumStaff: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  department: {
    id: string;
    name: string;
    shortCode: string;
    colourHex: string;
    isActive: boolean;
  };
};

@Injectable()
export class SettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly tenantEntityService: TenantEntityService
  ) {}

  async get(organisationId: string) {
    const organisation = await this.prisma.organisation.findUniqueOrThrow({
      where: { id: organisationId },
      select: {
        id: true,
        name: true,
        timezone: true,
        rdoTrackingStartDate: true,
        weekStartDay: true
      }
    });

    return this.toResponse(organisation);
  }

  async update(currentUser: AuthenticatedUser, dto: UpdateSettingsDto) {
    const before = await this.prisma.organisation.findUniqueOrThrow({
      where: { id: currentUser.organisationId },
      select: {
        id: true,
        name: true,
        timezone: true,
        rdoTrackingStartDate: true,
        weekStartDay: true
      }
    });
    const rdoTrackingStartDate = dateKeyToUtcDate(dto.rdoTrackingStartDate, "rdoTrackingStartDate");
    const weekStartDay = this.validateWeekStartDay(dto.weekStartDay);
    const updated = await this.prisma.organisation.update({
      where: { id: currentUser.organisationId },
      data: { rdoTrackingStartDate, weekStartDay },
      select: {
        id: true,
        name: true,
        timezone: true,
        rdoTrackingStartDate: true,
        weekStartDay: true
      }
    });

    await this.auditService.record({
      organisationId: currentUser.organisationId,
      userId: currentUser.sub,
      action: "SETTINGS_UPDATED",
      entityType: "Organisation",
      entityId: currentUser.organisationId,
      beforeData: before as Prisma.InputJsonValue,
      afterData: updated as Prisma.InputJsonValue
    });

    return this.toResponse(updated);
  }

  async listRdoBalances(organisationId: string) {
    const employees = await this.prisma.employee.findMany({
      where: {
        organisationId,
        isActive: true,
        deletedAt: null
      },
      include: {
        primaryDepartment: {
          select: {
            id: true,
            name: true,
            shortCode: true,
            colourHex: true,
            displayOrder: true
          }
        }
      },
      orderBy: [{ displayOrder: "asc" }, { firstName: "asc" }]
    });

    return employees.map((employee) => ({
      employeeId: employee.id,
      displayName: employeeDisplayName(employee),
      primaryDepartment: employee.primaryDepartment
        ? {
            id: employee.primaryDepartment.id,
            name: employee.primaryDepartment.name,
            shortCode: employee.primaryDepartment.shortCode,
            colourHex: employee.primaryDepartment.colourHex
          }
        : null,
      rdoBalanceBroughtForward: employee.rdoBalanceBroughtForward
    }));
  }

  async updateRdoBalances(currentUser: AuthenticatedUser, dto: UpdateRdoBalancesDto) {
    const employeeIds = dto.balances.map((balance) => balance.employeeId);
    const activeEmployees = await this.prisma.employee.findMany({
      where: {
        organisationId: currentUser.organisationId,
        id: { in: employeeIds },
        isActive: true,
        deletedAt: null
      },
      select: {
        id: true,
        rdoBalanceBroughtForward: true
      }
    });
    const activeIds = new Set(activeEmployees.map((employee) => employee.id));
    const missingId = employeeIds.find((employeeId) => !activeIds.has(employeeId));

    if (missingId) {
      throw validationError("balances", "RDO balance can only be set for active employees in this organisation.");
    }

    await this.prisma.$transaction(
      dto.balances.map((balance) =>
        this.prisma.employee.updateMany({
          where: {
            id: balance.employeeId,
            organisationId: currentUser.organisationId,
            isActive: true,
            deletedAt: null
          },
          data: {
            rdoBalanceBroughtForward: balance.rdoBalanceBroughtForward
          }
        })
      )
    );

    await this.auditService.record({
      organisationId: currentUser.organisationId,
      userId: currentUser.sub,
      action: "RDO_BALANCES_UPDATED",
      entityType: "Employee",
      entityId: currentUser.organisationId,
      beforeData: activeEmployees as Prisma.InputJsonValue,
      afterData: dto.balances as unknown as Prisma.InputJsonValue
    });

    return this.listRdoBalances(currentUser.organisationId);
  }

  async listValidationRules(organisationId: string) {
    const rules = await this.prisma.validationRule.findMany({
      where: { organisationId },
      include: { department: true },
      orderBy: [{ isActive: "desc" }, { name: "asc" }]
    });

    return rules.map((rule) => this.ruleToResponse(rule));
  }

  async createValidationRule(currentUser: AuthenticatedUser, dto: CreateValidationRuleDto) {
    const data = this.normaliseRuleData({
      name: dto.name,
      departmentId: dto.departmentId,
      startTime: dto.startTime,
      endTime: dto.endTime,
      minimumStaff: dto.minimumStaff,
      isActive: true
    });
    this.validateRuleTimes(data);
    await this.tenantEntityService.ensureActiveDepartment(currentUser.organisationId, data.departmentId);
    await this.assertRulesCanCoexist(currentUser.organisationId, data);

    try {
      const created = await this.prisma.validationRule.create({
        data: {
          organisationId: currentUser.organisationId,
          ...data
        },
        include: { department: true }
      });

      await this.auditService.record({
        organisationId: currentUser.organisationId,
        userId: currentUser.sub,
        action: "VALIDATION_RULE_CREATED",
        entityType: "ValidationRule",
        entityId: created.id,
        afterData: created as Prisma.InputJsonValue
      });

      return this.ruleToResponse(created);
    } catch (error) {
      this.throwFriendlyUniqueRuleError(error);
      throw error;
    }
  }

  async updateValidationRule(currentUser: AuthenticatedUser, id: string, dto: UpdateValidationRuleDto) {
    const before = await this.findRuleOrThrow(currentUser.organisationId, id);
    const data = this.normaliseRuleData({
      name: dto.name ?? before.name,
      departmentId: dto.departmentId ?? before.departmentId,
      startTime: dto.startTime ?? before.startTime,
      endTime: dto.endTime ?? before.endTime,
      minimumStaff: dto.minimumStaff ?? before.minimumStaff,
      isActive: before.isActive
    });
    this.validateRuleTimes(data);

    if (dto.departmentId) {
      await this.tenantEntityService.ensureActiveDepartment(currentUser.organisationId, dto.departmentId);
    }
    if (data.isActive) {
      await this.assertRulesCanCoexist(currentUser.organisationId, data, id);
    }

    try {
      const updated = await this.prisma.validationRule.update({
        where: { id },
        data,
        include: { department: true }
      });

      await this.auditService.record({
        organisationId: currentUser.organisationId,
        userId: currentUser.sub,
        action: "VALIDATION_RULE_UPDATED",
        entityType: "ValidationRule",
        entityId: id,
        beforeData: before as Prisma.InputJsonValue,
        afterData: updated as Prisma.InputJsonValue
      });

      return this.ruleToResponse(updated);
    } catch (error) {
      this.throwFriendlyUniqueRuleError(error);
      throw error;
    }
  }

  async setValidationRuleActive(currentUser: AuthenticatedUser, id: string, isActive: boolean) {
    const before = await this.findRuleOrThrow(currentUser.organisationId, id);

    if (isActive) {
      await this.tenantEntityService.ensureActiveDepartment(currentUser.organisationId, before.departmentId);
      await this.assertRulesCanCoexist(
        currentUser.organisationId,
        {
          name: before.name,
          departmentId: before.departmentId,
          startTime: before.startTime,
          endTime: before.endTime,
          minimumStaff: before.minimumStaff,
          isActive: true
        },
        id
      );
    }

    const updated = await this.prisma.validationRule.update({
      where: { id },
      data: { isActive },
      include: { department: true }
    });

    await this.auditService.record({
      organisationId: currentUser.organisationId,
      userId: currentUser.sub,
      action: isActive ? "VALIDATION_RULE_REACTIVATED" : "VALIDATION_RULE_DEACTIVATED",
      entityType: "ValidationRule",
      entityId: id,
      beforeData: before as Prisma.InputJsonValue,
      afterData: updated as Prisma.InputJsonValue
    });

    return this.ruleToResponse(updated);
  }

  deactivateValidationRule(currentUser: AuthenticatedUser, id: string) {
    return this.setValidationRuleActive(currentUser, id, false);
  }

  reactivateValidationRule(currentUser: AuthenticatedUser, id: string) {
    return this.setValidationRuleActive(currentUser, id, true);
  }

  private toResponse(organisation: { id: string; name: string; timezone: string; rdoTrackingStartDate: Date; weekStartDay: number }) {
    return {
      id: organisation.id,
      name: organisation.name,
      timezone: organisation.timezone,
      rdoTrackingStartDate: utcDateToDateKey(organisation.rdoTrackingStartDate),
      weekStartDay: organisation.weekStartDay
    };
  }

  private ruleToResponse(rule: ValidationRuleForResponse) {
    return {
      id: rule.id,
      organisationId: rule.organisationId,
      departmentId: rule.departmentId,
      name: rule.name,
      startTime: rule.startTime,
      endTime: rule.endTime,
      minimumStaff: rule.minimumStaff,
      isActive: rule.isActive,
      department: {
        id: rule.department.id,
        name: rule.department.name,
        shortCode: rule.department.shortCode,
        colourHex: rule.department.colourHex,
        isActive: rule.department.isActive
      },
      createdAt: rule.createdAt,
      updatedAt: rule.updatedAt
    };
  }

  private normaliseRuleData(data: ValidationRuleData) {
    return {
      ...data,
      name: data.name.trim(),
      startTime: data.startTime.trim(),
      endTime: data.endTime.trim(),
      minimumStaff: Number(data.minimumStaff)
    };
  }

  private validateRuleTimes(data: ValidationRuleData) {
    if (!data.name) {
      throw validationError("name", "Rule name is required.");
    }
    const startMinute = this.parseTimeToMinutes(data.startTime, "startTime");
    const endMinute = this.ruleEndMinute(data.endTime, "endTime");

    if (endMinute <= startMinute) {
      throw validationError("endTime", "End time must be later than start time.");
    }
  }

  private async assertRulesCanCoexist(organisationId: string, candidate: ValidationRuleData, excludeRuleId?: string) {
    const activeEmployeeCount = await this.prisma.employee.count({
      where: {
        organisationId,
        isActive: true,
        deletedAt: null
      }
    });
    const existingRules = await this.prisma.validationRule.findMany({
      where: {
        organisationId,
        isActive: true,
        ...(excludeRuleId ? { id: { not: excludeRuleId } } : {})
      }
    });
    const activeRules = [...existingRules, candidate];
    const points = Array.from(
      new Set(
        activeRules.flatMap((rule) => [this.parseTimeToMinutes(rule.startTime, "startTime"), this.ruleEndMinute(rule.endTime, "endTime")])
      )
    ).sort((left, right) => left - right);

    for (let index = 0; index < points.length - 1; index += 1) {
      const segmentStart = points[index];
      const segmentEnd = points[index + 1];
      const requiredByDepartment = new Map<string, number>();

      for (const rule of activeRules) {
        const ruleStart = this.parseTimeToMinutes(rule.startTime, "startTime");
        const ruleEnd = this.ruleEndMinute(rule.endTime, "endTime");

        if (ruleStart < segmentEnd && ruleEnd > segmentStart) {
          requiredByDepartment.set(rule.departmentId, Math.max(requiredByDepartment.get(rule.departmentId) ?? 0, rule.minimumStaff));
        }
      }

      const requiredStaff = Array.from(requiredByDepartment.values()).reduce((total, minimumStaff) => total + minimumStaff, 0);
      if (requiredStaff > activeEmployeeCount) {
        throw new BadRequestException({
          error: "VALIDATION_RULES_INCOMPATIBLE",
          message: "These validation rules cannot all be satisfied at the same time with the active employee count.",
          fields: {
            minimumStaff: `Rules require ${requiredStaff} staff at the same time, but only ${activeEmployeeCount} active employees exist.`
          }
        });
      }
    }
  }

  private async findRuleOrThrow(organisationId: string, id: string) {
    const rule = await this.prisma.validationRule.findFirst({
      where: { id, organisationId },
      include: { department: true }
    });

    if (!rule) {
      throw new NotFoundException("Validation rule not found.");
    }

    return rule;
  }

  private parseTimeToMinutes(time: string, field: string) {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
      throw validationError(field, "Time must use HH:mm format.");
    }

    const [hours, minutes] = time.split(":").map(Number);
    return hours * 60 + minutes;
  }

  private ruleEndMinute(time: string, field: string) {
    if (time === "23:59") {
      return 24 * 60;
    }

    return this.parseTimeToMinutes(time, field);
  }

  private throwFriendlyUniqueRuleError(error: unknown) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new ConflictException({
        error: "UNIQUE_CONSTRAINT",
        message: "A validation rule with this name already exists.",
        fields: {
          name: "Rule name is already in use."
        }
      });
    }
  }

  private validateWeekStartDay(day: number) {
    const value = Number(day);
    if (!Number.isInteger(value) || value < 1 || value > 7) {
      throw validationError("weekStartDay", "Week start day must be between Monday and Sunday.");
    }

    return value;
  }
}
