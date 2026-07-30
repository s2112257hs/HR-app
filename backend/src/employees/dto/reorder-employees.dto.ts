import { IsArray, IsUUID } from "class-validator";

export class ReorderEmployeesDto {
  @IsArray()
  @IsUUID("4", { each: true })
  employeeIds!: string[];
}

