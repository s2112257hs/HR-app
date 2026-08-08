import { PrismaClient, UserRole } from "@prisma/client";
import type { User } from "@prisma/client";
import * as bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const bootstrapOrganisationId = "00000000-0000-4000-8000-000000000001";
const bootstrapOrganisationCode = process.env.SEED_SUPERADMIN_ORG_CODE?.trim();
const bootstrapOrganisationName = process.env.SEED_SUPERADMIN_ORG_NAME?.trim() || "System";
const bootstrapOrganisationTimezone = process.env.SEED_TIMEZONE?.trim() || "UTC";

const superadminEmail = seedValue("SEED_SUPERADMIN_EMAIL", "superadmin@example.com").toLowerCase();
const superadminUsername = seedValue("SEED_SUPERADMIN_USERNAME", "superadmin").toLowerCase();
const superadminPassword = seedValue("SEED_SUPERADMIN_PASSWORD", "superadmin123");

async function main() {
  const organisation = await ensureBootstrapOrganisation();
  const superadmin = await ensureSuperadmin(organisation.id);

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
}

async function ensureBootstrapOrganisation() {
  if (bootstrapOrganisationCode) {
    const organisationByCode = await prisma.organisation.findUnique({
      where: { code: bootstrapOrganisationCode }
    });

    if (!organisationByCode) {
      throw new Error(`No existing property found for SEED_SUPERADMIN_ORG_CODE=${bootstrapOrganisationCode}.`);
    }

    return organisationByCode;
  }

  const existing = await prisma.organisation.findUnique({
    where: { id: bootstrapOrganisationId }
  });

  if (existing) {
    return existing;
  }

  const firstExisting = await prisma.organisation.findFirst({
    orderBy: { createdAt: "asc" }
  });

  if (firstExisting) {
    return firstExisting;
  }

  return prisma.organisation.create({
    data: {
      id: bootstrapOrganisationId,
      code: "0001",
      name: bootstrapOrganisationName,
      timezone: bootstrapOrganisationTimezone,
      weekStartDay: 1
    }
  });
}

async function ensureSuperadmin(organisationId: string): Promise<User> {
  const existingSuperadmin = await prisma.user.findFirst({
    where: { isSuperAdmin: true },
    orderBy: { createdAt: "asc" }
  });

  if (existingSuperadmin) {
    return prisma.user.update({
      where: { id: existingSuperadmin.id },
      data: {
        role: UserRole.ADMIN,
        isSuperAdmin: true,
        isActive: true
      }
    });
  }

  const seedUser = await prisma.user.findUnique({
    where: {
      organisationId_email: {
        organisationId,
        email: superadminEmail
      }
    }
  });
  const passwordHash = await bcrypt.hash(superadminPassword, 12);

  if (seedUser) {
    return prisma.user.update({
      where: { id: seedUser.id },
      data: {
        name: "System Super Admin",
        username: superadminUsername,
        passwordHash,
        role: UserRole.ADMIN,
        isSuperAdmin: true,
        isActive: true
      }
    });
  }

  return prisma.user.create({
    data: {
      organisationId,
      name: "System Super Admin",
      username: superadminUsername,
      email: superadminEmail,
      passwordHash,
      role: UserRole.ADMIN,
      isSuperAdmin: true
    }
  });
}

function seedValue(name: string, fallback: string) {
  const value = process.env[name]?.trim();

  if (value) {
    return value;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error(`${name} is required when seeding production.`);
  }

  return fallback;
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
