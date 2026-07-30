import { ApiProperty } from "@nestjs/swagger";
import { UserRole } from "@prisma/client";
import { IsEmail, IsEnum, IsString, MinLength } from "class-validator";

export class CreateUserDto {
  @ApiProperty({ example: "Roster Manager" })
  @IsString()
  name!: string;

  @ApiProperty({ example: "manager@example.com" })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: "manager123" })
  @IsString()
  @MinLength(8)
  password!: string;

  @ApiProperty({ enum: UserRole })
  @IsEnum(UserRole)
  role!: UserRole;
}

