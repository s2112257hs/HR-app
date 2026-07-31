import { Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { User } from "@prisma/client";
import * as bcrypt from "bcryptjs";
import { PrismaService } from "../prisma/prisma.service";
import { LoginDto } from "./dto/login.dto";

type TokenPayload = {
  sub: string;
  organisationId: string;
  email: string;
  name: string;
  role: User["role"];
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
      throw new UnauthorizedException("Invalid email, username or password.");
    }

    const user = await this.prisma.user.findFirst({
      where: {
        isActive: true,
        OR: [{ email: identifier }, { username: identifier }]
      }
    });

    if (!user || !(await bcrypt.compare(dto.password, user.passwordHash))) {
      throw new UnauthorizedException("Invalid email, username or password.");
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() }
    });

    return this.authResponse(user);
  }

  async refresh(refreshToken: string) {
    try {
      const payload = await this.jwtService.verifyAsync<TokenPayload>(refreshToken, {
        secret: this.configService.getOrThrow<string>("JWT_REFRESH_SECRET")
      });
      const user = await this.prisma.user.findFirst({
        where: {
          id: payload.sub,
          isActive: true
        }
      });
      if (!user) {
        throw new UnauthorizedException("Invalid refresh token.");
      }
      return this.authResponse(user);
    } catch {
      throw new UnauthorizedException("Invalid refresh token.");
    }
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: {
        id: true,
        organisationId: true,
        name: true,
        username: true,
        email: true,
        role: true,
        isActive: true,
        lastLoginAt: true
      }
    });
    return user;
  }

  private async authResponse(user: User) {
    const payload: TokenPayload = {
      sub: user.id,
      organisationId: user.organisationId,
      email: user.email,
      name: user.name,
      role: user.role
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
        organisationId: user.organisationId,
        name: user.name,
        username: user.username,
        email: user.email,
        role: user.role
      }
    };
  }
}
