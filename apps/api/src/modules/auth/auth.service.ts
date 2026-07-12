import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { createHash, randomBytes, randomUUID } from 'crypto';
import { ErrorCodes, registerSchema, loginSchema } from '@xenonchat/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { RateLimitService } from '../../common/rate-limit/rate-limit.service';
import { AppError } from '../../common/errors/app-error';
import { AuthUser } from '../../common/auth/auth.guard';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly rateLimit: RateLimitService,
  ) {}

  private hashToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  private publicUser(user: {
    id: string;
    username: string;
    nickname: string;
    avatarUrl: string | null;
    bio: string | null;
    language: string;
    theme: string;
    cornerStyle: string;
    email: string;
    createdAt: Date;
  }) {
    return {
      id: user.id,
      user_id: user.username,
      nickname: user.nickname,
      avatar_url: user.avatarUrl,
      bio: user.bio,
      language: user.language === 'zh_CN' ? 'zh-CN' : 'en-US',
      theme: user.theme,
      corner_style: user.cornerStyle,
      email: user.email,
      created_at: user.createdAt.toISOString(),
    };
  }

  async register(body: unknown) {
    if (this.config.get('ENABLE_SIGNUP', 'true') !== 'true') {
      throw new AppError(ErrorCodes.SIGNUP_DISABLED, 'Signup disabled', 403);
    }
    const data = registerSchema.parse(body);
    const existingEmail = await this.prisma.user.findUnique({ where: { email: data.email.toLowerCase() } });
    if (existingEmail) {
      throw new AppError(ErrorCodes.EMAIL_ALREADY_EXISTS, 'Email already registered');
    }
    const existingUsername = await this.prisma.user.findUnique({
      where: { username: data.username.toLowerCase() },
    });
    if (existingUsername) {
      throw new AppError(ErrorCodes.USER_ID_ALREADY_EXISTS, 'Username taken');
    }

    const passwordHash = await argon2.hash(data.password, { type: argon2.argon2id });
    const user = await this.prisma.user.create({
      data: {
        email: data.email.toLowerCase(),
        username: data.username.toLowerCase(),
        nickname: data.nickname,
        passwordHash,
        privacy: { create: {} },
      },
    });

    return this.issueTokens(user, 'web', undefined, undefined);
  }

  async login(body: unknown, ip?: string, userAgent?: string) {
    const data = loginSchema.parse(body);
    await this.rateLimit.assertLogin(data.email);
    const user = await this.prisma.user.findUnique({ where: { email: data.email.toLowerCase() } });
    if (!user || user.status !== 'normal' || user.deletedAt) {
      throw new AppError(ErrorCodes.AUTH_INVALID_CREDENTIALS, 'Invalid credentials', 401);
    }
    const ok = await argon2.verify(user.passwordHash, data.password);
    if (!ok) {
      throw new AppError(ErrorCodes.AUTH_INVALID_CREDENTIALS, 'Invalid credentials', 401);
    }
    return this.issueTokens(user, data.device_name ?? 'web', ip, userAgent);
  }

  private async issueTokens(
    user: {
      id: string;
      email: string;
      username: string;
      nickname: string;
      avatarUrl: string | null;
      bio: string | null;
      language: string;
      theme: string;
      cornerStyle: string;
      createdAt: Date;
    },
    deviceName: string,
    ip?: string,
    userAgent?: string,
  ) {
    const device = await this.prisma.userDevice.create({
      data: {
        userId: user.id,
        name: deviceName,
        ip,
        userAgent,
      },
    });

    const refreshToken = randomBytes(48).toString('base64url');
    const refreshTtl = Number(this.config.get('REFRESH_TOKEN_TTL_SECONDS', 2592000));
    const session = await this.prisma.userSession.create({
      data: {
        userId: user.id,
        deviceId: device.id,
        refreshTokenHash: this.hashToken(refreshToken),
        expiresAt: new Date(Date.now() + refreshTtl * 1000),
        ip,
        userAgent,
      },
    });

    const accessToken = await this.jwt.signAsync({
      sub: user.id,
      email: user.email,
      username: user.username,
      sid: session.id,
    });

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastSeenAt: new Date() },
    });

    return {
      access_token: accessToken,
      refresh_token: refreshToken,
      token_type: 'Bearer',
      expires_in: Number(this.config.get('ACCESS_TOKEN_TTL_SECONDS', 900)),
      user: this.publicUser(user),
      device_id: device.id,
    };
  }

  async refresh(refreshToken: string) {
    if (!refreshToken) {
      throw new AppError(ErrorCodes.AUTH_INVALID_TOKEN, 'Missing refresh token', 401);
    }
    const hash = this.hashToken(refreshToken);
    const session = await this.prisma.userSession.findFirst({
      where: { refreshTokenHash: hash, revokedAt: null },
      include: { user: true },
    });
    if (!session || session.expiresAt < new Date() || session.user.status !== 'normal') {
      throw new AppError(ErrorCodes.AUTH_EXPIRED_TOKEN, 'Refresh token invalid', 401);
    }

    const accessToken = await this.jwt.signAsync({
      sub: session.user.id,
      email: session.user.email,
      username: session.user.username,
      sid: session.id,
    });

    // rotate refresh token
    const newRefresh = randomBytes(48).toString('base64url');
    const refreshTtl = Number(this.config.get('REFRESH_TOKEN_TTL_SECONDS', 2592000));
    await this.prisma.userSession.update({
      where: { id: session.id },
      data: {
        refreshTokenHash: this.hashToken(newRefresh),
        expiresAt: new Date(Date.now() + refreshTtl * 1000),
      },
    });

    return {
      access_token: accessToken,
      refresh_token: newRefresh,
      token_type: 'Bearer',
      expires_in: Number(this.config.get('ACCESS_TOKEN_TTL_SECONDS', 900)),
      user: this.publicUser(session.user),
    };
  }

  async logout(user: AuthUser) {
    await this.prisma.userSession.update({
      where: { id: user.sessionId },
      data: { revokedAt: new Date() },
    });
    return { success: true };
  }

  async listDevices(userId: string) {
    const devices = await this.prisma.userDevice.findMany({
      where: { userId, revokedAt: null },
      orderBy: { lastSeenAt: 'desc' },
    });
    return devices.map((d) => ({
      id: d.id,
      name: d.name,
      ip: d.ip,
      user_agent: d.userAgent,
      last_seen_at: d.lastSeenAt.toISOString(),
      created_at: d.createdAt.toISOString(),
    }));
  }

  async revokeDevice(userId: string, deviceId: string, currentSessionId: string) {
    const device = await this.prisma.userDevice.findFirst({ where: { id: deviceId, userId } });
    if (!device) throw new AppError(ErrorCodes.NOT_FOUND, 'Device not found', 404);
    await this.prisma.userDevice.update({
      where: { id: deviceId },
      data: { revokedAt: new Date() },
    });
    await this.prisma.userSession.updateMany({
      where: { deviceId, userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return { success: true, current_session_revoked: false, current_session_id: currentSessionId };
  }

  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    if (!newPassword || newPassword.length < 8) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, 'Password too short');
    }
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const ok = await argon2.verify(user.passwordHash, currentPassword);
    if (!ok) throw new AppError(ErrorCodes.AUTH_INVALID_CREDENTIALS, 'Current password incorrect', 401);
    const passwordHash = await argon2.hash(newPassword, { type: argon2.argon2id });
    await this.prisma.user.update({ where: { id: userId }, data: { passwordHash } });
    await this.prisma.userSession.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return { success: true };
  }

  /** Dev-friendly reset: sets password when email exists (no email delivery in MVP). */
  async resetPassword(email: string, newPassword: string) {
    if (!newPassword || newPassword.length < 8) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, 'Password too short');
    }
    const user = await this.prisma.user.findUnique({ where: { email: email.toLowerCase() } });
    if (!user) {
      // do not leak existence
      return { success: true };
    }
    const passwordHash = await argon2.hash(newPassword, { type: argon2.argon2id });
    await this.prisma.user.update({ where: { id: user.id }, data: { passwordHash } });
    await this.prisma.userSession.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return { success: true };
  }

  async validateAccessToken(token: string): Promise<AuthUser> {
    try {
      const payload = await this.jwt.verifyAsync<{
        sub: string;
        email: string;
        username: string;
        sid: string;
      }>(token);
      const user = await this.prisma.user.findFirst({
        where: { id: payload.sub, status: 'normal', deletedAt: null },
      });
      if (!user) throw new AppError(ErrorCodes.AUTH_ACCOUNT_DISABLED, 'Account unavailable', 401);
      const session = await this.prisma.userSession.findFirst({
        where: { id: payload.sid, userId: user.id, revokedAt: null },
      });
      if (!session || session.expiresAt < new Date()) {
        throw new AppError(ErrorCodes.AUTH_EXPIRED_TOKEN, 'Session expired', 401);
      }
      return {
        id: user.id,
        email: user.email,
        username: user.username,
        sessionId: session.id,
      };
    } catch (e) {
      if (e instanceof AppError) throw e;
      throw new AppError(ErrorCodes.AUTH_INVALID_TOKEN, 'Invalid token', 401);
    }
  }
}
