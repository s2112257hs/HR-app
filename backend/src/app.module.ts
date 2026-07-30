import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AuditModule } from "./audit/audit.module";
import { AuthModule } from "./auth/auth.module";
import { DayMarkersModule } from "./day-markers/day-markers.module";
import { DepartmentsModule } from "./departments/departments.module";
import { EmployeesModule } from "./employees/employees.module";
import { PrismaModule } from "./prisma/prisma.module";
import { RosterModule } from "./roster/roster.module";
import { SettingsModule } from "./settings/settings.module";
import { ShiftsModule } from "./shifts/shifts.module";
import { UsersModule } from "./users/users.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuditModule,
    AuthModule,
    UsersModule,
    EmployeesModule,
    DepartmentsModule,
    DayMarkersModule,
    ShiftsModule,
    SettingsModule,
    RosterModule
  ]
})
export class AppModule {}
