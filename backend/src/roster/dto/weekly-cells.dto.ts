import { DayMarkerType } from "@prisma/client";
import { Type } from "class-transformer";
import { IsArray, IsDateString, IsEnum, IsInt, IsOptional, IsString, IsUUID, Min, ValidateNested } from "class-validator";

export class WeeklyCellKeyDto {
  @IsUUID()
  employeeId!: string;

  @IsDateString()
  date!: string;
}

class WeeklyCellMarkerDto {
  @IsEnum(DayMarkerType)
  type!: DayMarkerType;

  @IsOptional()
  @IsString()
  notes?: string | null;
}

class WeeklyCellShiftDto {
  @IsUUID()
  departmentId!: string;

  @IsDateString()
  startAt!: string;

  @IsDateString()
  endAt!: string;

  @IsInt()
  @Min(0)
  unpaidBreakMinutes!: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  overtimeMinutes?: number;

  @IsOptional()
  @IsString()
  notes?: string | null;
}

export class ClearWeeklyCellsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WeeklyCellKeyDto)
  cells!: WeeklyCellKeyDto[];
}

export class WeeklyCellSnapshotDto extends WeeklyCellKeyDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => WeeklyCellMarkerDto)
  marker?: WeeklyCellMarkerDto | null;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WeeklyCellShiftDto)
  shifts!: WeeklyCellShiftDto[];
}

export class RestoreWeeklyCellsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => WeeklyCellSnapshotDto)
  cells!: WeeklyCellSnapshotDto[];
}
