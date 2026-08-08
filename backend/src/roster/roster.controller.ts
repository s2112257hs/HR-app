import { Body, Controller, Get, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiQuery, ApiTags } from "@nestjs/swagger";
import { UserRole } from "@prisma/client";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { AuthenticatedUser } from "../common/types/authenticated-user";
import { RosterLocksService } from "../roster-locks/roster-locks.service";
import { CopyWeeklyCellDto } from "./dto/copy-weekly-cell.dto";
import { RosterService } from "./roster.service";
import { ClearWeeklyCellsDto, RestoreWeeklyCellsDto } from "./dto/weekly-cells.dto";

@ApiTags("roster")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("roster")
export class RosterController {
  constructor(
    private readonly rosterService: RosterService,
    private readonly rosterLocksService: RosterLocksService
  ) {}

  @Get("daily")
  @Roles(UserRole.VIEWER)
  @ApiQuery({ name: "date", example: "2026-08-20" })
  @ApiQuery({ name: "startTime", required: false, example: "07:00" })
  daily(@CurrentUser() user: AuthenticatedUser, @Query("date") date: string, @Query("startTime") startTime = "00:00") {
    return this.rosterService.daily(user.organisationId, date, startTime);
  }

  @Get("weekly")
  @Roles(UserRole.VIEWER)
  @ApiQuery({ name: "startDate", example: "2026-08-20" })
  weekly(@CurrentUser() user: AuthenticatedUser, @Query("startDate") startDate: string) {
    return this.rosterService.weekly(user.organisationId, startDate);
  }

  @Get("weekly-validation")
  @Roles(UserRole.ROSTER_MANAGER)
  @ApiQuery({ name: "startDate", example: "2026-08-20" })
  validateWeekly(@CurrentUser() user: AuthenticatedUser, @Query("startDate") startDate: string) {
    return this.rosterService.validateWeekly(user.organisationId, startDate);
  }

  @Get("ot-summary")
  @Roles(UserRole.VIEWER)
  @ApiQuery({ name: "fromDate", example: "2026-08-01" })
  @ApiQuery({ name: "toDate", example: "2026-08-31" })
  overtimeSummary(@CurrentUser() user: AuthenticatedUser, @Query("fromDate") fromDate: string, @Query("toDate") toDate: string) {
    return this.rosterService.overtimeSummary(user.organisationId, fromDate, toDate);
  }

  @Get("attendance-summary")
  @Roles(UserRole.VIEWER)
  @ApiQuery({ name: "fromDate", example: "2026-08-01" })
  @ApiQuery({ name: "toDate", example: "2026-08-31" })
  attendanceSummary(@CurrentUser() user: AuthenticatedUser, @Query("fromDate") fromDate: string, @Query("toDate") toDate: string) {
    return this.rosterService.attendanceSummary(user.organisationId, fromDate, toDate);
  }

  @Post("weekly-cell-copy")
  @Roles(UserRole.ROSTER_MANAGER)
  copyWeeklyCell(@CurrentUser() user: AuthenticatedUser, @Body() dto: CopyWeeklyCellDto) {
    return this.rosterService.copyWeeklyCell(user, dto);
  }

  @Post("weekly-cells-clear")
  @Roles(UserRole.ROSTER_MANAGER)
  clearWeeklyCells(@CurrentUser() user: AuthenticatedUser, @Body() dto: ClearWeeklyCellsDto) {
    return this.rosterService.clearWeeklyCellsForUser(user, dto);
  }

  @Post("weekly-cells-restore")
  @Roles(UserRole.ROSTER_MANAGER)
  restoreWeeklyCells(@CurrentUser() user: AuthenticatedUser, @Body() dto: RestoreWeeklyCellsDto) {
    return this.rosterService.restoreWeeklyCells(user, dto);
  }

  @Get("lock")
  @Roles(UserRole.ROSTER_MANAGER)
  lockStatus(@CurrentUser() user: AuthenticatedUser) {
    return this.rosterLocksService.status(user.organisationId);
  }

  @Post("lock")
  @Roles(UserRole.ROSTER_MANAGER)
  acquireLock(@CurrentUser() user: AuthenticatedUser) {
    return this.rosterLocksService.acquire(user);
  }

  @Patch("lock")
  @Roles(UserRole.ROSTER_MANAGER)
  heartbeatLock(@CurrentUser() user: AuthenticatedUser) {
    return this.rosterLocksService.heartbeat(user);
  }

  @Post("lock/steal")
  @Roles(UserRole.ROSTER_MANAGER)
  stealLock(@CurrentUser() user: AuthenticatedUser) {
    return this.rosterLocksService.steal(user);
  }

  @Post("lock/release")
  @Roles(UserRole.ROSTER_MANAGER)
  releaseLock(@CurrentUser() user: AuthenticatedUser) {
    return this.rosterLocksService.release(user);
  }
}
