import { IsArray, IsUUID } from "class-validator";

export class ReorderDepartmentsDto {
  @IsArray()
  @IsUUID("4", { each: true })
  departmentIds!: string[];
}

