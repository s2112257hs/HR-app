import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { AuditModule } from "./audit/audit.module";
import { AuthModule } from "./auth/auth.module";
import { CommonModule } from "./common/common.module";
import { DayMarkersModule } from "./day-markers/day-markers.module";
import { DepartmentsModule } from "./departments/departments.module";
import { EmployeesModule } from "./employees/employees.module";
import { PrismaModule } from "./prisma/prisma.module";
import { RosterModule } from "./roster/roster.module";
import { SettingsModule } from "./settings/settings.module";
import { ShiftsModule } from "./shifts/shifts.module";
import { SuperAdminModule } from "./super-admin/super-admin.module";
import { UsersModule } from "./users/users.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    CommonModule,
    AuditModule,
    AuthModule,
    UsersModule,
    EmployeesModule,
    DepartmentsModule,
    DayMarkersModule,
    ShiftsModule,
    SettingsModule,
    RosterModule,
    SuperAdminModule
  ]
})
export class AppModule {}
