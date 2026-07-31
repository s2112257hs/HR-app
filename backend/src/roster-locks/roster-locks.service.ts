import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { randomUUID } from "crypto";
import { AuthenticatedUser } from "../common/types/authenticated-user";
import { PrismaService } from "../prisma/prisma.service";

const LOCK_MINUTES = 10;

@Injectable()
export class RosterLocksService {
  constructor(private readonly prisma: PrismaService) {}

  async status(organisationId: string) {
    const lock = await this.activeLock(organisationId);
    return lock ? { locked: true, lock: this.toResponse(lock) } : { locked: false, lock: null };
  }

  async acquire(currentUser: AuthenticatedUser) {
    const active = await this.activeLock(currentUser.organisationId);
    if (active && active.lockedByUserId !== currentUser.sub) {
      throw this.lockConflict(active);
    }

    return this.saveLock(currentUser);
  }

  async heartbeat(currentUser: AuthenticatedUser) {
    const active = await this.activeLock(currentUser.organisationId);
    if (!active) {
      return this.saveLock(currentUser);
    }
    if (active.lockedByUserId !== currentUser.sub) {
      throw this.lockConflict(active);
    }

    return this.saveLock(currentUser);
  }

  async steal(currentUser: AuthenticatedUser) {
    return this.saveLock(currentUser);
  }

  async release(currentUser: AuthenticatedUser) {
    const lock = await this.prisma.rosterLock.findUnique({
      where: { organisationId: currentUser.organisationId }
    });

    if (!lock) {
      throw new NotFoundException("Roster lock not found.");
    }

    if (lock.lockedByUserId !== currentUser.sub && currentUser.role !== UserRole.ADMIN) {
      throw this.lockConflict(await this.lockWithUser(currentUser.organisationId));
    }

    await this.prisma.rosterLock.delete({ where: { organisationId: currentUser.organisationId } });
    return { locked: false, lock: null };
  }

  async assertWritable(currentUser: AuthenticatedUser) {
    const active = await this.activeLock(currentUser.organisationId);
    if (active && active.lockedByUserId !== currentUser.sub) {
      throw this.lockConflict(active);
    }
  }

  private async saveLock(currentUser: AuthenticatedUser) {
    const expiresAt = new Date(Date.now() + LOCK_MINUTES * 60_000);
    const token = randomUUID();
    const lock = await this.prisma.rosterLock.upsert({
      where: { organisationId: currentUser.organisationId },
      create: {
        organisationId: currentUser.organisationId,
        lockedByUserId: currentUser.sub,
        token,
        expiresAt
      },
      update: {
        lockedByUserId: currentUser.sub,
        token,
        expiresAt
      },
      include: {
        lockedBy: {
          select: {
            id: true,
            name: true,
            email: true,
            username: true
          }
        }
      }
    });

    return { locked: true, lock: this.toResponse(lock) };
  }

  private async activeLock(organisationId: string) {
    const lock = await this.lockWithUser(organisationId);
    if (!lock) {
      return null;
    }

    if (lock.expiresAt <= new Date()) {
      await this.prisma.rosterLock.delete({ where: { organisationId } }).catch(() => undefined);
      return null;
    }

    return lock;
  }

  private lockWithUser(organisationId: string) {
    return this.prisma.rosterLock.findUnique({
      where: { organisationId },
      include: {
        lockedBy: {
          select: {
            id: true,
            name: true,
            email: true,
            username: true
          }
        }
      }
    });
  }

  private lockConflict(lock: Awaited<ReturnType<RosterLocksService["lockWithUser"]>>) {
    return new ConflictException({
      error: "ROSTER_LOCKED",
      message: "Another user is editing this organisation's roster.",
      lock: lock ? this.toResponse(lock) : null
    });
  }

  private toResponse(lock: NonNullable<Awaited<ReturnType<RosterLocksService["lockWithUser"]>>>) {
    return {
      id: lock.id,
      lockedByUserId: lock.lockedByUserId,
      lockedByName: lock.lockedBy.name,
      lockedByEmail: lock.lockedBy.email,
      lockedByUsername: lock.lockedBy.username,
      expiresAt: lock.expiresAt,
      token: lock.token
    };
  }
}
