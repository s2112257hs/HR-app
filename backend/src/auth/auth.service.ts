import { ForbiddenException, Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { User, UserRole } from "@prisma/client";
import * as bcrypt from "bcryptjs";
import { AuthenticatedUser } from "../common/types/authenticated-user";
import { PrismaService } from "../prisma/prisma.service";
import { LoginDto } from "./dto/login.dto";

type TokenPayload = {
  sub: string;
  organisationId: string;
  orgCode?: string;
  email: string;
  name: string;
  role: UserRole;
  isSuperAdmin?: boolean;
};

type OrganisationContext = {
  id: string;
  code: string;
};

type UserWithMemberships = User & {
  memberships: Array<{
    organisationId: string;
    role: UserRole;
  }>;
};

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService
  ) {}

  async login(dto: LoginDto) {
    const identifier = (dto.login ?? dto.email ?? "").trim().toLowerCase();
    if (!identifier) {
      throw this.invalidLogin();
    }

    const orgCode = dto.orgCode?.trim();

    if (orgCode) {
      return this.loginWithOrganisationCode(identifier, dto.password, orgCode);
    }

    return this.loginWithoutOrganisationCode(identifier, dto.password);
  }

  async getOrganisations(userId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, isActive: true },
      include: {
        memberships: {
          where: { isActive: true },
          include: { organisation: true },
          orderBy: { createdAt: "asc" }
        }
      }
    });

    if (!user) {
      throw new UnauthorizedException("User not found.");
    }

    if (user.isSuperAdmin) {
      const allOrgs = await this.prisma.organisation.findMany({
        orderBy: { code: "asc" }
      });
      return allOrgs.map((organisation) => ({
        id: organisation.id,
        code: organisation.code,
        name: organisation.name,
        role: UserRole.ADMIN
      }));
    }

    return user.memberships.map((membership) => ({
      id: membership.organisation.id,
      code: membership.organisation.code,
      name: membership.organisation.name,
      role: membership.role
    }));
  }

  async switchOrganisation(currentUser: AuthenticatedUser, targetOrganisationId: string) {
    const context = await this.activeAuthContext(currentUser.sub, targetOrganisationId);

    if (!context) {
      throw new ForbiddenException("You do not have access to this organisation.");
    }

    return this.authResponse(context.user, context.organisation, context.role);
  }

  async refresh(refreshToken: string) {
    try {
      const payload = await this.jwtService.verifyAsync<TokenPayload>(refreshToken, {
        secret: this.configService.getOrThrow<string>("JWT_REFRESH_SECRET")
      });
      const context = await this.activeAuthContext(payload.sub, payload.organisationId);

      if (!context) {
        throw new UnauthorizedException("Invalid refresh token.");
      }

      return this.authResponse(context.user, context.organisation, context.role);
    } catch {
      throw new UnauthorizedException("Invalid refresh token.");
    }
  }

  async me(userId: string, currentOrgId: string) {
    const context = await this.activeAuthContext(userId, currentOrgId);

    if (!context) {
      throw new UnauthorizedException("User not found.");
    }

    return {
      id: context.user.id,
      organisationId: context.organisation.id,
      activeOrganisationId: context.organisation.id,
      orgCode: context.organisation.code,
      name: context.user.name,
      username: context.user.username,
      email: context.user.email,
      role: context.role,
      isSuperAdmin: context.user.isSuperAdmin,
      isActive: context.user.isActive,
      lastLoginAt: context.user.lastLoginAt
    };
  }

  private async loginWithOrganisationCode(identifier: string, password: string, orgCode: string) {
    const organisation = await this.prisma.organisation.findUnique({
      where: { code: orgCode }
    });

    if (!organisation) {
      throw this.invalidLogin();
    }

    const matchingUsers = await this.prisma.user.findMany({
      where: {
        isActive: true,
        OR: [{ email: identifier }, { username: identifier }],
        AND: [
          {
            OR: [
              { isSuperAdmin: true },
              { memberships: { some: { organisationId: organisation.id, isActive: true } } }
            ]
          }
        ]
      },
      include: {
        memberships: {
          where: { organisationId: organisation.id, isActive: true }
        }
      },
      orderBy: { createdAt: "asc" }
    });

    const user = await this.firstPasswordMatch(matchingUsers, password);
    const role = user ? this.resolveActiveRole(user, organisation.id) : null;

    if (!user || !role) {
      throw this.invalidLogin();
    }

    await this.recordLastLogin(user.id);

    return this.authResponse(user, organisation, role);
  }

  private async loginWithoutOrganisationCode(identifier: string, password: string) {
    const matchingUsers = await this.prisma.user.findMany({
      where: {
        isActive: true,
        OR: [{ email: identifier }, { username: identifier }]
      },
      include: {
        organisation: true,
        memberships: {
          include: { organisation: true },
          where: { isActive: true },
          orderBy: { createdAt: "asc" }
        }
      },
      orderBy: { createdAt: "asc" }
    });

    const validUsers: Array<{
      user: (typeof matchingUsers)[0];
      organisation: OrganisationContext;
      role: UserRole;
    }> = [];

    for (const user of matchingUsers) {
      if (!(await bcrypt.compare(password, user.passwordHash))) {
        continue;
      }

      const context = this.defaultOrganisationContext(user);
      if (context) {
        validUsers.push({ user, ...context });
      }
    }

    if (validUsers.length === 0) {
      throw this.invalidLogin();
    }

    const match = validUsers[0];
    await this.recordLastLogin(match.user.id);

    return this.authResponse(match.user, match.organisation, match.role);
  }

  private async activeAuthContext(userId: string, organisationId: string) {
    const [user, organisation] = await Promise.all([
      this.prisma.user.findFirst({
        where: { id: userId, isActive: true },
        include: {
          memberships: {
            where: { organisationId, isActive: true }
          }
        }
      }),
      this.prisma.organisation.findUnique({
        where: { id: organisationId }
      })
    ]);

    if (!user || !organisation) {
      return null;
    }

    const role = this.resolveActiveRole(user, organisation.id);
    if (!role) {
      return null;
    }

    return { user, organisation, role };
  }

  private defaultOrganisationContext(user: User & {
    organisation: OrganisationContext;
    memberships: Array<{
      organisationId: string;
      role: UserRole;
      organisation: OrganisationContext;
    }>;
  }) {
    if (user.isSuperAdmin) {
      return { organisation: user.organisation, role: UserRole.ADMIN };
    }

    const membership = user.memberships.find((item) => item.organisationId === user.organisationId) ?? user.memberships[0];
    if (!membership) {
      return null;
    }

    return { organisation: membership.organisation, role: membership.role };
  }

  private resolveActiveRole(user: UserWithMemberships, organisationId: string): UserRole | null {
    if (user.isSuperAdmin) {
      return UserRole.ADMIN;
    }

    return user.memberships[0]?.organisationId === organisationId ? user.memberships[0].role : null;
  }

  private async firstPasswordMatch<T extends User>(users: T[], password: string): Promise<T | null> {
    for (const user of users) {
      if (await bcrypt.compare(password, user.passwordHash)) {
        return user;
      }
    }

    return null;
  }

  private recordLastLogin(userId: string) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { lastLoginAt: new Date() }
    });
  }

  private invalidLogin() {
    return new UnauthorizedException("Invalid organisation code, email, username or password.");
  }

  private async authResponse(user: User, organisation: OrganisationContext, activeRole: UserRole) {
    const payload: TokenPayload = {
      sub: user.id,
      organisationId: organisation.id,
      orgCode: organisation.code,
      email: user.email,
      name: user.name,
      role: activeRole,
      isSuperAdmin: user.isSuperAdmin
    };

    return {
      accessToken: await this.jwtService.signAsync(payload, {
        secret: this.configService.getOrThrow<string>("JWT_ACCESS_SECRET"),
        expiresIn: "15m"
      }),
      refreshToken: await this.jwtService.signAsync(payload, {
        secret: this.configService.getOrThrow<string>("JWT_REFRESH_SECRET"),
        expiresIn: "7d"
      }),
      user: {
        id: user.id,
        organisationId: organisation.id,
        orgCode: organisation.code,
        name: user.name,
        username: user.username,
        email: user.email,
        role: activeRole,
        isSuperAdmin: user.isSuperAdmin
      }
    };
  }
}
