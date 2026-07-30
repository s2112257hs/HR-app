import { PartialType } from "@nestjs/swagger";
import { CreateValidationRuleDto } from "./create-validation-rule.dto";

export class UpdateValidationRuleDto extends PartialType(CreateValidationRuleDto) {}
