import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, UserRole } from "@prisma/client";
import { UserProvisioningService } from "../common/services/user-provisioning.service";
import { PrismaService } from "../prisma/prisma.service";
import { CreateMembershipDto } from "./dto/create-membership.dto";
import { CreateOrganisationDto } from "./dto/create-organisation.dto";
import { CreatePropertyAdminDto } from "./dto/create-property-admin.dto";
import { UpdateOrganisationCodeDto } from "./dto/update-organisation-code.dto";

@Injectable()
export class SuperAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly userProvisioningService: UserProvisioningService
  ) {}

  async listOrganisations() {
    const organisations = await this.prisma.organisation.findMany({
      orderBy: { createdAt: "asc" },
      include: {
        _count: {
          select: {
            users: true,
            employees: true,
            departments: true,
            shifts: true
          }
        }
      }
    });

    return organisations.map((org) => ({
      id: org.id,
      code: org.code,
      name: org.name,
      timezone: org.timezone,
      weekStartDay: org.weekStartDay,
      createdAt: org.createdAt,
      stats: {
        usersCount: org._count.users,
        employeesCount: org._count.employees,
        departmentsCount: org._count.departments,
        shiftsCount: org._count.shifts
      }
    }));
  }

  async listUsers() {
    const users = await this.prisma.user.findMany({
      where: { isSuperAdmin: false },
      orderBy: [{ name: "asc" }, { email: "asc" }],
      include: {
        organisation: { select: { id: true, code: true, name: true } },
        memberships: {
          where: { isActive: true },
          include: { organisation: { select: { id: true, code: true, name: true } } },
          orderBy: { createdAt: "asc" }
        }
      }
    });

    return users.map((user) => ({
      id: user.id,
      name: user.name,
      username: user.username,
      email: user.email,
      role: user.role,
      isActive: user.isActive,
      primaryOrganisation: user.organisation,
      memberships: user.memberships.map((membership) => ({
        organisation: membership.organisation,
        role: membership.role,
        isActive: membership.isActive
      }))
    }));
  }

  async createOrganisation(dto: CreateOrganisationDto) {
    let code = dto.code?.trim();
    const adminName = dto.adminName?.trim();
    const adminEmail = dto.adminEmail?.trim();
    const adminUsername = dto.adminUsername?.trim();
    const adminPassword = dto.adminPassword;
    const adminFields = [adminName, adminEmail, adminUsername, adminPassword];
    const hasAnyAdminField = adminFields.some((value) => Boolean(value));
    const hasAllAdminFields = Boolean(adminName && adminEmail && adminPassword);

    if (hasAnyAdminField && !hasAllAdminFields) {
      throw new BadRequestException({
        error: "VALIDATION_ERROR",
        message: "The request contains invalid information.",
        fields: {
          adminName: "Admin name, email, and password are all required when creating an initial admin."
        }
      });
    }

    if (code) {
      const existing = await this.prisma.organisation.findUnique({ where: { code } });
      if (existing) {
        throw new ConflictException(`Organisation code "${code}" is already in use.`);
      }
    } else {
      code = await this.generateNextCode();
    }

    const name = dto.name.trim();

    const created = await this.prisma.$transaction(async (tx) => {
      const organisation = await tx.organisation.create({
        data: {
          code,
          name,
          timezone: dto.timezone.trim(),
          weekStartDay: dto.weekStartDay ?? 1
        }
      });

      const adminUser = hasAllAdminFields
        ? await this.userProvisioningService.createUserWithMembershipInTransaction(tx, {
            organisationId: organisation.id,
            name: adminName!,
            email: adminEmail!,
            username: adminUsername,
            password: adminPassword!,
            role: UserRole.ADMIN
          })
        : null;

      // Default departments
      const defaultDepartments = [
        { name: "Front Office", shortCode: "FO", colourHex: "#2563EB", displayOrder: 1 },
        { name: "Restaurant", shortCode: "REST", colourHex: "#D1495B", displayOrder: 2 },
        { name: "Housekeeping", shortCode: "HK", colourHex: "#0F766E", displayOrder: 3 }
      ];

      for (const dept of defaultDepartments) {
        await tx.department.create({
          data: {
            organisationId: organisation.id,
            ...dept
          }
        });
      }

      return { organisation, adminUser };
    });

    return {
      organisation: {
        id: created.organisation.id,
        code: created.organisation.code,
        name: created.organisation.name,
        timezone: created.organisation.timezone,
        weekStartDay: created.organisation.weekStartDay
      },
      adminUser: created.adminUser
        ? {
            id: created.adminUser.id,
            email: created.adminUser.email,
            name: created.adminUser.name,
            role: created.adminUser.role
          }
        : null
    };
  }

  async updateOrganisationCode(id: string, dto: UpdateOrganisationCodeDto) {
    const org = await this.prisma.organisation.findUnique({ where: { id } });
    if (!org) {
      throw new NotFoundException("Organisation not found.");
    }

    const newCode = dto.code.trim();
    const existing = await this.prisma.organisation.findFirst({
      where: { code: newCode, id: { not: id } }
    });

    if (existing) {
      throw new ConflictException(`Organisation code "${newCode}" is already in use by another organisation.`);
    }

    return this.prisma.organisation.update({
      where: { id },
      data: { code: newCode },
      select: { id: true, code: true, name: true, timezone: true }
    });
  }

  async createAdmin(dto: CreatePropertyAdminDto) {
    const organisation = await this.prisma.organisation.findUnique({
      where: { id: dto.organisationId }
    });

    if (!organisation) {
      throw new NotFoundException("Property not found.");
    }

    try {
      const adminUser = await this.prisma.$transaction(async (tx) => {
        const user = await this.userProvisioningService.createUserWithMembershipInTransaction(tx, {
          organisationId: organisation.id,
          name: dto.name,
          email: dto.email,
          username: dto.username,
          password: dto.password,
          role: UserRole.ADMIN
        });

        return user;
      });

      return {
        id: adminUser.id,
        name: adminUser.name,
        username: adminUser.username,
        email: adminUser.email,
        role: adminUser.role,
        organisation: {
          id: organisation.id,
          code: organisation.code,
          name: organisation.name
        }
      };
    } catch (error) {
      this.userProvisioningService.throwFriendlyUniqueUserError(error, "this property");
      throw error;
    }
  }

  async createMembership(dto: CreateMembershipDto) {
    const user = await this.prisma.user.findUnique({ where: { id: dto.userId } });
    if (!user) {
      throw new NotFoundException("User not found.");
    }

    const organisation = await this.prisma.organisation.findUnique({ where: { id: dto.organisationId } });
    if (!organisation) {
      throw new NotFoundException("Organisation not found.");
    }

    await this.assertNoTargetIdentityConflict(user, organisation);

    return this.userProvisioningService.upsertMembershipWithDetails(dto.userId, dto.organisationId, dto.role);
  }

  async updateCredentials(currentUser: { sub: string }, dto: { username?: string; newPassword?: string }) {
    const user = await this.prisma.user.findUnique({ where: { id: currentUser.sub } });
    if (!user || !user.isSuperAdmin) {
      throw new BadRequestException("Only the Super Admin can update Super Admin credentials.");
    }

    const data: Prisma.UserUpdateInput = {};
    const username = this.userProvisioningService.normaliseOptionalUsername(dto.username);
    if (username) {
      data.username = username;
    }
    if (dto.newPassword) {
      data.passwordHash = await this.userProvisioningService.hashPassword(dto.newPassword);
    }

    if (Object.keys(data).length === 0) {
      throw new BadRequestException({
        error: "VALIDATION_ERROR",
        message: "The request contains invalid information.",
        fields: {
          root: "Enter a new username or password to update."
        }
      });
    }

    try {
      const updated = await this.prisma.user.update({
        where: { id: user.id },
        data,
        select: {
          id: true,
          name: true,
          username: true,
          email: true,
          role: true,
          isSuperAdmin: true
        }
      });

      return { ok: true, message: "Super Admin credentials updated successfully.", user: updated };
    } catch (error) {
      this.userProvisioningService.throwFriendlyUniqueUserError(error, "this property");
      throw error;
    }
  }

  private async generateNextCode(): Promise<string> {
    const orgs = await this.prisma.organisation.findMany({ select: { code: true } });
    const numericCodes = orgs
      .map((o) => parseInt(o.code, 10))
      .filter((n) => !isNaN(n) && n >= 1 && n <= 9999)
      .sort((a, b) => a - b);

    let nextNum = 1;
    for (const num of numericCodes) {
      if (num === nextNum) {
        nextNum += 1;
      } else if (num > nextNum) {
        break;
      }
    }

    if (nextNum > 9999) {
      throw new BadRequestException("Maximum organisation code limit (9999) reached.");
    }

    return nextNum.toString().padStart(4, "0");
  }

  private async assertNoTargetIdentityConflict(
    user: { id: string; email: string; username: string | null },
    organisation: { id: string; code: string; name: string }
  ) {
    const identityChecks: Prisma.UserWhereInput[] = [{ email: user.email }];
    if (user.username) {
      identityChecks.push({ username: user.username });
    }

    const existingUser = await this.prisma.user.findFirst({
      where: {
        id: { not: user.id },
        isSuperAdmin: false,
        isActive: true,
        OR: identityChecks,
        memberships: {
          some: {
            organisationId: organisation.id,
            isActive: true
          }
        }
      },
      include: {
        organisation: { select: { code: true, name: true } }
      },
      orderBy: { createdAt: "asc" }
    });

    if (!existingUser) {
      return;
    }

    const conflictingFields = [
      existingUser.email.toLowerCase() === user.email.toLowerCase() ? "email" : null,
      user.username && existingUser.username?.toLowerCase() === user.username.toLowerCase() ? "username" : null
    ].filter(Boolean);

    throw new ConflictException({
      error: "IDENTITY_CONFLICT",
      message: `Cannot assign this user to [${organisation.code}] ${organisation.name}. Another active account from [${existingUser.organisation.code}] ${existingUser.organisation.name} already has access there with the same ${conflictingFields.join(" and ")}.`,
      fields: {
        userId: "Choose the existing target-property account, or merge/remove the duplicate account before assigning access."
      }
    });
  }
}
