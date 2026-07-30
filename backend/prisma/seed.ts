import { PrismaClient, UserRole } from "@prisma/client";
import * as bcrypt from "bcryptjs";

const prisma = new PrismaClient();
const organisationName = process.env.SEED_ORGANISATION_NAME ?? "Demo Resort";
const organisationTimezone = process.env.SEED_TIMEZONE ?? "Indian/Maldives";
const adminEmail = process.env.SEED_ADMIN_EMAIL ?? "admin@example.com";
const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? "admin123";

async function main() {
  const organisation = await prisma.organisation.upsert({
    where: { id: "00000000-0000-4000-8000-000000000001" },
    create: {
      id: "00000000-0000-4000-8000-000000000001",
      name: organisationName,
      timezone: organisationTimezone
    },
    update: {
      name: organisationName,
      timezone: organisationTimezone
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
      email: adminEmail,
      passwordHash: await bcrypt.hash(adminPassword, 12),
      role: UserRole.ADMIN
    },
    update: {
      name: "Admin User",
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
