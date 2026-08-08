import { BadRequestException, Injectable } from "@nestjs/common";
import { Prisma, UserRole } from "@prisma/client";
import { AuditService } from "../audit/audit.service";
import { type ProvisionedUser, UserProvisioningService } from "../common/services/user-provisioning.service";
import { AuthenticatedUser } from "../common/types/authenticated-user";
import { PrismaService } from "../prisma/prisma.service";
import { CreateUserDto } from "./dto/create-user.dto";
import { UpdateUserDto } from "./dto/update-user.dto";

const SAFE_USER_SELECT = {
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

const USER_WITH_ACTIVE_MEMBERSHIP_SELECT = {
  ...SAFE_USER_SELECT,
  memberships: {
    select: {
      role: true,
      organisation: {
        select: { id: true, code: true, name: true }
      }
    },
    take: 1
  },
  organisation: {
    select: { id: true, code: true, name: true }
  }
} satisfies Prisma.UserSelect;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly userProvisioningService: UserProvisioningService
  ) {}

  list(organisationId: string) {
    return this.prisma.user.findMany({
      where: {
        isSuperAdmin: false,
        memberships: {
          some: {
            organisationId,
            isActive: true
          }
        }
      },
      orderBy: { name: "asc" },
      select: this.userWithActiveMembershipSelect(organisationId)
    }).then((users) => users.map((user) => this.withMembershipRole(this.asUserWithActiveMembership(user))));
  }

  async create(currentUser: AuthenticatedUser, dto: CreateUserDto) {
    if (dto.organisationId && dto.organisationId !== currentUser.organisationId) {
      throw new BadRequestException({
        error: "VALIDATION_ERROR",
        message: "Organisation does not match the signed-in user.",
        fields: {
          organisationId: "Organisation does not match the signed-in user."
        }
      });
    }

    let created: ProvisionedUser;
    try {
      created = await this.userProvisioningService.createUserWithMembership({
        organisationId: currentUser.organisationId,
        name: dto.name,
        username: dto.username,
        email: dto.email,
        password: dto.password,
        role: dto.role
      });
    } catch (error) {
      this.userProvisioningService.throwFriendlyUniqueUserError(error);
      throw error;
    }

    await this.auditService.record({
      organisationId: currentUser.organisationId,
      userId: currentUser.sub,
      action: "USER_CREATED",
      entityType: "User",
      entityId: created.id,
      afterData: created as Prisma.InputJsonValue
    });
    return created;
  }

  async update(currentUser: AuthenticatedUser, id: string, dto: UpdateUserDto) {
    const before = this.withMembershipRole(this.asUserWithActiveMembership(await this.getUserForActiveOrganisation(id, currentUser.organisationId)));
    const data: Prisma.UserUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.username !== undefined) data.username = this.userProvisioningService.normaliseOptionalUsername(dto.username);
    if (dto.email !== undefined) data.email = this.userProvisioningService.normaliseEmail(dto.email);
    if (dto.password !== undefined) data.passwordHash = await this.userProvisioningService.hashPassword(dto.password);
    if (dto.role !== undefined && before.organisationId === currentUser.organisationId) {
      data.role = dto.role;
    }

    const updated = await this.updateOrThrowFriendly(id, data);

    if (dto.role !== undefined) {
      await this.userProvisioningService.upsertMembership(id, currentUser.organisationId, dto.role);
    }

    const updatedForActiveOrganisation = this.withMembershipRole(
      this.asUserWithActiveMembership(await this.getUserForActiveOrganisation(updated.id, currentUser.organisationId))
    );

    await this.auditService.record({
      organisationId: currentUser.organisationId,
      userId: currentUser.sub,
      action: "USER_UPDATED",
      entityType: "User",
      entityId: id,
      beforeData: before as Prisma.InputJsonValue,
      afterData: updatedForActiveOrganisation as Prisma.InputJsonValue
    });
    return updatedForActiveOrganisation;
  }

  async setActive(currentUser: AuthenticatedUser, id: string, isActive: boolean) {
    const before = this.withMembershipRole(this.asUserWithActiveMembership(await this.getUserForActiveOrganisation(id, currentUser.organisationId)));
    const updated = await this.prisma.user.update({
      where: { id },
      data: { isActive },
      select: this.userWithActiveMembershipSelect(currentUser.organisationId)
    });
    const updatedForActiveOrganisation = this.withMembershipRole(this.asUserWithActiveMembership(updated));
    await this.auditService.record({
      organisationId: currentUser.organisationId,
      userId: currentUser.sub,
      action: isActive ? "USER_RESTORED" : "USER_DEACTIVATED",
      entityType: "User",
      entityId: id,
      beforeData: before as Prisma.InputJsonValue,
      afterData: updatedForActiveOrganisation as Prisma.InputJsonValue
    });
    return updatedForActiveOrganisation;
  }

  deactivate(currentUser: AuthenticatedUser, id: string) {
    return this.setActive(currentUser, id, false);
  }

  restore(currentUser: AuthenticatedUser, id: string) {
    return this.setActive(currentUser, id, true);
  }

  private safeSelect(): Prisma.UserSelect {
    return SAFE_USER_SELECT;
  }

  private userWithActiveMembershipSelect(organisationId: string): Prisma.UserSelect {
    return {
      ...USER_WITH_ACTIVE_MEMBERSHIP_SELECT,
      memberships: {
        ...USER_WITH_ACTIVE_MEMBERSHIP_SELECT.memberships,
        where: { organisationId, isActive: true },
        take: 1
      }
    };
  }

  private getUserForActiveOrganisation(id: string, organisationId: string) {
    return this.prisma.user.findFirstOrThrow({
      where: {
        id,
        isSuperAdmin: false,
        memberships: {
          some: {
            organisationId,
            isActive: true
          }
        }
      },
      select: this.userWithActiveMembershipSelect(organisationId)
    });
  }

  private withMembershipRole(user: UserWithMembershipForActiveOrganisation) {
    const membership = user.memberships[0];
    const { memberships, ...safeUser } = user;

    return {
      ...safeUser,
      role: membership?.role ?? safeUser.role,
      primaryOrganisation: safeUser.organisation,
      activeOrganisationAccess: membership
        ? {
            organisation: membership.organisation,
            role: membership.role
          }
        : null
    };
  }

  private asUserWithActiveMembership(user: unknown): UserWithMembershipForActiveOrganisation {
    return user as UserWithMembershipForActiveOrganisation;
  }

  private async updateOrThrowFriendly(id: string, data: Prisma.UserUpdateInput) {
    try {
      return await this.prisma.user.update({
        where: { id },
        data,
        select: this.safeSelect()
      });
    } catch (error) {
      this.userProvisioningService.throwFriendlyUniqueUserError(error);
      throw error;
    }
  }
}

type UserWithMembershipForActiveOrganisation = Prisma.UserGetPayload<{
  select: typeof SAFE_USER_SELECT;
}> & {
  memberships: Array<{
    role: UserRole;
    organisation: {
      id: string;
      code: string;
      name: string;
    };
  }>;
  organisation: {
    id: string;
    code: string;
    name: string;
  };
};
