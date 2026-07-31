import { Module } from "@nestjs/common";
import { PrismaModule } from "../prisma/prisma.module";
import { RosterLocksService } from "./roster-locks.service";

@Module({
  imports: [PrismaModule],
  providers: [RosterLocksService],
  exports: [RosterLocksService]
})
export class RosterLocksModule {}
