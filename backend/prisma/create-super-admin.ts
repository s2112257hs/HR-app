import { PrismaClient, UserRole } from "@prisma/client";
import * as bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const organisation = await getExistingOrganisation();
  const email = requiredEnv("SUPERADMIN_EMAIL", "SEED_SUPERADMIN_EMAIL").toLowerCase();
  const username = requiredEnv("SUPERADMIN_USERNAME", "SEED_SUPERADMIN_USERNAME").toLowerCase();
  const password = requiredEnv("SUPERADMIN_PASSWORD", "SEED_SUPERADMIN_PASSWORD");
  const name = optionalEnv("SUPERADMIN_NAME") ?? "System Super Admin";

  const matchingUsers = await prisma.user.findMany({
    where: {
      organisationId: organisation.id,
      OR: [{ email }, { username }]
    },
    orderBy: { createdAt: "asc" }
  });
  const matchingUserIds = new Set(matchingUsers.map((user) => user.id));

  if (matchingUserIds.size > 1) {
    throw new Error(`Cannot create super admin. Email ${email} and username ${username} belong to different users in property ${organisation.code}.`);
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const user = matchingUsers[0]
    ? await prisma.user.update({
        where: { id: matchingUsers[0].id },
        data: {
          name,
          username,
          email,
          passwordHash,
          role: UserRole.ADMIN,
          isSuperAdmin: true,
          isActive: true
        }
      })
    : await prisma.user.create({
        data: {
          organisationId: organisation.id,
          name,
          username,
          email,
          passwordHash,
          role: UserRole.ADMIN,
          isSuperAdmin: true
        }
      });

  await prisma.userMembership.upsert({
    where: {
      userId_organisationId: {
        userId: user.id,
        organisationId: organisation.id
      }
    },
    create: {
      userId: user.id,
      organisationId: organisation.id,
      role: UserRole.ADMIN
    },
    update: {
      role: UserRole.ADMIN,
      isActive: true
    }
  });

  console.log(`Super admin ready: ${user.email} (${user.id}) in property [${organisation.code}] ${organisation.name}.`);
}

async function getExistingOrganisation() {
  const organisationId = optionalEnv("SUPERADMIN_ORG_ID", "SEED_SUPERADMIN_ORG_ID");
  const organisationCode = optionalEnv("SUPERADMIN_ORG_CODE", "SEED_SUPERADMIN_ORG_CODE");

  if (organisationId) {
    const organisation = await prisma.organisation.findUnique({ where: { id: organisationId } });

    if (!organisation) {
      throw new Error(`No existing property found for SUPERADMIN_ORG_ID=${organisationId}.`);
    }

    return organisation;
  }

  if (!organisationCode) {
    throw new Error("SUPERADMIN_ORG_CODE or SUPERADMIN_ORG_ID is required. Use an existing production property.");
  }

  const organisation = await prisma.organisation.findUnique({ where: { code: organisationCode } });

  if (!organisation) {
    throw new Error(`No existing property found for SUPERADMIN_ORG_CODE=${organisationCode}. This script will not create a property.`);
  }

  return organisation;
}

function requiredEnv(name: string, fallbackName?: string) {
  const value = optionalEnv(name, fallbackName);

  if (!value) {
    throw new Error(`${name}${fallbackName ? ` or ${fallbackName}` : ""} is required.`);
  }

  return value;
}

function optionalEnv(name: string, fallbackName?: string) {
  return process.env[name]?.trim() || (fallbackName ? process.env[fallbackName]?.trim() : undefined);
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
