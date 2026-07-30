import { PartialType } from "@nestjs/swagger";
import { IsInt, Min } from "class-validator";
import { CreateShiftDto } from "./create-shift.dto";

export class UpdateShiftDto extends PartialType(CreateShiftDto) {
  @IsInt()
  @Min(1)
  version!: number;
}

