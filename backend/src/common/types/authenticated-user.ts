import { UserRole } from "@prisma/client";

export interface AuthenticatedUser {
  sub: string;
  organisationId: string;
  email: string;
  name: string;
  role: UserRole;
}

