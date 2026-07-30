import { Body, Controller, Get, Post, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiQuery, ApiTags } from "@nestjs/swagger";
import { UserRole } from "@prisma/client";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { AuthenticatedUser } from "../common/types/authenticated-user";
import { CopyWeeklyCellDto } from "./dto/copy-weekly-cell.dto";
import { RosterService } from "./roster.service";

@ApiTags("roster")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("roster")
export class RosterController {
  constructor(private readonly rosterService: RosterService) {}

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

  @Post("weekly-cell-copy")
  @Roles(UserRole.ROSTER_MANAGER)
  copyWeeklyCell(@CurrentUser() user: AuthenticatedUser, @Body() dto: CopyWeeklyCellDto) {
    return this.rosterService.copyWeeklyCell(user, dto);
  }
}
