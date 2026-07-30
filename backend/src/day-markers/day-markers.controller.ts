import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiQuery, ApiTags } from "@nestjs/swagger";
import { UserRole } from "@prisma/client";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { AuthenticatedUser } from "../common/types/authenticated-user";
import { DayMarkersService } from "./day-markers.service";
import { SetDayMarkerDto } from "./dto/set-day-marker.dto";

@ApiTags("day-markers")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("day-markers")
export class DayMarkersController {
  constructor(private readonly dayMarkersService: DayMarkersService) {}

  @Get("rdo-tracker")
  @Roles(UserRole.VIEWER)
  @ApiQuery({ name: "asOfDate", required: false })
  rdoTracker(@CurrentUser() user: AuthenticatedUser, @Query("asOfDate") asOfDate?: string) {
    return this.dayMarkersService.rdoTracker(user.organisationId, asOfDate);
  }

  @Post()
  @Roles(UserRole.ROSTER_MANAGER)
  set(@CurrentUser() user: AuthenticatedUser, @Body() dto: SetDayMarkerDto) {
    return this.dayMarkersService.set(user, dto);
  }

  @Delete(":id")
  @Roles(UserRole.ROSTER_MANAGER)
  remove(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.dayMarkersService.remove(user, id);
  }
}
