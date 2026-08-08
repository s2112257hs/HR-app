import { ApiProperty } from "@nestjs/swagger";
import { UserRole } from "@prisma/client";
import { IsEmail, IsIn, IsOptional, IsString, IsUUID, Matches, MaxLength, MinLength } from "class-validator";
import { TENANT_ROLES } from "../../common/auth/tenant-roles";

export class CreateUserDto {
  @ApiProperty({ example: "4a280f10-3a62-4c33-a81f-88d8dcaa018e", required: false })
  @IsOptional()
  @IsUUID()
  organisationId?: string;

  @ApiProperty({ example: "Roster Manager" })
  @IsString()
  name!: string;

  @ApiProperty({ example: "manager" })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  @Matches(/^[a-zA-Z0-9._-]+$/, { message: "Username can only contain letters, numbers, dots, underscores and hyphens." })
  username?: string | null;

  @ApiProperty({ example: "manager@example.com" })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: "manager123" })
  @IsString()
  @MinLength(8)
  password!: string;

  @ApiProperty({ enum: TENANT_ROLES })
  @IsIn(TENANT_ROLES)
  role!: UserRole;
}
