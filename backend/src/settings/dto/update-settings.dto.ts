import { IsDateString } from "class-validator";

export class UpdateSettingsDto {
  @IsDateString()
  rdoTrackingStartDate!: string;
}
