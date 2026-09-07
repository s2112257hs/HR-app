import { Injectable, NotFoundException } from "@nestjs/common";
import { DayMarker, DayMarkerType, Prisma, ShiftStatus } from "@prisma/client";
import { DateTime } from "luxon";
import { AuditService } from "../audit/audit.service";
import { TenantEntityService } from "../common/services/tenant-entity.service";
import { AuthenticatedUser } from "../common/types/authenticated-user";
import { validationError } from "../common/utils/api-errors";
import { employeeDisplayName, sortByPrimaryDepartment } from "../common/utils/employees";
import { parseRosterDate, utcDateToDateKey } from "../common/utils/roster-dates";
import { assertManagerCanEditTargetDate } from "../common/utils/roster-permissions";
import { scheduledShiftsOverlappingDateWhere } from "../common/utils/shift-queries";
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
    private readonly rosterLocksService: RosterLocksService,
    private readonly tenantEntityService: TenantEntityService
  ) {}

  async set(currentUser: AuthenticatedUser, dto: SetDayMarkerDto) {
    await this.rosterLocksService.assertWritable(currentUser);
    const organisation = await this.prisma.organisation.findUniqueOrThrow({
      where: { id: currentUser.organisationId },
      select: { timezone: true }
    });
    const markerDate = parseRosterDate(dto.date, organisation.timezone, "date");
    assertManagerCanEditTargetDate(currentUser, markerDate.dateKey, organisation.timezone);
    await this.tenantEntityService.ensureActiveEmployee(currentUser.organisationId, dto.employeeId);

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
        where: scheduledShiftsOverlappingDateWhere(currentUser.organisationId, dto.employeeId, markerDate.dateKey, organisation.timezone),
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
    const markerDate = utcDateToDateKey(marker.date);
    assertManagerCanEditTargetDate(currentUser, markerDate, organisation.timezone);

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
    const asOf = asOfDate ? parseRosterDate(asOfDate, organisation.timezone, "asOfDate").dateTime : DateTime.now().setZone(organisation.timezone);
    const asOfEnd = asOf.startOf("day");

    if (!asOfEnd.isValid) {
      throw validationError("asOfDate", "Date must be a valid ISO date.");
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
      trackingStartDate: utcDateToDateKey(organisation.rdoTrackingStartDate),
      employees: sortByPrimaryDepartment(employees).map((employee) => {
        const trackingStart = this.trackingStart(organisation.rdoTrackingStartDate, employee.startDate, asOfEnd);
        const requiredRdo = this.requiredRdoCount(trackingStart, asOfEnd, organisation.weekStartDay);
        const rdoTaken = employee.dayMarkers.filter((marker) => DateTime.fromISO(utcDateToDateKey(marker.date), { zone: "utc" }).startOf("day") >= trackingStart).length;
        const rdoBalanceBroughtForward = employee.rdoBalanceBroughtForward;

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
          trackingStartDate: trackingStart.toISODate(),
          rdoBalanceBroughtForward,
          requiredRdo,
          rdoTaken,
          rdoOwed: rdoBalanceBroughtForward + requiredRdo - rdoTaken
        };
      })
    };
  }

  private trackingStart(rdoTrackingStartDate: Date, employeeStartDate: Date | null, asOf: DateTime) {
    const organisationStart = DateTime.fromISO(utcDateToDateKey(rdoTrackingStartDate), { zone: asOf.zoneName ?? "utc" }).startOf("day");
    const employeeStart = employeeStartDate
      ? DateTime.fromISO(utcDateToDateKey(employeeStartDate), { zone: asOf.zoneName ?? "utc" }).startOf("day")
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
    /* istanbul ignore next -- defensive guard; trackingWeek cannot be after asOfWeek when trackingStart is on or before asOf. */
    if (trackingWeek > asOfWeek) {
      return 0;
    }

    return Math.floor(asOfWeek.diff(trackingWeek, "weeks").weeks) + 1;
  }

  private configuredWeekStart(date: DateTime, weekStartDay: number) {
    const daysFromStart = (date.weekday - weekStartDay + 7) % 7;
    return date.startOf("day").minus({ days: daysFromStart });
  }

  private toResponse(marker: DayMarker) {
    return {
      id: marker.id,
      employeeId: marker.employeeId,
      date: utcDateToDateKey(marker.date),
      type: marker.type,
      notes: marker.notes,
      createdAt: marker.createdAt,
      updatedAt: marker.updatedAt
    };
  }
}
