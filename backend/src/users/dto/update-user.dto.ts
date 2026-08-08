import { ApiPropertyOptional } from "@nestjs/swagger";
import { UserRole } from "@prisma/client";
import { IsEmail, IsIn, IsOptional, IsString, Matches, MaxLength, MinLength } from "class-validator";
import { TENANT_ROLES } from "../../common/auth/tenant-roles";

export class UpdateUserDto {
  @ApiPropertyOptional({ example: "Roster Manager" })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ example: "manager" })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  @Matches(/^[a-zA-Z0-9._-]+$/, { message: "Username can only contain letters, numbers, dots, underscores and hyphens." })
  username?: string | null;

  @ApiPropertyOptional({ example: "manager@example.com" })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ example: "manager123" })
  @IsOptional()
  @IsString()
  @MinLength(8)
  password?: string;

  @ApiPropertyOptional({ enum: TENANT_ROLES })
  @IsOptional()
  @IsIn(TENANT_ROLES)
  role?: UserRole;
}
