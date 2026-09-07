import { ConflictException, Injectable } from "@nestjs/common";
import { DateTime } from "luxon";
import { DayMarker, Prisma, Shift, ShiftStatus } from "@prisma/client";
import { AuditService } from "../audit/audit.service";
import { TenantEntityService } from "../common/services/tenant-entity.service";
import { AuthenticatedUser } from "../common/types/authenticated-user";
import { countAttendanceDays } from "../common/utils/attendance-summary";
import { validationError } from "../common/utils/api-errors";
import { employeeDisplayName, sortByPrimaryDepartment } from "../common/utils/employees";
import { rangesOverlap } from "../common/utils/overlap";
import { buildRosterRange, dateKeysOverlappingRange, dateKeyToUtcDate, parseRosterDate, utcDateToDateKey } from "../common/utils/roster-dates";
import { assertManagerCanEditTargetDates } from "../common/utils/roster-permissions";
import { scheduledShiftsStartingOnDateWhere } from "../common/utils/shift-queries";
import { PrismaService } from "../prisma/prisma.service";
import { RosterLocksService } from "../roster-locks/roster-locks.service";
import { CopyWeeklyCellDto } from "./dto/copy-weekly-cell.dto";
import { ClearWeeklyCellsDto, RestoreWeeklyCellsDto } from "./dto/weekly-cells.dto";

type RosterShift = Shift & {
  department: {
    id: string;
    name: string;
    shortCode: string;
    colourHex: string;
  };
};

type RosterDayMarker = Pick<DayMarker, "id" | "employeeId" | "date" | "type" | "notes">;
type ValidationShift = {
  employeeId: string;
  departmentId: string;
  startAt: Date;
  endAt: Date;
};

type ValidationCoverageShift = Pick<ValidationShift, "employeeId" | "startAt" | "endAt">;
const MAX_WEEKLY_CELL_COPY_DAYS = 90;

