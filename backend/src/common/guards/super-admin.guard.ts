import { CanActivate, ExecutionContext, Injectable } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { AuthenticatedUser } from "../types/authenticated-user";

@Injectable()
export class SuperAdminGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{ user?: AuthenticatedUser }>();
    const user = request.user;

    if (!user?.isSuperAdmin) {
      return false;
    }

    const dbUser = await this.prisma.user.findFirst({
      where: {
        id: user.sub,
        isActive: true,
        isSuperAdmin: true
      },
      select: { id: true }
    });

    return Boolean(dbUser);
  }
}
