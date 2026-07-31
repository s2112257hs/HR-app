import { Body, Controller, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { UserRole } from "@prisma/client";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { Roles } from "../common/decorators/roles.decorator";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { AuthenticatedUser } from "../common/types/authenticated-user";
import { CreateValidationRuleDto } from "./dto/create-validation-rule.dto";
import { UpdateRdoBalancesDto } from "./dto/update-rdo-balances.dto";
import { UpdateSettingsDto } from "./dto/update-settings.dto";
import { UpdateValidationRuleDto } from "./dto/update-validation-rule.dto";
import { SettingsService } from "./settings.service";

@ApiTags("settings")
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller("settings")
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get()
  @Roles(UserRole.ADMIN)
  get(@CurrentUser() user: AuthenticatedUser) {
    return this.settingsService.get(user.organisationId);
  }

  @Patch()
  @Roles(UserRole.ADMIN)
  update(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpdateSettingsDto) {
    return this.settingsService.update(user, dto);
  }

  @Get("rdo-balances")
  @Roles(UserRole.ADMIN)
  listRdoBalances(@CurrentUser() user: AuthenticatedUser) {
    return this.settingsService.listRdoBalances(user.organisationId);
  }

  @Patch("rdo-balances")
  @Roles(UserRole.ADMIN)
  updateRdoBalances(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpdateRdoBalancesDto) {
    return this.settingsService.updateRdoBalances(user, dto);
  }

  @Get("validation-rules")
  @Roles(UserRole.ADMIN)
  listValidationRules(@CurrentUser() user: AuthenticatedUser) {
    return this.settingsService.listValidationRules(user.organisationId);
  }

  @Post("validation-rules")
  @Roles(UserRole.ADMIN)
  createValidationRule(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateValidationRuleDto) {
    return this.settingsService.createValidationRule(user, dto);
  }

  @Patch("validation-rules/:id")
  @Roles(UserRole.ADMIN)
  updateValidationRule(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string, @Body() dto: UpdateValidationRuleDto) {
    return this.settingsService.updateValidationRule(user, id, dto);
  }

  @Post("validation-rules/:id/deactivate")
  @Roles(UserRole.ADMIN)
  deactivateValidationRule(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.settingsService.setValidationRuleActive(user, id, false);
  }

  @Post("validation-rules/:id/reactivate")
  @Roles(UserRole.ADMIN)
  reactivateValidationRule(@CurrentUser() user: AuthenticatedUser, @Param("id") id: string) {
    return this.settingsService.setValidationRuleActive(user, id, true);
  }
}
