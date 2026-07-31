import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { PrismaModule } from "../prisma/prisma.module";
import { RosterLocksModule } from "../roster-locks/roster-locks.module";
import { DayMarkersController } from "./day-markers.controller";
import { DayMarkersService } from "./day-markers.service";

@Module({
  imports: [PrismaModule, AuditModule, RosterLocksModule],
  controllers: [DayMarkersController],
  providers: [DayMarkersService],
  exports: [DayMarkersService]
})
export class DayMarkersModule {}
