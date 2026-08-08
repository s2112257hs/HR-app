import { PrismaClient, UserRole } from "@prisma/client";
import * as bcrypt from "bcryptjs";

const prisma = new PrismaClient();
const organisationName = process.env.SEED_ORGANISATION_NAME ?? "Demo Resort";
const organisationTimezone = process.env.SEED_TIMEZONE ?? "Indian/Maldives";
const adminEmail = process.env.SEED_ADMIN_EMAIL ?? "admin@example.com";
const adminUsername = process.env.SEED_ADMIN_USERNAME ?? "admin";
const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? "admin123";

const superadminEmail = process.env.SEED_SUPERADMIN_EMAIL ?? "superadmin@example.com";
const superadminUsername = process.env.SEED_SUPERADMIN_USERNAME ?? "superadmin";
const superadminPassword = process.env.SEED_SUPERADMIN_PASSWORD ?? "superadmin123";

async function main() {
  const organisation = await prisma.organisation.upsert({
    where: { id: "00000000-0000-4000-8000-000000000001" },
    create: {
      id: "00000000-0000-4000-8000-000000000001",
      code: "0001",
      name: organisationName,
      timezone: organisationTimezone,
      weekStartDay: 1
    },
    update: {
      code: "0001",
      name: organisationName,
      timezone: organisationTimezone,
      weekStartDay: 1
    }
  });

  const superadmin = await prisma.user.upsert({
    where: {
      organisationId_email: {
        organisationId: organisation.id,
        email: superadminEmail
      }
    },
    create: {
      organisationId: organisation.id,
      name: "System Super Admin",
      username: superadminUsername.trim().toLowerCase(),
      email: superadminEmail,
      passwordHash: await bcrypt.hash(superadminPassword, 12),
      role: UserRole.ADMIN,
      isSuperAdmin: true
    },
    update: {
      name: "System Super Admin",
      username: superadminUsername.trim().toLowerCase(),
      role: UserRole.ADMIN,
      isSuperAdmin: true,
      isActive: true
    }
  });

  const admin = await prisma.user.upsert({
    where: {
      organisationId_email: {
        organisationId: organisation.id,
        email: adminEmail
      }
    },
    create: {
      organisationId: organisation.id,
      name: "Admin User",
      username: adminUsername.trim().toLowerCase(),
      email: adminEmail,
      passwordHash: await bcrypt.hash(adminPassword, 12),
      role: UserRole.ADMIN,
      isSuperAdmin: false
    },
    update: {
      name: "Admin User",
      username: adminUsername.trim().toLowerCase(),
      role: UserRole.ADMIN,
      isActive: true
    }
  });

  // Provision memberships
  await prisma.userMembership.upsert({
    where: {
      userId_organisationId: {
        userId: superadmin.id,
        organisationId: organisation.id
      }
    },
    create: {
      userId: superadmin.id,
      organisationId: organisation.id,
      role: UserRole.ADMIN
    },
    update: {
      role: UserRole.ADMIN,
      isActive: true
    }
  });

  await prisma.userMembership.upsert({
    where: {
      userId_organisationId: {
        userId: admin.id,
        organisationId: organisation.id
      }
    },
    create: {
      userId: admin.id,
      organisationId: organisation.id,
      role: UserRole.ADMIN
    },
    update: {
      role: UserRole.ADMIN,
      isActive: true
    }
  });

  const departments = [
    { name: "Front Office", shortCode: "FO", colourHex: "#2563EB" },
    { name: "Restaurant", shortCode: "REST", colourHex: "#D1495B" },
    { name: "Housekeeping", shortCode: "HK", colourHex: "#0F766E" }
  ];

  for (const [index, department] of departments.entries()) {
    await prisma.department.upsert({
      where: {
        organisationId_shortCode: {
          organisationId: organisation.id,
          shortCode: department.shortCode
        }
      },
      create: {
        organisationId: organisation.id,
        displayOrder: index + 1,
        ...department
      },
      update: {
        displayOrder: index + 1,
        ...department,
        isActive: true,
        deletedAt: null
      }
    });
  }

  const employees = [
    { employeeNumber: "E-1001", firstName: "Ahmed", lastName: "Ali", preferredName: "Ahmed Ali", phone: "+960 700 1001" },
    { employeeNumber: "E-1002", firstName: "Sara", lastName: "Hassan", preferredName: "Sara Hassan", phone: "+960 700 1002" },
    { employeeNumber: "E-1003", firstName: "Mohamed", lastName: "Rasheed", preferredName: "Mohamed", phone: "+960 700 1003" }
  ];

  for (const [index, employee] of employees.entries()) {
    await prisma.employee.upsert({
      where: {
        organisationId_employeeNumber: {
          organisationId: organisation.id,
          employeeNumber: employee.employeeNumber
        }
      },
      create: {
        organisationId: organisation.id,
        displayOrder: index + 1,
        employmentType: "Full time",
        ...employee
      },
      update: {
        displayOrder: index + 1,
        employmentType: "Full time",
        ...employee,
        isActive: true,
        deletedAt: null
      }
    });
  }

  const [frontOffice, restaurant] = await Promise.all([
    prisma.department.findFirstOrThrow({ where: { organisationId: organisation.id, shortCode: "FO" } }),
    prisma.department.findFirstOrThrow({ where: { organisationId: organisation.id, shortCode: "REST" } })
  ]);
  const employee = await prisma.employee.findFirstOrThrow({ where: { organisationId: organisation.id, employeeNumber: "E-1001" } });

  await prisma.shift.createMany({
    data: [
      {
        organisationId: organisation.id,
        employeeId: employee.id,
        departmentId: frontOffice.id,
        startAt: new Date("2026-08-20T08:00:00+05:00"),
        endAt: new Date("2026-08-20T12:00:00+05:00"),
        unpaidBreakMinutes: 0,
        overtimeMinutes: 0,
        createdByUserId: admin.id,
        updatedByUserId: admin.id
      },
      {
        organisationId: organisation.id,
        employeeId: employee.id,
        departmentId: restaurant.id,
        startAt: new Date("2026-08-20T10:00:00+05:00"),
        endAt: new Date("2026-08-20T14:00:00+05:00"),
        unpaidBreakMinutes: 30,
        overtimeMinutes: 0,
        createdByUserId: admin.id,
        updatedByUserId: admin.id
      }
    ],
    skipDuplicates: true
  });
}

main()
  .finally(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
