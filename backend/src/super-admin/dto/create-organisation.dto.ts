import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IsEmail, IsInt, IsOptional, IsString, Matches, Max, Min, MinLength } from "class-validator";

export class CreateOrganisationDto {
  @ApiProperty({ example: "Sunset Bay Resort" })
  @IsString()
  name!: string;

  @ApiPropertyOptional({ example: "0002" })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}$/, { message: "Organisation code must be a 4-digit number (0001-9999)." })
  code?: string;

  @ApiProperty({ example: "Indian/Maldives" })
  @IsString()
  timezone!: string;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(7)
  weekStartDay?: number;

  @ApiPropertyOptional({ example: "Admin Manager" })
  @IsOptional()
  @IsString()
  adminName?: string;

  @ApiPropertyOptional({ example: "manager@sunset.com" })
  @IsOptional()
  @IsEmail()
  adminEmail?: string;

  @ApiPropertyOptional({ example: "sunsetadmin" })
  @IsOptional()
  @IsString()
  adminUsername?: string;

  @ApiPropertyOptional({ example: "Password123!" })
  @IsOptional()
  @IsString()
  @MinLength(8)
  adminPassword?: string;
}
