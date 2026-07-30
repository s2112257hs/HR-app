import { Type } from "class-transformer";
import { IsInt, IsNotEmpty, IsString, IsUUID, Matches, MaxLength, Min } from "class-validator";

const TIME_MESSAGE = "Time must use HH:mm format.";

export class CreateValidationRuleDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name!: string;

  @IsUUID()
  departmentId!: string;

  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: TIME_MESSAGE })
  startTime!: string;

  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: TIME_MESSAGE })
  endTime!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  minimumStaff!: number;
}
