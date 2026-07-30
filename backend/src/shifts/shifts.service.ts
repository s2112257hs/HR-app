import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, ShiftStatus, UserRole } from "@prisma/client";
import { DateTime } from "luxon";
import { AuditService } from "../audit/audit.service";
import { AuthenticatedUser } from "../common/types/authenticated-user";
import { durationMinutes } from "../common/utils/overlap";
import { buildRosterRange } from "../common/utils/roster-dates";
import { PrismaService } from "../prisma/prisma.service";
import { CheckOverlapDto } from "./dto/check-overlap.dto";
import { CopyDailyScheduleDto } from "./dto/copy-daily-schedule.dto";
import { CreateShiftDto } from "./dto/create-shift.dto";
import { UpdateShiftDto } from "./dto/update-shift.dto";

const SHIFT_INCLUDE = {
  employee: true,
  department: true
} satisfies Prisma.ShiftInclude;

const MAX_COPY_DAYS = 90;

@Injectable()
export class ShiftsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService
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

  async copyDailySchedule(currentUser: AuthenticatedUser, dto: CopyDailyScheduleDto) {
    const organisation = await this.prisma.organisation.findUniqueOrThrow({
      where: { id: currentUser.organisationId },
      select: { timezone: true }
    });
    const startTime = dto.startTime ?? "00:00";
    const sourceRange = buildRosterRange(dto.sourceDate, organisation.timezone, 1, startTime);
    const targetDates = this.targetDates(dto.targetStartDate, dto.targetEndDate, organisation.timezone);
    const skippedDates = targetDates.filter((targetDate) => targetDate === dto.sourceDate);
    const copyDates = targetDates.filter((targetDate) => targetDate !== dto.sourceDate);
    this.assertManagerCanEditTargetDates(currentUser, copyDates, organisation.timezone);

    const sourceShifts = await this.prisma.shift.findMany({
      where: {
        organisationId: currentUser.organisationId,
        deletedAt: null,
        status: ShiftStatus.SCHEDULED,
        startAt: { lt: sourceRange.rangeEnd },
        endAt: { gt: sourceRange.rangeStart }
      },
      include: SHIFT_INCLUDE,
      orderBy: [{ employee: { displayOrder: "asc" } }, { startAt: "asc" }]
    });

    if (sourceShifts.length === 0) {
      throw this.validationError("sourceDate", "There are no shifts to copy from this day.");
    }

    const inactiveShift = sourceShifts.find(
      (shift) => !shift.employee.isActive || shift.employee.deletedAt !== null || !shift.department.isActive || shift.department.deletedAt !== null
    );

    if (inactiveShift) {
      throw this.validationError("sourceDate", "This schedule includes an inactive employee or department and cannot be copied.");
    }

    const shiftsToCopy = copyDates.flatMap((targetDate) => {
      const targetRange = buildRosterRange(targetDate, organisation.timezone, 1, startTime);
      return sourceShifts.map((shift) => {
        const offsetMs = shift.startAt.getTime() - sourceRange.rangeStart.getTime();
        const durationMs = shift.endAt.getTime() - shift.startAt.getTime();
        const startAt = new Date(targetRange.rangeStart.getTime() + offsetMs);
        const endAt = new Date(startAt.getTime() + durationMs);

        return {
          targetDate,
          sourceShiftId: shift.id,
          employeeId: shift.employeeId,
          departmentId: shift.departmentId,
          startAt,
          endAt,
          unpaidBreakMinutes: shift.unpaidBreakMinutes,
          notes: shift.notes
        };
      });
    });
    const dayMarkerConflicts = await this.findDayMarkerConflictsForShifts(currentUser.organisationId, shiftsToCopy, organisation.timezone);

    if (dayMarkerConflicts.length > 0) {
      throw this.dayMarkerConflict(dayMarkerConflicts, "targetStartDate", "Some copied shifts would land on RDO or leave days.");
    }

    const overlaps = (
      await Promise.all(
        shiftsToCopy.map(async (shift) => {
          const found = await this.findOverlaps(currentUser.organisationId, shift.employeeId, shift.startAt, shift.endAt);
          return found.map((overlap) => ({
            shiftId: overlap.id,
            departmentName: overlap.department.name,
            departmentShortCode: overlap.department.shortCode,
            startAt: overlap.startAt,
            endAt: overlap.endAt
          }));
        })
      )
    ).flat();

    if (overlaps.length > 0 && !dto.overlapAcknowledged) {
      throw new ConflictException({
        error: "SHIFT_COPY_OVERLAP",
        message: "Some copied shifts overlap with existing assignments.",
        overlaps
      });
    }

    const createdShiftIds = await this.prisma.$transaction(async (tx) => {
      const ids: string[] = [];

      for (const shift of shiftsToCopy) {
        const created = await tx.shift.create({
          data: {
            organisationId: currentUser.organisationId,
            employeeId: shift.employeeId,
            departmentId: shift.departmentId,
            startAt: shift.startAt,
            endAt: shift.endAt,
            unpaidBreakMinutes: shift.unpaidBreakMinutes,
            notes: shift.notes,
            createdByUserId: currentUser.sub,
            updatedByUserId: currentUser.sub
          },
          select: { id: true }
        });
        ids.push(created.id);
      }

      return ids;
    });

    await this.auditService.record({
      organisationId: currentUser.organisationId,
      userId: currentUser.sub,
      action: "DAILY_SCHEDULE_COPIED",
      entityType: "Shift",
      entityId: currentUser.organisationId,
      afterData: {
        sourceDate: dto.sourceDate,
        targetStartDate: dto.targetStartDate,
        targetEndDate: dto.targetEndDate,
        startTime,
        copiedCount: createdShiftIds.length,
        skippedDates,
        createdShiftIds
      }
    });

    return {
      sourceDate: dto.sourceDate,
      targetStartDate: dto.targetStartDate,
      targetEndDate: dto.targetEndDate,
      startTime,
      copiedCount: createdShiftIds.length,
      skippedDates,
      createdShiftIds
    };
  }

  async create(currentUser: AuthenticatedUser, dto: CreateShiftDto) {
    const range = this.validateRange(dto.startAt, dto.endAt, dto.unpaidBreakMinutes ?? 0);
    await this.assertManagerCanEditShiftStart(currentUser, range.startAt, "startAt");
    await this.ensureActiveEmployeeAndDepartment(currentUser.organisationId, dto.employeeId, dto.departmentId);
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
    const range = this.validateRange(startAt, endAt, unpaidBreakMinutes);
    await this.assertManagerCanEditShiftStart(currentUser, before.startAt, "startAt");
    await this.assertManagerCanEditShiftStart(currentUser, range.startAt, "startAt");
    await this.ensureActiveEmployeeAndDepartment(currentUser.organisationId, employeeId, departmentId);
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

  private targetDates(targetStartDate: string, targetEndDate: string, timezone: string) {
    const start = DateTime.fromISO(targetStartDate, { zone: timezone }).startOf("day");
    const end = DateTime.fromISO(targetEndDate, { zone: timezone }).startOf("day");

    if (!start.isValid) {
      throw this.validationError("targetStartDate", "Start date must be a valid ISO date.");
    }
    if (!end.isValid) {
      throw this.validationError("targetEndDate", "End date must be a valid ISO date.");
    }
    if (end < start) {
      throw this.validationError("targetEndDate", "End date must be the same as or later than start date.");
    }

    const dayCount = Math.floor(end.diff(start, "days").days) + 1;
    if (dayCount > MAX_COPY_DAYS) {
      throw this.validationError("targetEndDate", `Copy range cannot be longer than ${MAX_COPY_DAYS} days.`);
    }

    return Array.from({ length: dayCount }, (_item, index) => start.plus({ days: index }).toISODate() ?? targetStartDate);
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
    this.assertManagerCanEditTargetDates(currentUser, rosterDate ? [rosterDate] : [], organisation.timezone, field);
  }

  private assertManagerCanEditTargetDates(currentUser: AuthenticatedUser, targetDates: string[], timezone: string, field = "targetStartDate") {
    if (currentUser.role !== UserRole.ROSTER_MANAGER) {
      return;
    }

    const today = DateTime.now().setZone(timezone).startOf("day");
    const firstPastDate = targetDates.find((targetDate) => DateTime.fromISO(targetDate, { zone: timezone }).startOf("day") < today);

    if (!firstPastDate) {
      return;
    }

    throw new ForbiddenException({
      error: "PAST_ROSTER_LOCKED",
      message: "Roster managers cannot edit past roster days. Ask an admin to change previous dates.",
      fields: {
        [field]: `${firstPastDate} is a past roster day.`
      }
    });
  }

  private validateRange(startAtInput: string, endAtInput: string, unpaidBreakMinutes = 0) {
    const startAt = new Date(startAtInput);
    const endAt = new Date(endAtInput);

    if (Number.isNaN(startAt.getTime())) {
      throw this.validationError("startAt", "Start timestamp is required.");
    }
    if (Number.isNaN(endAt.getTime())) {
      throw this.validationError("endAt", "End timestamp is required.");
    }
    if (endAt <= startAt) {
      throw this.validationError("endAt", "End time must be later than start time.");
    }

    const totalMinutes = durationMinutes(startAt, endAt);
    if (unpaidBreakMinutes < 0 || unpaidBreakMinutes > totalMinutes) {
      throw this.validationError("unpaidBreakMinutes", "Unpaid break cannot be negative or exceed shift duration.");
    }

    return { startAt, endAt };
  }

  private async ensureActiveEmployeeAndDepartment(organisationId: string, employeeId: string, departmentId: string) {
    const [employee, department] = await Promise.all([
      this.prisma.employee.findFirst({
        where: { id: employeeId, organisationId, isActive: true, deletedAt: null }
      }),
      this.prisma.department.findFirst({
        where: { id: departmentId, organisationId, isActive: true, deletedAt: null }
      })
    ]);

    if (!employee) {
      throw this.validationError("employeeId", "Employee must be active and belong to the current organisation.");
    }
    if (!department) {
      throw this.validationError("departmentId", "Department must be active and belong to the current organisation.");
    }
  }

  private async assertNoDayMarkerConflict(organisationId: string, employeeId: string, startAt: Date, endAt: Date, field: string) {
    const organisation = await this.prisma.organisation.findUniqueOrThrow({
      where: { id: organisationId },
      select: { timezone: true }
    });
    const conflicts = await this.findDayMarkerConflictsForShifts(organisationId, [{ employeeId, startAt, endAt }], organisation.timezone);

    if (conflicts.length > 0) {
      throw this.dayMarkerConflict(conflicts, field, "This employee has an RDO or leave marker for that day.");
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
      for (const date of this.dateKeysOverlappingRange(shift.startAt, shift.endAt, timezone)) {
        employeeDates.add(date);
      }
      datesByEmployee.set(shift.employeeId, employeeDates);
    }

    const conditions: Prisma.DayMarkerWhereInput[] = Array.from(datesByEmployee.entries()).map(([employeeId, dates]) => ({
      employeeId,
      date: { in: Array.from(dates).map((date) => this.dateFromKey(date)) }
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

  private dateKeysOverlappingRange(startAt: Date, endAt: Date, timezone: string) {
    const firstDay = DateTime.fromJSDate(startAt).setZone(timezone).startOf("day");
    const lastDay = DateTime.fromJSDate(endAt).setZone(timezone).minus({ millisecond: 1 }).startOf("day");
    const dates: string[] = [];

    for (let cursor = firstDay; cursor <= lastDay; cursor = cursor.plus({ days: 1 })) {
      const date = cursor.toISODate();
      if (date) {
        dates.push(date);
      }
    }

    return dates;
  }

  private dayMarkerConflict(conflicts: Array<{ employeeId: string; date: Date; type: string }>, field: string, message: string) {
    const firstConflict = conflicts[0];
    const firstDate = DateTime.fromJSDate(firstConflict.date, { zone: "utc" }).toISODate();

    return new ConflictException({
      error: "DAY_MARKER_CONFLICT",
      message,
      fields: {
        [field]: `${firstConflict.type} exists on ${firstDate}. Remove it before scheduling this employee.`
      },
      markers: conflicts.map((conflict) => ({
        employeeId: conflict.employeeId,
        date: DateTime.fromJSDate(conflict.date, { zone: "utc" }).toISODate(),
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

  private dateFromKey(date: string) {
    return DateTime.fromISO(date, { zone: "utc" }).startOf("day").toJSDate();
  }

  private validationError(field: string, message: string) {
    return new BadRequestException({
      error: "VALIDATION_ERROR",
      message: "The request contains invalid information.",
      fields: {
        [field]: message
      }
    });
  }
}
