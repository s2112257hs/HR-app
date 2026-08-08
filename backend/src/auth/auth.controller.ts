import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { AuthenticatedUser } from "../common/types/authenticated-user";
import { AuthService } from "./auth.service";
import { LoginDto } from "./dto/login.dto";
import { RefreshTokenDto } from "./dto/refresh-token.dto";
import { SwitchOrganisationDto } from "./dto/switch-organisation.dto";

@ApiTags("auth")
@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post("login")
  @ApiOperation({ summary: "Sign in using email/username, password, and optional 4-digit property code" })
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Post("refresh")
  refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refresh(dto.refreshToken);
  }

  @Post("logout")
  logout() {
    return { ok: true };
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get("me")
  me(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.me(user.sub, user.organisationId);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Get("organisations")
  @ApiOperation({ summary: "Get list of accessible properties for current user" })
  getOrganisations(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.getOrganisations(user.sub);
  }

  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @Post("switch-organisation")
  @ApiOperation({ summary: "Switch active property context without logging out" })
  switchOrganisation(@CurrentUser() user: AuthenticatedUser, @Body() dto: SwitchOrganisationDto) {
    return this.authService.switchOrganisation(user, dto.organisationId);
  }
}
