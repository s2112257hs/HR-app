import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiQuery, ApiTags } from "@nestjs/swagger";
import { UserRole } from "@prisma/client";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { AuthenticatedUser } from "../common/types/authenticated-user";
import { DepartmentsService } from "./departments.service";
import { CreateDepartmentDto } from "./dto/create-department.dto";
import { ReorderDepartmentsDto } from "./dto/reorder-departments.dto";
import { UpdateDepartmentDto } from "./dto/update-department.dto";

@ApiTags("departments")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("departments")
export class DepartmentsController {
  constructor(private readonly departmentsService: DepartmentsService) {}

  @Get()
  @Roles(UserRole.VIEWER)
  @ApiQuery({ name: "status", required: false, enum: ["active", "inactive", "all"] })
  list(@CurrentUser() user: AuthenticatedUser, @Query("status") status = "active") {
    return this.departmentsService.list(user.organisationId, status);
  }

  @Get(":id")
  @Roles(UserRole.VIEWER)
  get(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.departmentsService.get(user.organisationId, id);
  }

  @Post()
  @Roles(UserRole.ROSTER_MANAGER)
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateDepartmentDto) {
    return this.departmentsService.create(user, dto);
  }

  @Patch("reorder")
  @Roles(UserRole.ADMIN)
  reorder(@CurrentUser() user: AuthenticatedUser, @Body() dto: ReorderDepartmentsDto) {
    return this.departmentsService.reorder(user, dto.departmentIds);
  }

  @Patch(":id")
  @Roles(UserRole.ADMIN)
  update(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Body() dto: UpdateDepartmentDto) {
    return this.departmentsService.update(user, id, dto);
  }

  @Delete(":id")
  @Roles(UserRole.ADMIN)
  deactivate(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.departmentsService.deactivate(user, id);
  }

  @Patch(":id/restore")
  @Roles(UserRole.ADMIN)
  restore(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.departmentsService.restore(user, id);
  }
}
