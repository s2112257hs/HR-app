import { ConflictException, NotFoundException } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import { createPrismaMock, testUser } from "../../test/test-utils";
import { RosterLocksService } from "./roster-locks.service";

describe("RosterLocksService", () => {
  let prisma: ReturnType<typeof createPrismaMock>;
  let service: RosterLocksService;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
    prisma = createPrismaMock();
    service = new RosterLocksService(prisma);
  });

  it("returns unlocked status when there is no active lock", async () => {
    prisma.rosterLock.findUnique.mockResolvedValue(null);

    await expect(service.status("org-1")).resolves.toEqual({ locked: false, lock: null });
  });

  it("returns active lock status with owner details", async () => {
    prisma.rosterLock.findUnique.mockResolvedValue(lock());

    await expect(service.status("org-1")).resolves.toEqual({
      locked: true,
      lock: expect.objectContaining({ lockedByUserId: "user-1", lockedByName: "Test User" })
    });
  });

  it("removes expired locks before returning status", async () => {
    prisma.rosterLock.findUnique.mockResolvedValue(lock({ expiresAt: new Date("2000-01-01T00:00:00.000Z") }));
    prisma.rosterLock.delete.mockResolvedValue({});

    await expect(service.status("org-1")).resolves.toEqual({ locked: false, lock: null });
    expect(prisma.rosterLock.delete).toHaveBeenCalledWith({ where: { organisationId: "org-1" } });
  });

  it("acquires a lock when none exists", async () => {
    prisma.rosterLock.findUnique.mockResolvedValue(null);
    prisma.rosterLock.upsert.mockResolvedValue(lock());

    const result = await service.acquire(testUser());

    expect(result.locked).toBe(true);
    expect(prisma.rosterLock.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organisationId: "org-1" },
        create: expect.objectContaining({ lockedByUserId: "user-1" }),
        update: expect.objectContaining({ lockedByUserId: "user-1" })
      })
    );
  });

  it("rejects acquire and heartbeat when another user owns an active lock", async () => {
    prisma.rosterLock.findUnique.mockResolvedValue(lock({ lockedByUserId: "other-user" }));

    await expect(service.acquire(testUser())).rejects.toBeInstanceOf(ConflictException);
    await expect(service.heartbeat(testUser())).rejects.toBeInstanceOf(ConflictException);
  });

  it("heartbeat creates or refreshes the caller's lock", async () => {
    prisma.rosterLock.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(lock());
    prisma.rosterLock.upsert.mockResolvedValue(lock());

    await service.heartbeat(testUser());
    await service.heartbeat(testUser());

    expect(prisma.rosterLock.upsert).toHaveBeenCalledTimes(2);
  });

  it("allows stealing a lock", async () => {
    prisma.rosterLock.upsert.mockResolvedValue(lock());

    await service.steal(testUser());

    expect(prisma.rosterLock.upsert).toHaveBeenCalled();
  });

  it("releases locks for owners and admins", async () => {
    prisma.rosterLock.findUnique.mockResolvedValueOnce(lock()).mockResolvedValueOnce(lock({ lockedByUserId: "other-user" }));
    prisma.rosterLock.delete.mockResolvedValue({});

    await expect(service.release(testUser())).resolves.toEqual({ locked: false, lock: null });
    await expect(service.release(testUser({ role: UserRole.ADMIN }))).resolves.toEqual({ locked: false, lock: null });
  });

  it("rejects release when the lock is missing or owned by another non-admin", async () => {
    prisma.rosterLock.findUnique.mockResolvedValueOnce(null);
    await expect(service.release(testUser())).rejects.toBeInstanceOf(NotFoundException);

    prisma.rosterLock.findUnique.mockResolvedValue(lock({ lockedByUserId: "other-user" }));
    await expect(service.release(testUser({ role: UserRole.ROSTER_MANAGER }))).rejects.toBeInstanceOf(ConflictException);
  });

  it("can build a conflict response when the conflicting lock disappears", async () => {
    prisma.rosterLock.findUnique.mockResolvedValueOnce(lock({ lockedByUserId: "other-user" })).mockResolvedValueOnce(null);

    await expect(service.release(testUser({ role: UserRole.ROSTER_MANAGER }))).rejects.toBeInstanceOf(ConflictException);
  });

  it("asserts writes are allowed only when unlocked or owned by current user", async () => {
    prisma.rosterLock.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(lock()).mockResolvedValueOnce(lock({ lockedByUserId: "other-user" }));

    await expect(service.assertWritable(testUser())).resolves.toBeUndefined();
    await expect(service.assertWritable(testUser())).resolves.toBeUndefined();
    await expect(service.assertWritable(testUser())).rejects.toBeInstanceOf(ConflictException);
  });
});

function lock(overrides: Partial<ReturnType<typeof lockShape>> = {}) {
  return { ...lockShape(), ...overrides };
}

function lockShape() {
  return {
    id: "lock-1",
    organisationId: "org-1",
    lockedByUserId: "user-1",
    token: "token-1",
    expiresAt: new Date(Date.now() + 600_000),
    lockedBy: {
      id: "user-1",
      name: "Test User",
      email: "user@example.com",
      username: "tester"
    }
  };
}
