import { ApiProperty } from "@nestjs/swagger";
import { IsString, Matches } from "class-validator";

export class UpdateOrganisationCodeDto {
  @ApiProperty({ example: "0005" })
  @IsString()
  @Matches(/^\d{4}$/, { message: "Organisation code must be a 4-digit number (0001-9999)." })
  code!: string;
}
