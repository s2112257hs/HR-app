import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsOptional, IsString, Matches, MaxLength, MinLength } from "class-validator";

export class UpdateSuperAdminCredentialsDto {
  @ApiPropertyOptional({ example: "superadmin" })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  @Matches(/^[a-zA-Z0-9._-]+$/, { message: "Username can only contain letters, numbers, dots, underscores and hyphens." })
  username?: string;

  @ApiPropertyOptional({ example: "NewSecretPassword123!" })
  @IsOptional()
  @IsString()
  @MinLength(8, { message: "Password must be at least 8 characters long." })
  newPassword?: string;
}
