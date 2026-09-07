import { Prisma } from "@prisma/client";
import { createPrismaMock } from "../../test/test-utils";
import { AuditService } from "./audit.service";

describe("AuditService", () => {
  let prisma: ReturnType<typeof createPrismaMock>;
  let service: AuditService;

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = createPrismaMock();
    service = new AuditService(prisma);
  });

  it("records audit events with JSON-safe before and after payloads", async () => {
    prisma.auditLog.create.mockResolvedValue({ id: "audit-1" });

    await service.record({
      organisationId: "org-1",
      userId: "user-1",
      action: "THING_DONE",
      entityType: "Thing",
      entityId: "thing-1",
      beforeData: { date: new Date("2026-08-20T00:00:00.000Z") },
      afterData: undefined
    });

    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: {
        organisationId: "org-1",
        userId: "user-1",
        action: "THING_DONE",
        entityType: "Thing",
        entityId: "thing-1",
        beforeData: { date: "2026-08-20T00:00:00.000Z" },
        afterData: Prisma.JsonNull
      }
    });
  });

  it("lists the latest 100 events for an organisation", async () => {
    prisma.auditLog.findMany.mockResolvedValue([]);

    await service.list("org-1");

    expect(prisma.auditLog.findMany).toHaveBeenCalledWith({
      where: { organisationId: "org-1" },
      orderBy: { createdAt: "desc" },
      take: 100
    });
  });
});
