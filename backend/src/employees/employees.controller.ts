import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiQuery, ApiTags } from "@nestjs/swagger";
import { UserRole } from "@prisma/client";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { AuthenticatedUser } from "../common/types/authenticated-user";
import { CreateEmployeeDto } from "./dto/create-employee.dto";
import { ReorderEmployeesDto } from "./dto/reorder-employees.dto";
import { UpdateEmployeeDto } from "./dto/update-employee.dto";
import { EmployeesService } from "./employees.service";

@ApiTags("employees")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("employees")
export class EmployeesController {
  constructor(private readonly employeesService: EmployeesService) {}

  @Get()
  @Roles(UserRole.VIEWER)
  @ApiQuery({ name: "status", required: false, enum: ["active", "inactive", "all"] })
  @ApiQuery({ name: "search", required: false })
  list(@CurrentUser() user: AuthenticatedUser, @Query("status") status = "active", @Query("search") search?: string) {
    return this.employeesService.list(user.organisationId, status, search);
  }

  @Get(":id")
  @Roles(UserRole.VIEWER)
  get(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.employeesService.get(user.organisationId, id);
  }

  @Post()
  @Roles(UserRole.ADMIN)
  create(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateEmployeeDto) {
    return this.employeesService.create(user, dto);
  }

  @Patch("reorder")
  @Roles(UserRole.ADMIN)
  reorder(@CurrentUser() user: AuthenticatedUser, @Body() dto: ReorderEmployeesDto) {
    return this.employeesService.reorder(user, dto.employeeIds);
  }

  @Patch(":id")
  @Roles(UserRole.ADMIN)
  update(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Body() dto: UpdateEmployeeDto) {
    return this.employeesService.update(user, id, dto);
  }

  @Delete(":id")
  @Roles(UserRole.ADMIN)
  deactivate(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.employeesService.deactivate(user, id);
  }

  @Patch(":id/restore")
  @Roles(UserRole.ADMIN)
  restore(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.employeesService.restore(user, id);
  }
}
