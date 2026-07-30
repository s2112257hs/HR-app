import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { RosterController } from "./roster.controller";
import { RosterService } from "./roster.service";

@Module({
  imports: [AuditModule],
  controllers: [RosterController],
  providers: [RosterService]
})
export class RosterModule {}
