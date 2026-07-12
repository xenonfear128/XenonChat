import {
  CanActivate,
  ExecutionContext,
  Injectable,
  createParamDecorator,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ErrorCodes } from '@xenonchat/shared';
import { AppError } from '../errors/app-error';
import { PrismaService } from '../../prisma/prisma.service';

export type AuthUser = {
  id: string;
  email: string;
  username: string;
  sessionId: string;
};

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const header = (req.headers.authorization as string | undefined) ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) {
      throw new AppError(ErrorCodes.AUTH_INVALID_TOKEN, 'Missing token', 401);
    }
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
      if (!user) {
        throw new AppError(ErrorCodes.AUTH_ACCOUNT_DISABLED, 'Account unavailable', 401);
      }
      const session = await this.prisma.userSession.findFirst({
        where: { id: payload.sid, userId: user.id, revokedAt: null },
      });
      if (!session || session.expiresAt < new Date()) {
        throw new AppError(ErrorCodes.AUTH_EXPIRED_TOKEN, 'Session expired', 401);
      }
      req.user = {
        id: user.id,
        email: user.email,
        username: user.username,
        sessionId: session.id,
      } satisfies AuthUser;
      return true;
    } catch (e) {
      if (e instanceof AppError) throw e;
      throw new AppError(ErrorCodes.AUTH_INVALID_TOKEN, 'Invalid token', 401);
    }
  }
}

export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext) => {
  const req = ctx.switchToHttp().getRequest();
  return req.user as AuthUser;
});
