import { ApiProperty } from "@nestjs/swagger";
import { UserRole } from "@prisma/client";
import { IsIn, IsUUID } from "class-validator";
import { TENANT_ROLES } from "../../common/auth/tenant-roles";

export class CreateMembershipDto {
  @ApiProperty({ example: "00000000-0000-4000-8000-000000000002" })
  @IsUUID()
  userId!: string;

  @ApiProperty({ example: "00000000-0000-4000-8000-000000000001" })
  @IsUUID()
  organisationId!: string;

  @ApiProperty({ enum: TENANT_ROLES, example: UserRole.ROSTER_MANAGER })
  @IsIn(TENANT_ROLES)
  role!: UserRole;
}
