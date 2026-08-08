import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { SuperAdminGuard } from "../common/guards/super-admin.guard";
import { AuthenticatedUser } from "../common/types/authenticated-user";
import { CreateMembershipDto } from "./dto/create-membership.dto";
import { CreateOrganisationDto } from "./dto/create-organisation.dto";
import { CreatePropertyAdminDto } from "./dto/create-property-admin.dto";
import { UpdateSuperAdminCredentialsDto } from "./dto/update-super-admin-credentials.dto";
import { UpdateOrganisationCodeDto } from "./dto/update-organisation-code.dto";
import { SuperAdminService } from "./super-admin.service";

@ApiTags("super-admin")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, SuperAdminGuard)
@Controller("super-admin")
export class SuperAdminController {
  constructor(private readonly superAdminService: SuperAdminService) {}

  @Get("organisations")
  @ApiOperation({ summary: "List all organisations and metrics (Super Admin)" })
  listOrganisations() {
    return this.superAdminService.listOrganisations();
  }

  @Get("users")
  @ApiOperation({ summary: "List tenant users and property memberships (Super Admin)" })
  listUsers() {
    return this.superAdminService.listUsers();
  }

  @Post("organisations")
  @ApiOperation({ summary: "Provision a new organisation and initial admin (Super Admin)" })
  createOrganisation(@Body() dto: CreateOrganisationDto) {
    return this.superAdminService.createOrganisation(dto);
  }

  @Post("admins")
  @ApiOperation({ summary: "Create an admin user for an existing property (Super Admin)" })
  createAdmin(@Body() dto: CreatePropertyAdminDto) {
    return this.superAdminService.createAdmin(dto);
  }

  @Patch("organisations/:id/code")
  @ApiOperation({ summary: "Update an organisation 4-digit code (Super Admin)" })
  updateOrganisationCode(@Param("id") id: string, @Body() dto: UpdateOrganisationCodeDto) {
    return this.superAdminService.updateOrganisationCode(id, dto);
  }

  @Delete("organisations/:id")
  @ApiOperation({ summary: "Permanently delete an organisation and its tenant data (Super Admin)" })
  deleteOrganisation(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.superAdminService.deleteOrganisation(user, id);
  }

  @Delete("departments/:id")
  @ApiOperation({ summary: "Permanently delete a department and dependent roster data (Super Admin)" })
  deleteDepartment(@Param("id") id: string) {
    return this.superAdminService.deleteDepartment(id);
  }

  @Delete("employees/:id")
  @ApiOperation({ summary: "Permanently delete an employee and dependent roster data (Super Admin)" })
  deleteEmployee(@Param("id") id: string) {
    return this.superAdminService.deleteEmployee(id);
  }

  @Delete("users/:id")
  @ApiOperation({ summary: "Permanently delete a tenant user (Super Admin)" })
  deleteUser(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.superAdminService.deleteUser(user, id);
  }

  @Post("memberships")
  @ApiOperation({ summary: "Assign a user to an organisation with a role (Super Admin)" })
  createMembership(@Body() dto: CreateMembershipDto) {
    return this.superAdminService.createMembership(dto);
  }

  @Patch("credentials")
  @ApiOperation({ summary: "Change the Super Admin username and/or password" })
  updateCredentials(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpdateSuperAdminCredentialsDto) {
    return this.superAdminService.updateCredentials(user, dto);
  }

  @Patch("change-password")
  @ApiOperation({ summary: "Change the Super Admin account password" })
  changePassword(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpdateSuperAdminCredentialsDto) {
    return this.superAdminService.updateCredentials(user, dto);
  }
}
