import { DayMarkerType } from "@prisma/client";
import { IsDateString, IsEnum, IsOptional, IsString, IsUUID, MaxLength } from "class-validator";

export class SetDayMarkerDto {
  @IsUUID()
  employeeId!: string;

  @IsDateString()
  date!: string;

  @IsEnum(DayMarkerType)
  type!: DayMarkerType;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
