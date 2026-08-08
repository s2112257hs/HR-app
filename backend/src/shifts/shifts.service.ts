import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, ShiftStatus, UserRole } from "@prisma/client";
import { DateTime } from "luxon";
import { AuditService } from "../audit/audit.service";
import { TenantEntityService } from "../common/services/tenant-entity.service";
import { AuthenticatedUser } from "../common/types/authenticated-user";
import { validationError } from "../common/utils/api-errors";
import { durationMinutes } from "../common/utils/overlap";
import { dateKeysOverlappingRange, dateKeyToUtcDate, utcDateToDateKey } from "../common/utils/roster-dates";
import { assertManagerCanEditTargetDates } from "../common/utils/roster-permissions";
import { PrismaService } from "../prisma/prisma.service";
import { RosterLocksService } from "../roster-locks/roster-locks.service";
import { CheckOverlapDto } from "./dto/check-overlap.dto";
import { CreateShiftDto } from "./dto/create-shift.dto";
import { UpdateShiftDto } from "./dto/update-shift.dto";

const SHIFT_INCLUDE = {
  employee: true,
  department: true
} satisfies Prisma.ShiftInclude;

@Injectable()
export class ShiftsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly rosterLocksService: RosterLocksService,
    private readonly tenantEntityService: TenantEntityService
  ) {}

  async get(organisationId: string, id: string) {
    const shift = await this.prisma.shift.findFirst({
      where: { id, organisationId },
      include: SHIFT_INCLUDE
    });

    if (!shift) {
      throw new NotFoundException("Shift not found.");
    }

    return shift;
  }

  async checkOverlap(organisationId: string, dto: CheckOverlapDto) {
    const range = this.validateRange(dto.startAt, dto.endAt);
    const overlaps = await this.findOverlaps(organisationId, dto.employeeId, range.startAt, range.endAt, dto.excludeShiftId ?? undefined);

    return {
      hasOverlap: overlaps.length > 0,
      overlaps: overlaps.map((shift) => ({
        shiftId: shift.id,
        departmentName: shift.department.name,
        departmentShortCode: shift.department.shortCode,
        startAt: shift.startAt,
        endAt: shift.endAt
      }))
    };
  }

  async create(currentUser: AuthenticatedUser, dto: CreateShiftDto) {
    await this.rosterLocksService.assertWritable(currentUser);
    const range = this.validateRange(dto.startAt, dto.endAt, dto.unpaidBreakMinutes ?? 0);
    await this.assertManagerCanEditShiftStart(currentUser, range.startAt, "startAt");
    await this.tenantEntityService.ensureActiveEmployeeAndDepartment(currentUser.organisationId, dto.employeeId, dto.departmentId);
    await this.assertNoDayMarkerConflict(currentUser.organisationId, dto.employeeId, range.startAt, range.endAt, "startAt");
    const overlaps = await this.findOverlaps(currentUser.organisationId, dto.employeeId, range.startAt, range.endAt);

    if (overlaps.length > 0 && !dto.overlapAcknowledged) {
      throw this.overlapConflict(overlaps);
    }

    const created = await this.prisma.shift.create({
      data: {
        organisationId: currentUser.organisationId,
        employeeId: dto.employeeId,
        departmentId: dto.departmentId,
        startAt: range.startAt,
        endAt: range.endAt,
        unpaidBreakMinutes: dto.unpaidBreakMinutes ?? 0,
        overtimeMinutes: dto.overtimeMinutes ?? 0,
        notes: dto.notes?.trim() || null,
        createdByUserId: currentUser.sub,
        updatedByUserId: currentUser.sub
      },
      include: SHIFT_INCLUDE
    });

    await this.auditService.record({
      organisationId: currentUser.organisationId,
      userId: currentUser.sub,
      action: "SHIFT_CREATED",
      entityType: "Shift",
      entityId: created.id,
      afterData: created as Prisma.InputJsonValue
    });

    return {
      ...created,
      hasOverlap: overlaps.length > 0
    };
  }

  async update(currentUser: AuthenticatedUser, id: string, dto: UpdateShiftDto) {
    await this.rosterLocksService.assertWritable(currentUser);
    const before = await this.prisma.shift.findFirst({
      where: { id, organisationId: currentUser.organisationId },
      include: SHIFT_INCLUDE
    });

    if (!before) {
      throw new NotFoundException("Shift not found.");
    }

    if (before.version !== dto.version) {
      throw new ConflictException({
        error: "VERSION_CONFLICT",
        message: "Another user changed this shift. Reload the roster and try again."
      });
    }

    const employeeId = dto.employeeId ?? before.employeeId;
    const departmentId = dto.departmentId ?? before.departmentId;
    const startAt = dto.startAt ?? before.startAt.toISOString();
    const endAt = dto.endAt ?? before.endAt.toISOString();
    const unpaidBreakMinutes = dto.unpaidBreakMinutes ?? before.unpaidBreakMinutes;
    const overtimeMinutes = dto.overtimeMinutes ?? before.overtimeMinutes;
    const range = this.validateRange(startAt, endAt, unpaidBreakMinutes);
    await this.assertManagerCanEditShiftStart(currentUser, before.startAt, "startAt");
    await this.assertManagerCanEditShiftStart(currentUser, range.startAt, "startAt");
    await this.tenantEntityService.ensureActiveEmployeeAndDepartment(currentUser.organisationId, employeeId, departmentId);
    await this.assertNoDayMarkerConflict(currentUser.organisationId, employeeId, range.startAt, range.endAt, "startAt");
    const overlaps = await this.findOverlaps(currentUser.organisationId, employeeId, range.startAt, range.endAt, id);

    if (overlaps.length > 0 && !dto.overlapAcknowledged) {
      throw this.overlapConflict(overlaps);
    }

    const updated = await this.prisma.shift.update({
      where: { id },
      data: {
        employeeId,
        departmentId,
        startAt: range.startAt,
        endAt: range.endAt,
        unpaidBreakMinutes,
        overtimeMinutes,
        notes: dto.notes === undefined ? before.notes : dto.notes?.trim() || null,
        updatedByUserId: currentUser.sub,
        version: { increment: 1 }
      },
      include: SHIFT_INCLUDE
    });

    await this.auditService.record({
      organisationId: currentUser.organisationId,
      userId: currentUser.sub,
      action: "SHIFT_UPDATED",
      entityType: "Shift",
      entityId: id,
      beforeData: before as Prisma.InputJsonValue,
      afterData: updated as Prisma.InputJsonValue
    });

    return {
      ...updated,
      hasOverlap: overlaps.length > 0
    };
  }

  async cancel(currentUser: AuthenticatedUser, id: string) {
    await this.rosterLocksService.assertWritable(currentUser);
    const before = await this.prisma.shift.findFirst({
      where: { id, organisationId: currentUser.organisationId },
      include: SHIFT_INCLUDE
    });

    if (!before) {
      throw new NotFoundException("Shift not found.");
    }
    await this.assertManagerCanEditShiftStart(currentUser, before.startAt, "startAt");

    const updated = await this.prisma.shift.update({
      where: { id },
      data: {
        status: ShiftStatus.CANCELLED,
        deletedAt: new Date(),
        updatedByUserId: currentUser.sub,
        version: { increment: 1 }
      },
      include: SHIFT_INCLUDE
    });

    await this.auditService.record({
      organisationId: currentUser.organisationId,
      userId: currentUser.sub,
      action: "SHIFT_CANCELLED",
      entityType: "Shift",
      entityId: id,
      beforeData: before as Prisma.InputJsonValue,
      afterData: updated as Prisma.InputJsonValue
    });

    return updated;
  }

  private async assertManagerCanEditShiftStart(currentUser: AuthenticatedUser, startAt: Date, field: string) {
    if (currentUser.role !== UserRole.ROSTER_MANAGER) {
      return;
    }

    const organisation = await this.prisma.organisation.findUniqueOrThrow({
      where: { id: currentUser.organisationId },
      select: { timezone: true }
    });
    const rosterDate = DateTime.fromJSDate(startAt).setZone(organisation.timezone).toISODate();
    assertManagerCanEditTargetDates(currentUser, rosterDate ? [rosterDate] : [], organisation.timezone, field);
  }

  private validateRange(startAtInput: string, endAtInput: string, unpaidBreakMinutes = 0) {
    const startAt = new Date(startAtInput);
    const endAt = new Date(endAtInput);

    if (Number.isNaN(startAt.getTime())) {
      throw validationError("startAt", "Start timestamp is required.");
    }
    if (Number.isNaN(endAt.getTime())) {
      throw validationError("endAt", "End timestamp is required.");
    }
    if (endAt <= startAt) {
      throw validationError("endAt", "End time must be later than start time.");
    }

    const totalMinutes = durationMinutes(startAt, endAt);
    if (unpaidBreakMinutes < 0 || unpaidBreakMinutes > totalMinutes) {
      throw validationError("unpaidBreakMinutes", "Unpaid break cannot be negative or exceed shift duration.");
    }

    return { startAt, endAt };
  }

  private async assertNoDayMarkerConflict(organisationId: string, employeeId: string, startAt: Date, endAt: Date, field: string) {
    const organisation = await this.prisma.organisation.findUniqueOrThrow({
      where: { id: organisationId },
      select: { timezone: true }
    });
    const conflicts = await this.findDayMarkerConflictsForShifts(organisationId, [{ employeeId, startAt, endAt }], organisation.timezone);

    if (conflicts.length > 0) {
      throw this.dayMarkerConflict(conflicts, field, "This employee has an RDO, leave or sick marker for that day.");
    }
  }

  private async findDayMarkerConflictsForShifts(
    organisationId: string,
    shifts: Array<{ employeeId: string; startAt: Date; endAt: Date }>,
    timezone: string
  ) {
    const datesByEmployee = new Map<string, Set<string>>();

    for (const shift of shifts) {
      const employeeDates = datesByEmployee.get(shift.employeeId) ?? new Set<string>();
      for (const date of dateKeysOverlappingRange(shift.startAt, shift.endAt, timezone)) {
        employeeDates.add(date);
      }
      datesByEmployee.set(shift.employeeId, employeeDates);
    }

    const conditions: Prisma.DayMarkerWhereInput[] = Array.from(datesByEmployee.entries()).map(([employeeId, dates]) => ({
      employeeId,
      date: { in: Array.from(dates).map((date) => dateKeyToUtcDate(date)) }
    }));

    if (conditions.length === 0) {
      return [];
    }

    return this.prisma.dayMarker.findMany({
      where: {
        organisationId,
        OR: conditions
      },
      select: {
        employeeId: true,
        date: true,
        type: true
      },
      orderBy: [{ date: "asc" }]
    });
  }

  private dayMarkerConflict(conflicts: Array<{ employeeId: string; date: Date; type: string }>, field: string, message: string) {
    const firstConflict = conflicts[0];
    const firstDate = utcDateToDateKey(firstConflict.date);

    return new ConflictException({
      error: "DAY_MARKER_CONFLICT",
      message,
      fields: {
        [field]: `${firstConflict.type} exists on ${firstDate}. Remove it before scheduling this employee.`
      },
      markers: conflicts.map((conflict) => ({
        employeeId: conflict.employeeId,
        date: utcDateToDateKey(conflict.date),
        type: conflict.type
      }))
    });
  }

  private findOverlaps(organisationId: string, employeeId: string, startAt: Date, endAt: Date, excludeShiftId?: string) {
    return this.prisma.shift.findMany({
      where: {
        organisationId,
        employeeId,
        deletedAt: null,
        status: ShiftStatus.SCHEDULED,
        startAt: { lt: endAt },
        endAt: { gt: startAt },
        ...(excludeShiftId ? { id: { not: excludeShiftId } } : {})
      },
      include: SHIFT_INCLUDE,
      orderBy: { startAt: "asc" }
    });
  }

  private overlapConflict(overlaps: Awaited<ReturnType<ShiftsService["findOverlaps"]>>) {
    return new ConflictException({
      error: "SHIFT_OVERLAP",
      message: "This shift overlaps with an existing assignment.",
      overlaps: overlaps.map((shift) => ({
        shiftId: shift.id,
        departmentName: shift.department.name,
        departmentShortCode: shift.department.shortCode,
        startAt: shift.startAt,
        endAt: shift.endAt
      }))
    });
  }

}
