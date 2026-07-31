import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { RosterLocksModule } from "../roster-locks/roster-locks.module";
import { RosterController } from "./roster.controller";
import { RosterService } from "./roster.service";

@Module({
  imports: [AuditModule, RosterLocksModule],
  controllers: [RosterController],
  providers: [RosterService]
})
export class RosterModule {}
