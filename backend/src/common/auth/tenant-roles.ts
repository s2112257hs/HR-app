import { UserRole } from "@prisma/client";

export const TENANT_ROLES = [UserRole.ADMIN, UserRole.ROSTER_MANAGER, UserRole.VIEWER] as const;

export type TenantRole = (typeof TENANT_ROLES)[number];

