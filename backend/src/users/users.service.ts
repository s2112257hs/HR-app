import { BadRequestException, ConflictException, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import * as bcrypt from "bcryptjs";
import { AuditService } from "../audit/audit.service";
import { AuthenticatedUser } from "../common/types/authenticated-user";
import { PrismaService } from "../prisma/prisma.service";
import { CreateUserDto } from "./dto/create-user.dto";
import { UpdateUserDto } from "./dto/update-user.dto";

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService
  ) {}

  list(organisationId: string) {
    return this.prisma.user.findMany({
      where: { organisationId },
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

    const created = await this.createOrThrowFriendly({
      organisationId: currentUser.organisationId,
      name: dto.name.trim(),
      username: this.trimOptionalLower(dto.username),
      email: dto.email.trim().toLowerCase(),
      passwordHash: await bcrypt.hash(dto.password, 12),
      role: dto.role
    });
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
      where: { id, organisationId: currentUser.organisationId },
      select: this.safeSelect()
    });
    const data: Prisma.UserUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name.trim();
    if (dto.username !== undefined) data.username = this.trimOptionalLower(dto.username);
    if (dto.email !== undefined) data.email = dto.email.trim().toLowerCase();
    if (dto.role !== undefined) data.role = dto.role;
    if (dto.password !== undefined) data.passwordHash = await bcrypt.hash(dto.password, 12);

    const updated = await this.updateOrThrowFriendly(id, data);
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
      where: { id, organisationId: currentUser.organisationId },
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

  private async createOrThrowFriendly(data: Prisma.UserCreateInput | Prisma.UserUncheckedCreateInput) {
    try {
      return await this.prisma.user.create({
        data,
        select: this.safeSelect()
      });
    } catch (error) {
      this.throwFriendlyUniqueError(error);
      throw error;
    }
  }

  private async updateOrThrowFriendly(id: string, data: Prisma.UserUpdateInput) {
    try {
      return await this.prisma.user.update({
        where: { id },
        data,
        select: this.safeSelect()
      });
    } catch (error) {
      this.throwFriendlyUniqueError(error);
      throw error;
    }
  }

  private trimOptionalLower(value?: string | null): string | null | undefined {
    if (value === undefined) {
      return undefined;
    }
    if (value === null) {
      return null;
    }

    const trimmed = value.trim().toLowerCase();
    return trimmed.length > 0 ? trimmed : null;
  }

  private throwFriendlyUniqueError(error: unknown) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") {
      return;
    }

    const target = Array.isArray(error.meta?.target) ? error.meta.target.join(",") : String(error.meta?.target ?? "");
    if (target.includes("username")) {
      throw new ConflictException({
        error: "UNIQUE_CONSTRAINT",
        message: "Username is already in use.",
        fields: { username: "Username is already in use." }
      });
    }

    throw new ConflictException({
      error: "UNIQUE_CONSTRAINT",
      message: "Email is already in use.",
      fields: { email: "Email is already in use." }
    });
  }
}
