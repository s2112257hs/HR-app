import { ApiProperty } from "@nestjs/swagger";
import { IsOptional, IsString, MinLength } from "class-validator";

export class LoginDto {
  @ApiProperty({ example: "admin@example.com" })
  @IsOptional()
  @IsString()
  email?: string;

  @ApiProperty({ example: "admin" })
  @IsOptional()
  @IsString()
  login?: string;

  @ApiProperty({ example: "admin123" })
  @IsString()
  @MinLength(8)
  password!: string;
}
