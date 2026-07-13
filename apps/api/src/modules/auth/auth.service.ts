import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { createHash, randomBytes } from 'crypto';
import nodemailer from 'nodemailer';
import { ErrorCodes, registerSchema, loginSchema } from '@xenonchat/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
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
    private readonly redis: RedisService,
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
    await this.rateLimit.assertLogin(data.identifier);
    const user = await this.prisma.user.findFirst({
      where: {
        OR: [
          { email: data.identifier },
          { username: data.identifier },
        ],
      },
    });
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

  async listDevices(userId: string, currentSessionId: string) {
    const currentSession = await this.prisma.userSession.findFirst({
      where: { id: currentSessionId, userId, revokedAt: null },
      select: { deviceId: true },
    });
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
      current: d.id === currentSession?.deviceId,
    }));
  }

  async revokeDevice(userId: string, deviceId: string, currentSessionId: string) {
    const device = await this.prisma.userDevice.findFirst({ where: { id: deviceId, userId } });
    if (!device) throw new AppError(ErrorCodes.NOT_FOUND, 'Device not found', 404);
    const currentSession = await this.prisma.userSession.findFirst({
      where: { id: currentSessionId, userId },
      select: { deviceId: true },
    });
    const currentSessionRevoked = currentSession?.deviceId === deviceId;
    await this.prisma.userDevice.update({
      where: { id: deviceId },
      data: { revokedAt: new Date() },
    });
    await this.prisma.userSession.updateMany({
      where: { deviceId, userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return {
      success: true,
      current_session_revoked: currentSessionRevoked,
      current_session_id: currentSessionId,
    };
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

  async requestPasswordReset(email: string) {
    const normalizedEmail = email.trim().toLowerCase();
    await this.rateLimit.assertPasswordReset(normalizedEmail);
    const genericResult: {
      success: true;
      reset_token?: string;
      delivery?: 'email' | 'development';
    } = { success: true };

    if (
      this.config.get('NODE_ENV', 'development') === 'production' &&
      !this.config.get<string>('SMTP_HOST')
    ) {
      throw new AppError(
        ErrorCodes.AUTH_PASSWORD_RESET_UNAVAILABLE,
        'Password reset email is not configured',
        503,
      );
    }

    if (!normalizedEmail || !normalizedEmail.includes('@')) {
      return genericResult;
    }

    const user = await this.prisma.user.findUnique({
      where: { email: normalizedEmail },
    });
    if (!user || user.status !== 'normal' || user.deletedAt) {
      return genericResult;
    }

    const token = randomBytes(32).toString('base64url');
    const tokenHash = this.hashToken(token);
    const ttlSeconds = Number(
      this.config.get('PASSWORD_RESET_TOKEN_TTL_SECONDS', 900),
    );
    await this.redis.client.set(
      `auth:password-reset:${tokenHash}`,
      user.id,
      'EX',
      ttlSeconds,
    );

    const smtpHost = this.config.get<string>('SMTP_HOST');
    if (smtpHost) {
      const smtpUser = this.config.get<string>('SMTP_USER');
      const smtpPass = this.config.get<string>('SMTP_PASSWORD');
      const transporter = nodemailer.createTransport({
        host: smtpHost,
        port: Number(this.config.get('SMTP_PORT', 587)),
        secure: this.config.get('SMTP_SECURE', 'false') === 'true',
        auth:
          smtpUser && smtpPass
            ? { user: smtpUser, pass: smtpPass }
            : undefined,
      });
      const appBaseUrl = this.config.get('APP_BASE_URL', 'http://localhost:3000');
      const resetUrl = `${appBaseUrl.replace(/\/$/, '')}/forgot-password?token=${encodeURIComponent(token)}`;
      await transporter.sendMail({
        from: this.config.get('SMTP_FROM', 'XenonChat <no-reply@localhost>'),
        to: user.email,
        subject: 'Reset your XenonChat password',
        text: `Open this link within ${Math.ceil(ttlSeconds / 60)} minutes: ${resetUrl}`,
      });
      return { success: true, delivery: 'email' };
    }

    if (
      this.config.get('NODE_ENV', 'development') !== 'production' &&
      this.config.get('DEV_EXPOSE_PASSWORD_RESET_TOKEN', 'true') === 'true'
    ) {
      return { success: true, reset_token: token, delivery: 'development' };
    }

    // Do not expose whether the account exists when email delivery is absent.
    return genericResult;
  }

  async confirmPasswordReset(token: string, newPassword: string) {
    if (!token || token.length < 32 || !newPassword || newPassword.length < 8) {
      throw new AppError(
        ErrorCodes.AUTH_INVALID_RESET_TOKEN,
        'Invalid or expired password reset token',
        400,
      );
    }
    const tokenHash = this.hashToken(token);
    const userId = await this.redis.client.getdel(
      `auth:password-reset:${tokenHash}`,
    );
    if (!userId) {
      throw new AppError(
        ErrorCodes.AUTH_INVALID_RESET_TOKEN,
        'Invalid or expired password reset token',
        400,
      );
    }

    const passwordHash = await argon2.hash(newPassword, { type: argon2.argon2id });
    await this.prisma.user.update({ where: { id: userId }, data: { passwordHash } });
    await this.prisma.userSession.updateMany({
      where: { userId, revokedAt: null },
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
