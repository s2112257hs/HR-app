import { Global, Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { TenantEntityService } from "./services/tenant-entity.service";
import { UserProvisioningService } from "./services/user-provisioning.service";

@Global()
@Module({
  imports: [PrismaModule],
  providers: [TenantEntityService, UserProvisioningService],
  exports: [TenantEntityService, UserProvisioningService]
})
export class CommonModule {}
