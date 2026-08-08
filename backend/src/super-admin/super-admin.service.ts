import { BadRequestException, ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma, UserRole } from "@prisma/client";
import { UserProvisioningService } from "../common/services/user-provisioning.service";
import { AuthenticatedUser } from "../common/types/authenticated-user";
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

  async deleteOrganisation(currentUser: AuthenticatedUser, id: string) {
    const organisation = await this.prisma.organisation.findUnique({
      where: { id },
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

    if (!organisation) {
      throw new NotFoundException("Property not found.");
    }

    if (organisation.id === currentUser.organisationId) {
      throw new BadRequestException("Switch to another property before permanently deleting the active property.");
    }

    const owningSuperAdmin = await this.prisma.user.findFirst({
      where: { organisationId: organisation.id, isSuperAdmin: true },
      select: { id: true, email: true }
    });

    if (owningSuperAdmin) {
      throw new BadRequestException("This property owns a Super Admin account. Move or recreate the Super Admin under another property before deleting it.");
    }

    const primaryUsers = await this.prisma.user.findMany({
      where: { organisationId: organisation.id },
      select: { id: true }
    });

    await this.prisma.$transaction(async (tx) => {
      await this.releaseUserReferencesInTransaction(tx, primaryUsers.map((user) => user.id), currentUser.sub);
      await tx.organisation.delete({ where: { id: organisation.id } });
    });

    return {
      ok: true,
      deleted: {
        id: organisation.id,
        code: organisation.code,
        name: organisation.name,
        usersCount: organisation._count.users,
        employeesCount: organisation._count.employees,
        departmentsCount: organisation._count.departments,
        shiftsCount: organisation._count.shifts
      }
    };
  }

  async deleteDepartment(id: string) {
    const department = await this.prisma.department.findUnique({
      where: { id },
      select: {
        id: true,
        organisationId: true,
        name: true,
        shortCode: true
      }
    });

    if (!department) {
      throw new NotFoundException("Department not found.");
    }

    const deleted = await this.prisma.$transaction(async (tx) => {
      const shifts = await tx.shift.deleteMany({ where: { departmentId: department.id } });
      const validationRules = await tx.validationRule.deleteMany({ where: { departmentId: department.id } });
      await tx.employee.updateMany({
        where: { primaryDepartmentId: department.id },
        data: { primaryDepartmentId: null }
      });
      await tx.department.delete({ where: { id: department.id } });

      return { shiftsCount: shifts.count, validationRulesCount: validationRules.count };
    });

    return {
      ok: true,
      deleted: {
        id: department.id,
        organisationId: department.organisationId,
        name: department.name,
        shortCode: department.shortCode,
        ...deleted
      }
    };
  }

  async deleteEmployee(id: string) {
    const employee = await this.prisma.employee.findUnique({
      where: { id },
      select: {
        id: true,
        organisationId: true,
        firstName: true,
        lastName: true,
        preferredName: true,
        employeeNumber: true
      }
    });

    if (!employee) {
      throw new NotFoundException("Employee not found.");
    }

    const deleted = await this.prisma.$transaction(async (tx) => {
      const shifts = await tx.shift.deleteMany({ where: { employeeId: employee.id } });
      const dayMarkers = await tx.dayMarker.deleteMany({ where: { employeeId: employee.id } });
      await tx.employee.delete({ where: { id: employee.id } });

      return { shiftsCount: shifts.count, dayMarkersCount: dayMarkers.count };
    });

    return {
      ok: true,
      deleted: {
        id: employee.id,
        organisationId: employee.organisationId,
        employeeNumber: employee.employeeNumber,
        name: employee.preferredName || [employee.firstName, employee.lastName].filter(Boolean).join(" "),
        ...deleted
      }
    };
  }

  async deleteUser(currentUser: AuthenticatedUser, id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        username: true,
        email: true,
        isSuperAdmin: true,
        organisation: {
          select: { id: true, code: true, name: true }
        }
      }
    });

    if (!user) {
      throw new NotFoundException("User not found.");
    }

    if (user.id === currentUser.sub) {
      throw new BadRequestException("You cannot permanently delete your own signed-in account.");
    }

    if (user.isSuperAdmin) {
      throw new BadRequestException("Super Admin accounts cannot be deleted from this screen.");
    }

    await this.prisma.$transaction(async (tx) => {
      await this.releaseUserReferencesInTransaction(tx, [user.id], currentUser.sub);
      await tx.user.delete({ where: { id: user.id } });
    });

    return {
      ok: true,
      deleted: {
        id: user.id,
        name: user.name,
        username: user.username,
        email: user.email,
        primaryOrganisation: user.organisation
      }
    };
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

  private async releaseUserReferencesInTransaction(tx: Prisma.TransactionClient, userIds: string[], replacementUserId: string) {
    if (userIds.length === 0) {
      return;
    }

    await tx.rosterLock.deleteMany({
      where: { lockedByUserId: { in: userIds } }
    });
    await tx.shift.updateMany({
      where: { createdByUserId: { in: userIds } },
      data: { createdByUserId: replacementUserId }
    });
    await tx.shift.updateMany({
      where: { updatedByUserId: { in: userIds } },
      data: { updatedByUserId: replacementUserId }
    });
    await tx.dayMarker.updateMany({
      where: { createdByUserId: { in: userIds } },
      data: { createdByUserId: replacementUserId }
    });
    await tx.dayMarker.updateMany({
      where: { updatedByUserId: { in: userIds } },
      data: { updatedByUserId: replacementUserId }
    });
    await tx.auditLog.deleteMany({
      where: { userId: { in: userIds } }
    });
  }
}
