import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { DayMarker, DayMarkerType, Prisma, ShiftStatus, UserRole } from "@prisma/client";
import { DateTime } from "luxon";
import { AuditService } from "../audit/audit.service";
import { AuthenticatedUser } from "../common/types/authenticated-user";
import { buildRosterRange } from "../common/utils/roster-dates";
import { PrismaService } from "../prisma/prisma.service";
import { RosterLocksService } from "../roster-locks/roster-locks.service";
import { SetDayMarkerDto } from "./dto/set-day-marker.dto";

const EMPLOYEE_INCLUDE = {
  primaryDepartment: {
    select: {
      id: true,
      name: true,
      shortCode: true,
      colourHex: true,
      displayOrder: true
    }
  },
  dayMarkers: {
    where: { type: DayMarkerType.RDO },
    orderBy: { date: "asc" }
  }
} satisfies Prisma.EmployeeInclude;

@Injectable()
export class DayMarkersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly rosterLocksService: RosterLocksService
  ) {}

  async set(currentUser: AuthenticatedUser, dto: SetDayMarkerDto) {
    await this.rosterLocksService.assertWritable(currentUser);
    const organisation = await this.prisma.organisation.findUniqueOrThrow({
      where: { id: currentUser.organisationId },
      select: { timezone: true }
    });
    const markerDate = this.parseDate(dto.date, organisation.timezone, "date");
    this.assertManagerCanEditTargetDate(currentUser, markerDate.dateKey, organisation.timezone);
    await this.ensureActiveEmployee(currentUser.organisationId, dto.employeeId);

    const before = await this.prisma.dayMarker.findUnique({
      where: {
        organisationId_employeeId_date: {
          organisationId: currentUser.organisationId,
          employeeId: dto.employeeId,
          date: markerDate.date
        }
      }
    });

    const { saved, cancelledShiftIds } = await this.prisma.$transaction(async (tx) => {
      const savedMarker = before
        ? await tx.dayMarker.update({
            where: { id: before.id },
            data: {
              type: dto.type,
              notes: dto.notes?.trim() || null,
              updatedByUserId: currentUser.sub
            }
          })
        : await tx.dayMarker.create({
            data: {
              organisationId: currentUser.organisationId,
              employeeId: dto.employeeId,
              date: markerDate.date,
              type: dto.type,
              notes: dto.notes?.trim() || null,
              createdByUserId: currentUser.sub,
              updatedByUserId: currentUser.sub
            }
          });
      const shiftsToCancel = await tx.shift.findMany({
        where: this.scheduledShiftWhereForDate(currentUser.organisationId, dto.employeeId, markerDate.dateKey, organisation.timezone),
        select: { id: true }
      });
      const shiftIds = shiftsToCancel.map((shift) => shift.id);

      if (shiftIds.length > 0) {
        await tx.shift.updateMany({
          where: {
            organisationId: currentUser.organisationId,
            id: { in: shiftIds }
          },
          data: {
            status: ShiftStatus.CANCELLED,
            deletedAt: new Date(),
            updatedByUserId: currentUser.sub,
            version: { increment: 1 }
          }
        });
      }

      return { saved: savedMarker, cancelledShiftIds: shiftIds };
    });

    await this.auditService.record({
      organisationId: currentUser.organisationId,
      userId: currentUser.sub,
      action: before ? "DAY_MARKER_UPDATED" : "DAY_MARKER_CREATED",
      entityType: "DayMarker",
      entityId: saved.id,
      beforeData: before as Prisma.InputJsonValue,
      afterData: {
        marker: saved,
        cancelledShiftIds
      } as Prisma.InputJsonValue
    });

    return this.toResponse(saved);
  }

  async remove(currentUser: AuthenticatedUser, id: string) {
    await this.rosterLocksService.assertWritable(currentUser);
    const marker = await this.prisma.dayMarker.findFirst({
      where: { id, organisationId: currentUser.organisationId }
    });

    if (!marker) {
      throw new NotFoundException("Day marker not found.");
    }

    const organisation = await this.prisma.organisation.findUniqueOrThrow({
      where: { id: currentUser.organisationId },
      select: { timezone: true }
    });
    const markerDate = DateTime.fromJSDate(marker.date, { zone: "utc" }).toISODate() ?? "";
    this.assertManagerCanEditTargetDate(currentUser, markerDate, organisation.timezone);

    await this.prisma.dayMarker.delete({ where: { id } });
    await this.auditService.record({
      organisationId: currentUser.organisationId,
      userId: currentUser.sub,
      action: "DAY_MARKER_REMOVED",
      entityType: "DayMarker",
      entityId: marker.id,
      beforeData: marker as Prisma.InputJsonValue
    });

    return this.toResponse(marker);
  }

  async rdoTracker(organisationId: string, asOfDate?: string) {
    const organisation = await this.prisma.organisation.findUniqueOrThrow({
      where: { id: organisationId },
      select: { timezone: true, rdoTrackingStartDate: true, weekStartDay: true }
    });
    const asOf = asOfDate ? this.parseDate(asOfDate, organisation.timezone, "asOfDate").dateTime : DateTime.now().setZone(organisation.timezone);
    const asOfEnd = asOf.startOf("day");

    if (!asOfEnd.isValid) {
      throw this.validationError("asOfDate", "Date must be a valid ISO date.");
    }

    const employees = await this.prisma.employee.findMany({
      where: {
        organisationId,
        isActive: true,
        deletedAt: null
      },
      include: {
        ...EMPLOYEE_INCLUDE,
        dayMarkers: {
          where: {
            type: DayMarkerType.RDO,
            date: { gte: organisation.rdoTrackingStartDate }
          },
          orderBy: { date: "asc" }
        }
      },
      orderBy: [{ displayOrder: "asc" }, { firstName: "asc" }]
    });

    return {
      asOfDate: asOfEnd.toISODate(),
      timezone: organisation.timezone,
      trackingStartDate: DateTime.fromJSDate(organisation.rdoTrackingStartDate, { zone: "utc" }).toISODate(),
      employees: this.sortByPrimaryDepartment(employees).map((employee) => {
        const trackingStart = this.trackingStart(organisation.rdoTrackingStartDate, employee.startDate, asOfEnd);
        const requiredRdo = this.requiredRdoCount(trackingStart, asOfEnd, organisation.weekStartDay);
        const rdoTaken = employee.dayMarkers.filter((marker) => DateTime.fromJSDate(marker.date, { zone: "utc" }) >= trackingStart).length;
        const rdoBalanceBroughtForward = employee.rdoBalanceBroughtForward;

        return {
          employeeId: employee.id,
          employeeNumber: employee.employeeNumber,
          displayName: employee.preferredName || [employee.firstName, employee.lastName].filter(Boolean).join(" "),
          primaryDepartment: employee.primaryDepartment
            ? {
                id: employee.primaryDepartment.id,
                name: employee.primaryDepartment.name,
                shortCode: employee.primaryDepartment.shortCode,
                colourHex: employee.primaryDepartment.colourHex
              }
            : null,
          trackingStartDate: trackingStart.toISODate(),
          rdoBalanceBroughtForward,
          requiredRdo,
          rdoTaken,
          rdoOwed: rdoBalanceBroughtForward + requiredRdo - rdoTaken
        };
      })
    };
  }

  private async ensureActiveEmployee(organisationId: string, employeeId: string) {
    const employee = await this.prisma.employee.findFirst({
      where: { id: employeeId, organisationId, isActive: true, deletedAt: null },
      select: { id: true }
    });

    if (!employee) {
      throw this.validationError("employeeId", "Employee must be active and belong to the current organisation.");
    }
  }

  private parseDate(date: string, timezone: string, field: string) {
    const parsed = DateTime.fromISO(date, { zone: timezone }).startOf("day");

    if (!parsed.isValid) {
      throw this.validationError(field, "Date must be a valid ISO date.");
    }

    return {
      dateTime: parsed,
      dateKey: parsed.toISODate() ?? date,
      date: this.dateFromKey(parsed.toISODate() ?? date)
    };
  }

  private assertManagerCanEditTargetDate(currentUser: AuthenticatedUser, targetDate: string, timezone: string) {
    if (currentUser.role !== UserRole.ROSTER_MANAGER) {
      return;
    }

    const today = DateTime.now().setZone(timezone).startOf("day");
    const target = DateTime.fromISO(targetDate, { zone: timezone }).startOf("day");

    if (target >= today) {
      return;
    }

    throw new ForbiddenException({
      error: "PAST_ROSTER_LOCKED",
      message: "Roster managers cannot edit past roster days. Ask an admin to change previous dates.",
      fields: {
        date: `${targetDate} is a past roster day.`
      }
    });
  }

  private trackingStart(rdoTrackingStartDate: Date, employeeStartDate: Date | null, asOf: DateTime) {
    const organisationStartKey = DateTime.fromJSDate(rdoTrackingStartDate, { zone: "utc" }).toISODate();
    const organisationStart = DateTime.fromISO(organisationStartKey ?? asOf.toISODate() ?? "", { zone: asOf.zoneName ?? "utc" }).startOf("day");
    const employeeStart = employeeStartDate
      ? DateTime.fromISO(DateTime.fromJSDate(employeeStartDate, { zone: "utc" }).toISODate() ?? "", { zone: asOf.zoneName ?? "utc" }).startOf("day")
      : organisationStart;
    const start = employeeStart > organisationStart ? employeeStart : organisationStart;

    if (start > asOf) {
      return start;
    }

    return start;
  }

  private requiredRdoCount(trackingStart: DateTime, asOf: DateTime, weekStartDay: number) {
    if (trackingStart > asOf) {
      return 0;
    }

    const asOfWeek = this.configuredWeekStart(asOf, weekStartDay);
    const trackingWeek = this.configuredWeekStart(trackingStart, weekStartDay);
    if (trackingWeek > asOfWeek) {
      return 0;
    }

    return Math.floor(asOfWeek.diff(trackingWeek, "weeks").weeks) + 1;
  }

  private configuredWeekStart(date: DateTime, weekStartDay: number) {
    const daysFromStart = (date.weekday - weekStartDay + 7) % 7;
    return date.startOf("day").minus({ days: daysFromStart });
  }

  private sortByPrimaryDepartment<
    T extends {
      displayOrder: number;
      firstName: string;
      primaryDepartment: { displayOrder: number; name: string } | null;
    }
  >(employees: T[]) {
    return employees.sort((left, right) => {
      const departmentOrder = (left.primaryDepartment?.displayOrder ?? Number.MAX_SAFE_INTEGER) - (right.primaryDepartment?.displayOrder ?? Number.MAX_SAFE_INTEGER);
      if (departmentOrder !== 0) {
        return departmentOrder;
      }

      const departmentName = (left.primaryDepartment?.name ?? "").localeCompare(right.primaryDepartment?.name ?? "");
      if (departmentName !== 0) {
        return departmentName;
      }

      if (left.displayOrder !== right.displayOrder) {
        return left.displayOrder - right.displayOrder;
      }

      return left.firstName.localeCompare(right.firstName);
    });
  }

  private toResponse(marker: DayMarker) {
    return {
      id: marker.id,
      employeeId: marker.employeeId,
      date: DateTime.fromJSDate(marker.date, { zone: "utc" }).toISODate(),
      type: marker.type,
      notes: marker.notes,
      createdAt: marker.createdAt,
      updatedAt: marker.updatedAt
    };
  }

  private dateFromKey(date: string) {
    return DateTime.fromISO(date, { zone: "utc" }).startOf("day").toJSDate();
  }

  private scheduledShiftWhereForDate(organisationId: string, employeeId: string, date: string, timezone: string): Prisma.ShiftWhereInput {
    const range = buildRosterRange(date, timezone, 1);
    return {
      organisationId,
      employeeId,
      deletedAt: null,
      status: ShiftStatus.SCHEDULED,
      startAt: { lt: range.rangeEnd },
      endAt: { gt: range.rangeStart }
    };
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
