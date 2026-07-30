import { IsDateString, IsOptional, IsUUID } from "class-validator";

export class CheckOverlapDto {
  @IsUUID()
  employeeId!: string;

  @IsDateString()
  startAt!: string;

  @IsDateString()
  endAt!: string;

  @IsOptional()
  @IsUUID()
  excludeShiftId?: string | null;
}

