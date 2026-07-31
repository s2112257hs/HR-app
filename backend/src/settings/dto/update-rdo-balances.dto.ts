import { Type } from "class-transformer";
import { IsArray, IsInt, IsUUID, ValidateNested } from "class-validator";

class RdoBalanceItemDto {
  @IsUUID()
  employeeId!: string;

  @IsInt()
  rdoBalanceBroughtForward!: number;
}

export class UpdateRdoBalancesDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RdoBalanceItemDto)
  balances!: RdoBalanceItemDto[];
}