@Injectable()
export class RosterService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly rosterLocksService: RosterLocksService,
    private readonly tenantEntityService: TenantEntityService
  ) {}

  async daily(organisationId: string, date: string, startTime = "00:00") {
    return this.getRoster(organisationId, date, 1, startTime);
  }

  async weekly(organisationId: string, startDate: string, alignToWeekStart = true) {
    const organisation = await this.prisma.organisation.findUniqueOrThrow({
      where: { id: organisationId },
      select: { timezone: true, weekStartDay: true }
    });
    const weekStartDate = alignToWeekStart ? this.weekStartDate(startDate, organisation.timezone, organisation.weekStartDay) : this.rosterStartDate(startDate, organisation.timezone);

    return this.getRoster(organisationId, weekStartDate, 7);
  }

  async validateWeekly(organisationId: string, startDate: string, alignToWeekStart = true) {
    const organisation = await this.prisma.organisation.findUniqueOrThrow({
      where: { id: organisationId },
      select: { timezone: true, weekStartDay: true }
    });
    const weekStartDate = alignToWeekStart ? this.weekStartDate(startDate, organisation.timezone, organisation.weekStartDay) : this.rosterStartDate(startDate, organisation.timezone);
    const range = buildRosterRange(weekStartDate, organisation.timezone, 7);
    const rules = await this.prisma.validationRule.findMany({
      where: {
        organisationId,
        isActive: true
      },
      include: {
        department: {
          select: {
            id: true,
            name: true,
            shortCode: true,
            colourHex: true
          }
        }
      },
      orderBy: [{ name: "asc" }]
    });
    const shifts = await this.prisma.shift.findMany({
      where: {
        organisationId,
        deletedAt: null,
        status: ShiftStatus.SCHEDULED,
        startAt: { lt: range.rangeEnd },
        endAt: { gt: range.rangeStart }
      },
      select: {
        employeeId: true,
        departmentId: true,
        startAt: true,
        endAt: true
      }
    });
    const violations = range.dates.flatMap((date) =>
      rules.flatMap((rule) => {
        const interval = this.ruleInterval(date, rule.startTime, rule.endTime, organisation.timezone);
        const matchingShifts = this.shiftsCoveringInterval(shifts, rule.departmentId, interval.startAt, interval.endAt);
        const coverage = this.minimumCoverage(matchingShifts, interval.startAt, interval.endAt);

        if (coverage.actualMin >= rule.minimumStaff) {
          return [];
        }

        return [
          {
            ruleId: rule.id,
            ruleName: rule.name,
            date,
            department: rule.department,
            startTime: rule.startTime,
            endTime: rule.endTime,
            minimumStaff: rule.minimumStaff,
            actualMinimumStaff: coverage.actualMin,
            firstShortfallStart: coverage.firstShortfallStart ? this.localTimeLabel(coverage.firstShortfallStart, organisation.timezone) : rule.startTime,
            firstShortfallEnd: coverage.firstShortfallEnd ? this.localTimeLabel(coverage.firstShortfallEnd, organisation.timezone) : rule.endTime
          }
        ];
      })
    );

    return {
      valid: violations.length === 0,
      startDate: weekStartDate,
      endDateExclusive: range.endDateExclusive,
      timezone: organisation.timezone,
      checkedRules: rules.length,
      violations
    };
  }

  async copyWeeklyCell(currentUser: AuthenticatedUser, dto: CopyWeeklyCellDto) {
    await this.rosterLocksService.assertWritable(currentUser);
    const organisation = await this.prisma.organisation.findUniqueOrThrow({
      where: { id: currentUser.organisationId },
      select: { timezone: true }
    });
    const sourceDate = parseRosterDate(dto.sourceDate, organisation.timezone, "sourceDate");
    const targetDates = this.targetDates(dto.targetStartDate, dto.targetEndDate, organisation.timezone).filter((date) => date !== sourceDate.dateKey);
    assertManagerCanEditTargetDates(currentUser, targetDates, organisation.timezone);
    await this.tenantEntityService.ensureActiveEmployee(currentUser.organisationId, dto.employeeId);

    const sourceMarker = await this.prisma.dayMarker.findUnique({
      where: {
        organisationId_employeeId_date: {
          organisationId: currentUser.organisationId,
          employeeId: dto.employeeId,
          date: sourceDate.date
        }
      }
    });
    const sourceRange = buildRosterRange(sourceDate.dateKey, organisation.timezone, 1);
    const sourceShifts = sourceMarker
      ? []
      : await this.prisma.shift.findMany({
          where: {
            organisationId: currentUser.organisationId,
            employeeId: dto.employeeId,
            deletedAt: null,
            status: ShiftStatus.SCHEDULED,
            startAt: { gte: sourceRange.rangeStart, lt: sourceRange.rangeEnd }
          },
          include: {
            employee: true,
            department: true
          },
          orderBy: { startAt: "asc" }
        });

    if (!sourceMarker && sourceShifts.length === 0) {
      return {
        copiedKind: "EMPTY",
        copiedCount: 0,
        targetDates
      };
    }

    if (sourceShifts.length > 0) {
      const inactiveShift = sourceShifts.find(
        (shift) => !shift.employee.isActive || shift.employee.deletedAt !== null || !shift.department.isActive || shift.department.deletedAt !== null
      );

      if (inactiveShift) {
        throw validationError("sourceDate", "This schedule includes an inactive employee or department and cannot be copied.");
      }
    }

    const existingTargetCells = await this.findExistingWeeklyCellData(currentUser.organisationId, dto.employeeId, targetDates, organisation.timezone);

    if (existingTargetCells.length > 0 && !dto.replaceExisting) {
      throw new ConflictException({
        error: "WEEKLY_CELL_REPLACE_CONFIRMATION",
        message: "One or more target cells already contain roster data. Confirm replacement to delete those cells before pasting.",
        targetCells: existingTargetCells
      });
    }

    if (sourceMarker) {
      const { markerIds, removedMarkerIds, cancelledShiftIds } = await this.prisma.$transaction(async (tx) => {
        const cleared = await this.clearWeeklyCells(tx, currentUser.organisationId, dto.employeeId, targetDates, organisation.timezone, currentUser.sub);
        const ids: string[] = [];

        for (const targetDate of targetDates) {
          const marker = await tx.dayMarker.create({
            data: {
              organisationId: currentUser.organisationId,
              employeeId: dto.employeeId,
              date: dateKeyToUtcDate(targetDate),
              type: sourceMarker.type,
              notes: sourceMarker.notes,
              createdByUserId: currentUser.sub,
              updatedByUserId: currentUser.sub
            },
            select: { id: true }
          });
          ids.push(marker.id);
        }

        return { markerIds: ids, ...cleared };
      });

      await this.auditService.record({
        organisationId: currentUser.organisationId,
        userId: currentUser.sub,
        action: "WEEKLY_CELL_COPIED",
        entityType: "DayMarker",
        entityId: currentUser.organisationId,
        afterData: {
          sourceDate: sourceDate.dateKey,
          targetDates,
          employeeId: dto.employeeId,
          type: sourceMarker.type,
          markerIds,
          removedMarkerIds,
          cancelledShiftIds,
          replaceExisting: Boolean(dto.replaceExisting)
        }
      });

      return {
        copiedKind: sourceMarker.type,
        copiedCount: markerIds.length,
        targetDates
      };
    }

    const shiftsToCopy = targetDates.flatMap((targetDate) => {
      const targetRange = buildRosterRange(targetDate, organisation.timezone, 1);
      return sourceShifts.map((shift) => {
        const offsetMs = shift.startAt.getTime() - sourceRange.rangeStart.getTime();
        const durationMs = shift.endAt.getTime() - shift.startAt.getTime();
        const startAt = new Date(targetRange.rangeStart.getTime() + offsetMs);
        const endAt = new Date(startAt.getTime() + durationMs);

        return {
          employeeId: shift.employeeId,
          departmentId: shift.departmentId,
          startAt,
          endAt,
          unpaidBreakMinutes: shift.unpaidBreakMinutes,
          overtimeMinutes: shift.overtimeMinutes,
          notes: shift.notes
        };
      });
    });

    const { createdShiftIds, removedMarkerIds, cancelledShiftIds } = await this.prisma.$transaction(async (tx) => {
      const cleared = await this.clearWeeklyCells(tx, currentUser.organisationId, dto.employeeId, targetDates, organisation.timezone, currentUser.sub);
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
            overtimeMinutes: shift.overtimeMinutes,
            notes: shift.notes,
            createdByUserId: currentUser.sub,
            updatedByUserId: currentUser.sub
          },
          select: { id: true }
        });
        ids.push(created.id);
      }

      return { createdShiftIds: ids, ...cleared };
    });

    await this.auditService.record({
      organisationId: currentUser.organisationId,
      userId: currentUser.sub,
      action: "WEEKLY_CELL_COPIED",
      entityType: "Shift",
      entityId: currentUser.organisationId,
      afterData: {
        sourceDate: sourceDate.dateKey,
        targetDates,
        employeeId: dto.employeeId,
        createdShiftIds,
        removedMarkerIds,
        cancelledShiftIds,
        replaceExisting: Boolean(dto.replaceExisting)
      }
    });

    return {
      copiedKind: "SHIFT",
      copiedCount: createdShiftIds.length,
      targetDates
    };
  }

  async clearWeeklyCellsForUser(currentUser: AuthenticatedUser, dto: ClearWeeklyCellsDto) {
    await this.rosterLocksService.assertWritable(currentUser);
    const organisation = await this.prisma.organisation.findUniqueOrThrow({
      where: { id: currentUser.organisationId },
      select: { timezone: true }
    });
    const cells = this.normaliseCells(dto.cells, organisation.timezone);
    assertManagerCanEditTargetDates(currentUser, cells.map((cell) => cell.date), organisation.timezone);

    const result = await this.prisma.$transaction(async (tx) => {
      const results = [];
      for (const cell of cells) {
        await this.tenantEntityService.ensureActiveEmployee(currentUser.organisationId, cell.employeeId);
        const cleared = await this.clearWeeklyCells(tx, currentUser.organisationId, cell.employeeId, [cell.date], organisation.timezone, currentUser.sub);
        results.push({ ...cell, ...cleared });
      }
      return results;
    });

    await this.auditService.record({
      organisationId: currentUser.organisationId,
      userId: currentUser.sub,
      action: "WEEKLY_CELLS_CLEARED",
      entityType: "RosterCell",
      entityId: currentUser.organisationId,
      afterData: { cells: result } as Prisma.InputJsonValue
    });

    return {
      clearedCount: result.length,
      cells: result
    };
  }

  async restoreWeeklyCells(currentUser: AuthenticatedUser, dto: RestoreWeeklyCellsDto) {
    await this.rosterLocksService.assertWritable(currentUser);
    const organisation = await this.prisma.organisation.findUniqueOrThrow({
      where: { id: currentUser.organisationId },
      select: { timezone: true }
    });
    const targetDates = dto.cells.map((cell) => parseRosterDate(cell.date, organisation.timezone, "date").dateKey);
    assertManagerCanEditTargetDates(currentUser, targetDates, organisation.timezone);

    const restored = await this.prisma.$transaction(async (tx) => {
      const results = [];
      for (const cell of dto.cells) {
        const date = parseRosterDate(cell.date, organisation.timezone, "date").dateKey;
        await this.tenantEntityService.ensureActiveEmployee(currentUser.organisationId, cell.employeeId);
        await this.clearWeeklyCells(tx, currentUser.organisationId, cell.employeeId, [date], organisation.timezone, currentUser.sub);

        const marker = cell.marker
          ? await tx.dayMarker.create({
              data: {
                organisationId: currentUser.organisationId,
                employeeId: cell.employeeId,
                date: dateKeyToUtcDate(date),
                type: cell.marker.type,
                notes: cell.marker.notes?.trim() || null,
                createdByUserId: currentUser.sub,
                updatedByUserId: currentUser.sub
              },
              select: { id: true }
            })
          : null;
        const shiftIds: string[] = [];

        if (!cell.marker) {
          for (const shift of cell.shifts) {
            await this.tenantEntityService.ensureActiveDepartment(currentUser.organisationId, shift.departmentId);
            const created = await tx.shift.create({
              data: {
                organisationId: currentUser.organisationId,
                employeeId: cell.employeeId,
                departmentId: shift.departmentId,
                startAt: new Date(shift.startAt),
                endAt: new Date(shift.endAt),
                unpaidBreakMinutes: shift.unpaidBreakMinutes,
                overtimeMinutes: shift.overtimeMinutes ?? 0,
                notes: shift.notes?.trim() || null,
                createdByUserId: currentUser.sub,
                updatedByUserId: currentUser.sub
              },
              select: { id: true }
            });
            shiftIds.push(created.id);
          }
        }

        results.push({ employeeId: cell.employeeId, date, markerId: marker?.id ?? null, shiftIds });
      }
      return results;
    });

    await this.auditService.record({
      organisationId: currentUser.organisationId,
      userId: currentUser.sub,
      action: "WEEKLY_CELLS_RESTORED",
      entityType: "RosterCell",
      entityId: currentUser.organisationId,
      afterData: { cells: restored } as Prisma.InputJsonValue
    });

    return {
      restoredCount: restored.length,
      cells: restored
    };
  }

  async overtimeSummary(organisationId: string, fromDate: string, toDate: string) {
    const organisation = await this.prisma.organisation.findUniqueOrThrow({
      where: { id: organisationId },
      select: { timezone: true }
    });
    const range = this.inclusiveDateRange(fromDate, toDate, organisation.timezone);
    const shiftWhere = {
      organisationId,
      deletedAt: null,
      status: ShiftStatus.SCHEDULED,
      startAt: { lt: range.rangeEnd },
      endAt: { gt: range.rangeStart }
    };
    const employees = await this.prisma.employee.findMany({
      where: {
        organisationId,
        OR: [
          { isActive: true, deletedAt: null },
          {
            shifts: {
              some: shiftWhere
            }
          }
        ]
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
        },
        shifts: {
          where: shiftWhere,
          include: {
            department: {
              select: {
                id: true,
                name: true,
                shortCode: true,
                colourHex: true
              }
            }
          },
          orderBy: { startAt: "asc" }
        }
      },
      orderBy: [{ displayOrder: "asc" }, { firstName: "asc" }]
    });
    const rows = sortByPrimaryDepartment(employees).map((employee) => {
      const hoursWorkedMinutes = employee.shifts.reduce(
        (total, shift) => total + this.overlapMinutes(range.rangeStart, range.rangeEnd, shift.startAt, shift.endAt),
        0
      );
      const overtimeMinutes = employee.shifts.reduce((total, shift) => total + shift.overtimeMinutes, 0);

      return {
        employeeId: employee.id,
        employeeNumber: employee.employeeNumber,
        displayName: employeeDisplayName(employee),
        primaryDepartment: employee.primaryDepartment
          ? {
              id: employee.primaryDepartment.id,
              name: employee.primaryDepartment.name,
              shortCode: employee.primaryDepartment.shortCode,
              colourHex: employee.primaryDepartment.colourHex
            }
          : null,
        hoursWorkedMinutes,
        overtimeMinutes
      };
    });

    return {
      fromDate: range.fromDate,
      toDate: range.toDate,
      timezone: organisation.timezone,
      totals: {
        hoursWorkedMinutes: rows.reduce((total, employee) => total + employee.hoursWorkedMinutes, 0),
        overtimeMinutes: rows.reduce((total, employee) => total + employee.overtimeMinutes, 0)
      },
      employees: rows
    };
  }

  async attendanceSummary(organisationId: string, fromDate: string, toDate: string) {
    const organisation = await this.prisma.organisation.findUniqueOrThrow({
      where: { id: organisationId },
      select: { timezone: true }
    });
    const range = this.inclusiveDateRange(fromDate, toDate, organisation.timezone);
    const shiftWhere = {
      organisationId,
      deletedAt: null,
      status: ShiftStatus.SCHEDULED,
      startAt: { gte: range.rangeStart, lt: range.rangeEnd }
    };
    const markerWhere = {
      organisationId,
      date: { gte: dateKeyToUtcDate(range.fromDate), lte: dateKeyToUtcDate(range.toDate) }
    };

    const employees = await this.prisma.employee.findMany({
      where: {
        organisationId,
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
        },
        shifts: {
          where: shiftWhere,
          select: {
            startAt: true
          }
        },
        dayMarkers: {
          where: markerWhere,
          select: {
            date: true,
            type: true
          }
        }
      },
      orderBy: [{ displayOrder: "asc" }, { firstName: "asc" }]
    });
    const totalDays = this.dayCount(range.fromDate, range.toDate, organisation.timezone);

    return {
      fromDate: range.fromDate,
      toDate: range.toDate,
      timezone: organisation.timezone,
      totalDays,
      employees: sortByPrimaryDepartment(employees).map((employee) => {
        const counts = countAttendanceDays({
          shifts: employee.shifts,
          dayMarkers: employee.dayMarkers,
          totalDays,
          timezone: organisation.timezone
        });

        return {
          employeeId: employee.id,
          employeeNumber: employee.employeeNumber,
          displayName: employeeDisplayName(employee),
          primaryDepartment: employee.primaryDepartment
            ? {
                id: employee.primaryDepartment.id,
                name: employee.primaryDepartment.name,
                shortCode: employee.primaryDepartment.shortCode,
                colourHex: employee.primaryDepartment.colourHex
            }
            : null,
          workedDays: counts.workedDays,
          rdoDays: counts.rdoDays,
          sickDays: counts.sickDays,
          leaveDays: counts.leaveDays,
          totalDays,
          blankDays: counts.blankDays
        };
      })
    };
  }

  private async getRoster(organisationId: string, startDate: string, days: number, startTime = "00:00") {
    if (!startDate) {
      throw validationError("date", "Date is required.");
    }

    const organisation = await this.prisma.organisation.findUniqueOrThrow({
      where: { id: organisationId },
      select: { timezone: true, weekStartDay: true }
    });
    const range = buildRosterRange(startDate, organisation.timezone, days, startTime);
    const markerDates = dateKeysOverlappingRange(range.rangeStart, range.rangeEnd, organisation.timezone);
    const shiftWhere = {
      organisationId,
      deletedAt: null,
      status: ShiftStatus.SCHEDULED,
      startAt: { lt: range.rangeEnd },
      endAt: { gt: range.rangeStart }
    };
    const markerWhere = {
      organisationId,
      date: { in: markerDates.map((date) => dateKeyToUtcDate(date)) }
    };

    const employees = await this.prisma.employee.findMany({
      where: {
        organisationId,
        OR: [
          { isActive: true, deletedAt: null },
          {
            shifts: {
              some: shiftWhere
            }
          },
          {
            dayMarkers: {
              some: markerWhere
            }
          }
        ]
      },
      orderBy: [{ displayOrder: "asc" }, { firstName: "asc" }],
      include: {
        primaryDepartment: {
          select: {
            id: true,
            name: true,
            shortCode: true,
            colourHex: true,
            displayOrder: true
          }
        },
        shifts: {
          where: shiftWhere,
          include: {
            department: {
              select: {
                id: true,
                name: true,
                shortCode: true,
                colourHex: true
              }
            }
          },
          orderBy: { startAt: "asc" }
        },
        dayMarkers: {
          where: markerWhere,
          select: {
            id: true,
            employeeId: true,
            date: true,
            type: true,
            notes: true
          },
          orderBy: { date: "asc" }
        }
      }
    });
    const sortedEmployees = sortByPrimaryDepartment(employees);

    return {
      startDate,
      endDateExclusive: range.endDateExclusive,
      windowStartAt: range.rangeStart,
      windowEndAt: range.rangeEnd,
      timezone: organisation.timezone,
      weekNumber: DateTime.fromISO(startDate, { zone: organisation.timezone }).weekNumber,
      weekYear: DateTime.fromISO(startDate, { zone: organisation.timezone }).weekYear,
      weekStartDay: organisation.weekStartDay,
      dates: range.dates,
      employees: sortedEmployees.map((employee) => ({
        id: employee.id,
        employeeNumber: employee.employeeNumber,
        displayName: employeeDisplayName(employee),
        firstName: employee.firstName,
        lastName: employee.lastName,
        preferredName: employee.preferredName,
        primaryDepartment: employee.primaryDepartment
          ? {
              id: employee.primaryDepartment.id,
              name: employee.primaryDepartment.name,
              shortCode: employee.primaryDepartment.shortCode,
              colourHex: employee.primaryDepartment.colourHex
            }
          : null,
        primaryDepartmentId: employee.primaryDepartment?.id ?? null,
        isActive: employee.isActive,
        dayMarkers: this.dayMarkersForResponse(employee.dayMarkers, organisation.timezone),
        shifts: this.withOverlapFlags(employee.shifts, organisation.timezone)
      }))
    };
  }

  private weekStartDate(date: string, timezone: string, weekStartDay: number) {
    if (!date) {
      throw validationError("startDate", "Start date is required.");
    }

    const parsed = DateTime.fromISO(date, { zone: timezone }).startOf("day");
    if (!parsed.isValid) {
      throw validationError("startDate", "Start date must be a valid ISO date.");
    }

    const daysFromStart = (parsed.weekday - weekStartDay + 7) % 7;
    return parsed.minus({ days: daysFromStart }).toISODate() ?? date;
  }

  private rosterStartDate(date: string, timezone: string) {
    if (!date) {
      throw validationError("startDate", "Start date is required.");
    }

    const parsed = DateTime.fromISO(date, { zone: timezone }).startOf("day");
    if (!parsed.isValid) {
      throw validationError("startDate", "Start date must be a valid ISO date.");
    }

    return parsed.toISODate() ?? date;
  }

  private inclusiveDateRange(fromDate: string, toDate: string, timezone: string) {
    if (!fromDate) {
      throw validationError("fromDate", "From date is required.");
    }
    if (!toDate) {
      throw validationError("toDate", "To date is required.");
    }

    const from = DateTime.fromISO(fromDate, { zone: timezone }).startOf("day");
    const to = DateTime.fromISO(toDate, { zone: timezone }).startOf("day");

    if (!from.isValid) {
      throw validationError("fromDate", "From date must be a valid ISO date.");
    }
    if (!to.isValid) {
      throw validationError("toDate", "To date must be a valid ISO date.");
    }
    if (to < from) {
      throw validationError("toDate", "To date must be the same as or later than from date.");
    }

    return {
      fromDate: from.toISODate() ?? fromDate,
      toDate: to.toISODate() ?? toDate,
      rangeStart: from.toUTC().toJSDate(),
      rangeEnd: to.plus({ days: 1 }).toUTC().toJSDate()
    };
  }

  private overlapMinutes(rangeStart: Date, rangeEnd: Date, shiftStart: Date, shiftEnd: Date) {
    const start = Math.max(rangeStart.getTime(), shiftStart.getTime());
    const end = Math.min(rangeEnd.getTime(), shiftEnd.getTime());

    return Math.max(0, Math.round((end - start) / 60000));
  }

  private dayCount(fromDate: string, toDate: string, timezone: string) {
    const from = DateTime.fromISO(fromDate, { zone: timezone }).startOf("day");
    const to = DateTime.fromISO(toDate, { zone: timezone }).startOf("day");

    return Math.floor(to.diff(from, "days").days) + 1;
  }

  private targetDates(targetStartDate: string, targetEndDate: string, timezone: string) {
    const start = DateTime.fromISO(targetStartDate, { zone: timezone }).startOf("day");
    const end = DateTime.fromISO(targetEndDate, { zone: timezone }).startOf("day");

    if (!start.isValid) {
      throw validationError("targetStartDate", "Start date must be a valid ISO date.");
    }
    if (!end.isValid) {
      throw validationError("targetEndDate", "End date must be a valid ISO date.");
    }
    if (end < start) {
      throw validationError("targetEndDate", "End date must be the same as or later than start date.");
    }

    const dayCount = Math.floor(end.diff(start, "days").days) + 1;
    if (dayCount > MAX_WEEKLY_CELL_COPY_DAYS) {
      throw validationError("targetEndDate", `Copy range cannot be longer than ${MAX_WEEKLY_CELL_COPY_DAYS} days.`);
    }

    return Array.from({ length: dayCount }, (_item, index) => start.plus({ days: index }).toISODate() ?? targetStartDate);
  }

  private normaliseCells(cells: Array<{ employeeId: string; date: string }>, timezone: string) {
    const unique = new Map<string, { employeeId: string; date: string }>();

    for (const cell of cells) {
      const date = parseRosterDate(cell.date, timezone, "date").dateKey;
      unique.set(`${cell.employeeId}-${date}`, { employeeId: cell.employeeId, date });
    }

    return Array.from(unique.values());
  }

  private async findExistingWeeklyCellData(organisationId: string, employeeId: string, dates: string[], timezone: string) {
    const markerRows = await this.prisma.dayMarker.findMany({
      where: {
        organisationId,
        employeeId,
        date: { in: dates.map((date) => dateKeyToUtcDate(date)) }
      },
      select: {
        date: true,
        type: true
      }
    });
    const markersByDate = new Map(markerRows.map((marker) => [utcDateToDateKey(marker.date), marker.type]));
    const cells = await Promise.all(
      dates.map(async (date) => {
        const shiftCount = await this.prisma.shift.count({
          where: scheduledShiftsStartingOnDateWhere(organisationId, employeeId, date, timezone)
        });

        return {
          date,
          shiftCount,
          markerType: markersByDate.get(date) ?? null
        };
      })
    );

    return cells.filter((cell) => cell.shiftCount > 0 || cell.markerType);
  }

  private async clearWeeklyCells(
    tx: Prisma.TransactionClient,
    organisationId: string,
    employeeId: string,
    dates: string[],
    timezone: string,
    userId: string
  ) {
    const markersToRemove = await tx.dayMarker.findMany({
      where: {
        organisationId,
        employeeId,
        date: { in: dates.map((date) => dateKeyToUtcDate(date)) }
      },
      select: { id: true }
    });
    const removedMarkerIds = markersToRemove.map((marker) => marker.id);

    if (removedMarkerIds.length > 0) {
      await tx.dayMarker.deleteMany({
        where: {
          organisationId,
          id: { in: removedMarkerIds }
        }
      });
    }

    const cancelledShiftIds: string[] = [];
    for (const date of dates) {
      const shiftsToCancel = await tx.shift.findMany({
        where: scheduledShiftsStartingOnDateWhere(organisationId, employeeId, date, timezone),
        select: { id: true }
      });
      const shiftIds = shiftsToCancel.map((shift) => shift.id);

      if (shiftIds.length > 0) {
        await tx.shift.updateMany({
          where: {
            organisationId,
            id: { in: shiftIds }
          },
          data: {
            status: ShiftStatus.CANCELLED,
            deletedAt: new Date(),
            updatedByUserId: userId,
            version: { increment: 1 }
          }
        });
        cancelledShiftIds.push(...shiftIds);
      }
    }

    return { removedMarkerIds, cancelledShiftIds };
  }

  private ruleInterval(date: string, startTime: string, endTime: string, timezone: string) {
    const start = DateTime.fromISO(`${date}T${startTime}`, { zone: timezone });
    const end =
      endTime === "23:59"
        ? DateTime.fromISO(date, { zone: timezone }).plus({ days: 1 }).startOf("day")
        : DateTime.fromISO(`${date}T${endTime}`, { zone: timezone });

    return {
      startAt: start.toUTC().toJSDate(),
      endAt: end.toUTC().toJSDate()
    };
  }

  private shiftsCoveringInterval(shifts: ValidationShift[], departmentId: string, startAt: Date, endAt: Date): ValidationCoverageShift[] {
    const startMs = startAt.getTime();
    const endMs = endAt.getTime();

    return shifts
      .filter((shift) => shift.departmentId === departmentId && shift.startAt < endAt && shift.endAt > startAt)
      .map((shift) => ({
        employeeId: shift.employeeId,
        startAt: new Date(Math.max(startMs, shift.startAt.getTime())),
        endAt: new Date(Math.min(endMs, shift.endAt.getTime()))
      }))
      .filter((shift) => shift.startAt < shift.endAt);
  }

  private minimumCoverage(shifts: ValidationCoverageShift[], startAt: Date, endAt: Date) {
    const startMs = startAt.getTime();
    const endMs = endAt.getTime();
    const points = Array.from(
      new Set(
        [
          startMs,
          endMs,
          ...shifts.flatMap((shift) => [Math.max(startMs, shift.startAt.getTime()), Math.min(endMs, shift.endAt.getTime())])
        ].filter((point) => point >= startMs && point <= endMs)
      )
    ).sort((left, right) => left - right);
    let actualMin = Number.MAX_SAFE_INTEGER;
    let firstShortfallStart: Date | null = null;
    let firstShortfallEnd: Date | null = null;

    for (let index = 0; index < points.length - 1; index += 1) {
      const segmentStart = points[index];
      const segmentEnd = points[index + 1];
      /* istanbul ignore next -- points are sorted unique values, so this only protects against unexpected numeric input. */
      if (segmentEnd <= segmentStart) {
        continue;
      }

      const activeEmployeeCount = new Set(
        shifts
          .filter((shift) => shift.startAt.getTime() <= segmentStart && shift.endAt.getTime() >= segmentEnd)
          .map((shift) => shift.employeeId)
      ).size;

      if (activeEmployeeCount < actualMin) {
        actualMin = activeEmployeeCount;
        firstShortfallStart = new Date(segmentStart);
        firstShortfallEnd = new Date(segmentEnd);
      }
    }

    return {
      actualMin: actualMin === Number.MAX_SAFE_INTEGER ? 0 : actualMin,
      firstShortfallStart,
      firstShortfallEnd
    };
  }

  private localTimeLabel(date: Date, timezone: string) {
    return DateTime.fromJSDate(date).setZone(timezone).toFormat("HH:mm");
  }

  private findOverlaps(organisationId: string, employeeId: string, startAt: Date, endAt: Date) {
    return this.prisma.shift.findMany({
      where: {
        organisationId,
        employeeId,
        deletedAt: null,
        status: ShiftStatus.SCHEDULED,
        startAt: { lt: endAt },
        endAt: { gt: startAt }
      },
      include: {
        department: true
      },
      orderBy: { startAt: "asc" }
    });
  }

  private withOverlapFlags(shifts: RosterShift[], timezone: string) {
    return shifts.map((shift) => ({
      id: shift.id,
      employeeId: shift.employeeId,
      department: shift.department,
      startAt: shift.startAt,
      endAt: shift.endAt,
      unpaidBreakMinutes: shift.unpaidBreakMinutes,
      overtimeMinutes: shift.overtimeMinutes,
      notes: shift.notes,
      status: shift.status,
      version: shift.version,
      rosterSegments: this.shiftRosterSegments(shift, timezone),
      hasOverlap: shifts.some(
        (other) =>
          other.id !== shift.id &&
          rangesOverlap({ startAt: other.startAt, endAt: other.endAt }, { startAt: shift.startAt, endAt: shift.endAt })
      )
    }));
  }

  private shiftRosterSegments(shift: Pick<Shift, "startAt" | "endAt">, timezone: string) {
    const start = DateTime.fromJSDate(shift.startAt).setZone(timezone);
    const end = DateTime.fromJSDate(shift.endAt).setZone(timezone);
    const firstDay = start.startOf("day");
    const lastDay = end.minus({ millisecond: 1 }).startOf("day");
    const segments: Array<{
      date: string;
      startTime: string;
      endTime: string;
      startsBeforeDate: boolean;
      endsAfterDate: boolean;
    }> = [];

    for (let cursor = firstDay; cursor <= lastDay; cursor = cursor.plus({ days: 1 })) {
      const dayStart = cursor.startOf("day");
      const dayEnd = dayStart.plus({ days: 1 });
      const segmentStart = start > dayStart ? start : dayStart;
      const segmentEnd = end < dayEnd ? end : dayEnd;
      const date = cursor.toISODate();

      /* istanbul ignore next -- valid shift ranges always produce a date and positive segment inside the cursor bounds. */
      if (!date || segmentEnd <= segmentStart) {
        continue;
      }

      segments.push({
        date,
        startTime: segmentStart.toFormat("HH:mm"),
        endTime: segmentEnd.equals(dayEnd) ? "23:59" : segmentEnd.toFormat("HH:mm"),
        startsBeforeDate: start < dayStart,
        endsAfterDate: end > dayEnd
      });
    }

    return segments;
  }

  private dayMarkersForResponse(dayMarkers: RosterDayMarker[], timezone: string) {
    return dayMarkers.map((marker) => ({
      ...this.dayMarkerForResponse(marker, timezone)
    }));
  }

  private dayMarkerForResponse(marker: RosterDayMarker, timezone: string) {
    const date = utcDateToDateKey(marker.date);
    const start = DateTime.fromISO(date, { zone: timezone }).startOf("day");

    return {
      id: marker.id,
      employeeId: marker.employeeId,
      date,
      type: marker.type,
      notes: marker.notes,
      startAt: start.toUTC().toISO(),
      endAt: start.plus({ days: 1 }).toUTC().toISO()
    };
  }

}
