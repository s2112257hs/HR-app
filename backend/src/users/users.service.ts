import { BadRequestException, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { AuditService } from "../audit/audit.service";
import { type ProvisionedUser, UserProvisioningService } from "../common/services/user-provisioning.service";
import { AuthenticatedUser } from "../common/types/authenticated-user";
import { PrismaService } from "../prisma/prisma.service";
import { CreateUserDto } from "./dto/create-user.dto";
import { UpdateUserDto } from "./dto/update-user.dto";

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
        organisationId,
        isSuperAdmin: false
      },
      orderBy: { name: "asc" },
      select: this.safeSelect()
    });
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
    const before = await this.prisma.user.findFirstOrThrow({
      where: { id, organisationId: currentUser.organisationId, isSuperAdmin: false },
      select: this.safeSelect()
    });
    const data: Prisma.UserUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.username !== undefined) data.username = this.userProvisioningService.normaliseOptionalUsername(dto.username);
    if (dto.email !== undefined) data.email = this.userProvisioningService.normaliseEmail(dto.email);
    if (dto.role !== undefined) data.role = dto.role;
    if (dto.password !== undefined) data.passwordHash = await this.userProvisioningService.hashPassword(dto.password);

    const updated = await this.updateOrThrowFriendly(id, data);

    if (dto.role !== undefined) {
      await this.userProvisioningService.upsertMembership(id, currentUser.organisationId, dto.role);
    }

    await this.auditService.record({
      organisationId: currentUser.organisationId,
      userId: currentUser.sub,
      action: "USER_UPDATED",
      entityType: "User",
      entityId: id,
      beforeData: before as Prisma.InputJsonValue,
      afterData: updated as Prisma.InputJsonValue
    });
    return updated;
  }

  async setActive(currentUser: AuthenticatedUser, id: string, isActive: boolean) {
    const before = await this.prisma.user.findFirstOrThrow({
      where: { id, organisationId: currentUser.organisationId, isSuperAdmin: false },
      select: this.safeSelect()
    });
    const updated = await this.prisma.user.update({
      where: { id },
      data: { isActive },
      select: this.safeSelect()
    });
    await this.auditService.record({
      organisationId: currentUser.organisationId,
      userId: currentUser.sub,
      action: isActive ? "USER_RESTORED" : "USER_DEACTIVATED",
      entityType: "User",
      entityId: id,
      beforeData: before as Prisma.InputJsonValue,
      afterData: updated as Prisma.InputJsonValue
    });
    return updated;
  }

  deactivate(currentUser: AuthenticatedUser, id: string) {
    return this.setActive(currentUser, id, false);
  }

  restore(currentUser: AuthenticatedUser, id: string) {
    return this.setActive(currentUser, id, true);
  }

  private safeSelect(): Prisma.UserSelect {
    return {
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
    };
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
