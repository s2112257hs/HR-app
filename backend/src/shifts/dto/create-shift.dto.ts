import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsBoolean, IsDateString, IsInt, IsOptional, IsString, IsUUID, Min } from "class-validator";

export class CreateShiftDto {
  @IsUUID()
  employeeId!: string;

  @IsUUID()
  departmentId!: string;

  @IsDateString()
  startAt!: string;

  @IsDateString()
  endAt!: string;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  unpaidBreakMinutes?: number;

  @ApiPropertyOptional({ default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  overtimeMinutes?: number;

  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  overlapAcknowledged?: boolean;
}
