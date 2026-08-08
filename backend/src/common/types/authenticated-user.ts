import { UserRole } from "@prisma/client";

export interface AuthenticatedUser {
  sub: string;
  organisationId: string;
  orgCode?: string;
  email: string;
  name: string;
  role: UserRole;
  isSuperAdmin?: boolean;
}

