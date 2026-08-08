import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsEmail, IsOptional, IsString, IsUUID, Matches, MaxLength, MinLength } from "class-validator";

export class CreatePropertyAdminDto {
  @ApiProperty({ example: "00000000-0000-4000-8000-000000000001" })
  @IsUUID()
  organisationId!: string;

  @ApiProperty({ example: "Property Admin" })
  @IsString()
  name!: string;

  @ApiProperty({ example: "admin@property.com" })
  @IsEmail()
  email!: string;

  @ApiPropertyOptional({ example: "propertyadmin" })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  @Matches(/^[a-zA-Z0-9._-]+$/, { message: "Username can only contain letters, numbers, dots, underscores and hyphens." })
  username?: string;

  @ApiProperty({ example: "Password123!" })
  @IsString()
  @MinLength(8)
  password!: string;
}
