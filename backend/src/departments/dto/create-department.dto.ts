import { ApiProperty } from "@nestjs/swagger";
import { IsString, Matches, MaxLength } from "class-validator";

export class CreateDepartmentDto {
  @ApiProperty({ example: "Front Office" })
  @IsString()
  @MaxLength(100)
  name!: string;

  @ApiProperty({ example: "FO" })
  @IsString()
  @MaxLength(10)
  shortCode!: string;

  @ApiProperty({ example: "#2563EB" })
  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6}$/)
  colourHex!: string;
}

