import { IsBoolean, IsDateString, IsOptional, IsUUID } from "class-validator";

export class CopyWeeklyCellDto {
  @IsUUID()
  employeeId!: string;

  @IsDateString()
  sourceDate!: string;

  @IsDateString()
  targetStartDate!: string;

  @IsDateString()
  targetEndDate!: string;

  @IsOptional()
  @IsBoolean()
  replaceExisting?: boolean;
}
