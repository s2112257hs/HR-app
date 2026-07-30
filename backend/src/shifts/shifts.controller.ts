import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { UserRole } from "@prisma/client";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { AuthenticatedUser } from "../common/types/authenticated-user";
import { CheckOverlapDto } from "./dto/check-overlap.dto";
import { CopyDailyScheduleDto } from "./dto/copy-daily-schedule.dto";
import { CreateShiftDto } from "./dto/create-shift.dto";
import { UpdateShiftDto } from "./dto/update-shift.dto";
import { ShiftsService } from "./shifts.service";

@ApiTags("shifts")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("shifts")
export class ShiftsController {
  constructor(private readonly shiftsService: ShiftsService) {}

  @Get(":id")
  @Roles(UserRole.VIEWER)
  get(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.shiftsService.get(user.organisationId, id);
  }

  @Post("check-overlap")
  @Roles(UserRole.ROSTER_MANAGER)
  checkOverlap(@CurrentUser() user: AuthenticatedUser, @Body() dto: CheckOverlapDto) {
    return this.shiftsService.checkOverlap(user.organisationId, dto);
  }

  @Post("copy-daily")
  @Roles(UserRole.ROSTER_MANAGER)
  copyDailySchedule(@CurrentUser() user: AuthenticatedUser, @Body() dto: CopyDailyScheduleDto) {
    return this.shiftsService.copyDailySchedule(user, dto);
  }

  @Post()
  @Roles(UserRole.ROSTER_MANAGER)
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateShiftDto) {
    return this.shiftsService.create(user, dto);
  }

  @Patch(":id")
  @Roles(UserRole.ROSTER_MANAGER)
  update(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Body() dto: UpdateShiftDto) {
    return this.shiftsService.update(user, id, dto);
  }

  @Delete(":id")
  @Roles(UserRole.ROSTER_MANAGER)
  delete(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.shiftsService.cancel(user, id);
  }
}
