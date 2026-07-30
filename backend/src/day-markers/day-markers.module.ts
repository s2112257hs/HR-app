import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { PrismaModule } from "../prisma/prisma.module";
import { DayMarkersController } from "./day-markers.controller";
import { DayMarkersService } from "./day-markers.service";

@Module({
  imports: [PrismaModule, AuditModule],
  controllers: [DayMarkersController],
  providers: [DayMarkersService],
  exports: [DayMarkersService]
})
export class DayMarkersModule {}
