import { ApiPropertyOptional } from "@nestjs/swagger";
import { IsBoolean, IsDateString, IsOptional, Matches } from "class-validator";

export class CopyDailyScheduleDto {
  @IsDateString()
  sourceDate!: string;

  @IsDateString()
  targetStartDate!: string;

  @IsDateString()
  targetEndDate!: string;

  @ApiPropertyOptional({ default: "00:00" })
  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  startTime?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  overlapAcknowledged?: boolean;
}
