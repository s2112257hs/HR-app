import { ConflictException, Injectable } from "@nestjs/common";
import { Prisma, UserRole } from "@prisma/client";
import * as bcrypt from "bcryptjs";
import { PrismaService } from "../../prisma/prisma.service";

const PROVISIONED_USER_SELECT = {
  id: true,
  organisationId: true,
  name: true,
  username: true,
  email: true,
  role: true,
  isActive: true,
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true
} satisfies Prisma.UserSelect;

export type ProvisionedUser = Prisma.UserGetPayload<{ select: typeof PROVISIONED_USER_SELECT }>;

export type ProvisionUserInput = {
  organisationId: string;
  name: string;
  username?: string | null;
  email: string;
  password: string;
  role: UserRole;
  isSuperAdmin?: boolean;
};

@Injectable()
export class UserProvisioningService {
  constructor(private readonly prisma: PrismaService) {}

  async createUserWithMembership(input: ProvisionUserInput): Promise<ProvisionedUser> {
    return this.prisma.$transaction((tx) => this.createUserWithMembershipInTransaction(tx, input));
  }

  async createUserWithMembershipInTransaction(tx: Prisma.TransactionClient, input: ProvisionUserInput): Promise<ProvisionedUser> {
    const user = await tx.user.create({
      data: {
        organisationId: input.organisationId,
        name: input.name.trim(),
        username: this.normaliseOptionalUsername(input.username) ?? null,
        email: this.normaliseEmail(input.email),
        passwordHash: await this.hashPassword(input.password),
        role: input.role,
        isSuperAdmin: input.isSuperAdmin ?? false
      },
      select: PROVISIONED_USER_SELECT
    });

    await tx.userMembership.create({
      data: {
        userId: user.id,
        organisationId: input.organisationId,
        role: input.role
      }
    });

    return user;
  }

  async upsertMembership(userId: string, organisationId: string, role: UserRole) {
    return this.prisma.userMembership.upsert(this.membershipUpsertArgs(userId, organisationId, role));
  }

  async upsertMembershipWithDetails(userId: string, organisationId: string, role: UserRole) {
    return this.prisma.userMembership.upsert({
      ...this.membershipUpsertArgs(userId, organisationId, role),
      include: {
        organisation: { select: { id: true, code: true, name: true } },
        user: { select: { id: true, email: true, name: true } }
      }
    });
  }

  normaliseEmail(email: string) {
    return email.trim().toLowerCase();
  }

  normaliseOptionalUsername(value?: string | null): string | null | undefined {
    if (value === undefined) {
      return undefined;
    }
    if (value === null) {
      return null;
    }

    const trimmed = value.trim().toLowerCase();
    return trimmed.length > 0 ? trimmed : null;
  }

  hashPassword(password: string) {
    return bcrypt.hash(password, 12);
  }

  throwFriendlyUniqueUserError(error: unknown, scope?: string) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") {
      return;
    }

    const target = Array.isArray(error.meta?.target) ? error.meta.target.join(",") : String(error.meta?.target ?? "");
    const suffix = scope ? ` for ${scope}` : "";
    if (target.includes("username")) {
      throw new ConflictException({
        error: "UNIQUE_CONSTRAINT",
        message: `Username is already in use${suffix}.`,
        fields: { username: `Username is already in use${suffix}.` }
      });
    }

    throw new ConflictException({
      error: "UNIQUE_CONSTRAINT",
      message: `Email is already in use${suffix}.`,
      fields: { email: `Email is already in use${suffix}.` }
    });
  }

  private membershipUpsertArgs(userId: string, organisationId: string, role: UserRole): Pick<Prisma.UserMembershipUpsertArgs, "where" | "create" | "update"> {
    return {
      where: {
        userId_organisationId: {
          userId,
          organisationId
        }
      },
      create: {
        userId,
        organisationId,
        role
      },
      update: {
        role,
        isActive: true
      }
    };
  }
}
