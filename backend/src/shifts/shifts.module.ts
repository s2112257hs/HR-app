import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { RosterLocksModule } from "../roster-locks/roster-locks.module";
import { ShiftsController } from "./shifts.controller";
import { ShiftsService } from "./shifts.service";

@Module({
  imports: [AuditModule, RosterLocksModule],
  controllers: [ShiftsController],
  providers: [ShiftsService],
  exports: [ShiftsService]
})
export class ShiftsModule {}
