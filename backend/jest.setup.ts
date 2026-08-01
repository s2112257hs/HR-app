// jest.setup.ts
// Global test setup for HR‑roster backend

// Mock PrismaService globally for all tests
jest.mock('../src/prisma/prisma.service', () => {
  const mockPrisma = {
    // Add mocks for models used across services
    auditLog: { create: jest.fn(), findMany: jest.fn() },
    dayMarker: { findUnique: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() },
    employee: { findFirst: jest.fn(), findMany: jest.fn() },
    organisation: { findUniqueOrThrow: jest.fn() },
    shift: { findMany: jest.fn(), updateMany: jest.fn() },
    user: { findFirst: jest.fn(), findUniqueOrThrow: jest.fn() },
    // Add other models as needed later
  };
  return { PrismaService: jest.fn(() => mockPrisma) };
});
