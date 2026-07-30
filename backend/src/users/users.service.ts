import { Injectable } from "@nestjs/common";
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
    const created = await this.prisma.user.create({
      data: {
        organisationId: currentUser.organisationId,
        name: dto.name.trim(),
        email: dto.email.trim().toLowerCase(),
        passwordHash: await bcrypt.hash(dto.password, 12),
        role: dto.role
      },
      select: this.safeSelect()
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
    if (dto.email !== undefined) data.email = dto.email.trim().toLowerCase();
    if (dto.role !== undefined) data.role = dto.role;
    if (dto.password !== undefined) data.passwordHash = await bcrypt.hash(dto.password, 12);

    const updated = await this.prisma.user.update({
      where: { id },
      data,
      select: this.safeSelect()
    });
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
      email: true,
      role: true,
      isActive: true,
      lastLoginAt: true,
      createdAt: true,
      updatedAt: true
    };
  }
}
