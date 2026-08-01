import { IsDateString, IsInt, Max, Min } from "class-validator";

export class UpdateSettingsDto {
  @IsDateString()
  rdoTrackingStartDate!: string;

  @IsInt()
  @Min(1)
  @Max(7)
  weekStartDay!: number;
}
