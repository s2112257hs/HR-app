// jest.setup.ts
// Global test setup for HR-roster backend

// Mock PrismaService globally if needed, using correct relative path from backend root
jest.mock('./src/prisma/prisma.service', () => {
  const mockPrisma = {
    auditLog: { create: jest.fn(), findMany: jest.fn() },
    dayMarker: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() },
    employee: { findFirst: jest.fn(), findMany: jest.fn() },
    organisation: { findUniqueOrThrow: jest.fn() },
    shift: { findMany: jest.fn(), updateMany: jest.fn() },
    user: { findFirst: jest.fn(), findUniqueOrThrow: jest.fn() },
  };
  return { PrismaService: jest.fn(() => mockPrisma) };
});
