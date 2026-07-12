import { Injectable } from '@nestjs/common';
import { ErrorCodes } from '@xenonchat/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { AppError } from '../../common/errors/app-error';

@Injectable()
export class BlocksService {
  constructor(private readonly prisma: PrismaService) {}

  async isBlockedEitherWay(a: string, b: string) {
    const row = await this.prisma.blockedUser.findFirst({
      where: {
        OR: [
          { blockerUserId: a, blockedUserId: b },
          { blockerUserId: b, blockedUserId: a },
        ],
      },
    });
    return !!row;
  }

  async isBlockedBy(blockerId: string, blockedId: string) {
    const row = await this.prisma.blockedUser.findUnique({
      where: {
        blockerUserId_blockedUserId: {
          blockerUserId: blockerId,
          blockedUserId: blockedId,
        },
      },
    });
    return !!row;
  }

  async assertNotBlocked(actorId: string, otherId: string) {
    if (await this.isBlockedEitherWay(actorId, otherId)) {
      throw new AppError(ErrorCodes.USER_BLOCKED, 'User is blocked', 403);
    }
  }

  async block(blockerId: string, blockedId: string, reason?: string) {
    if (blockerId === blockedId) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, 'Cannot block yourself');
    }
    const user = await this.prisma.user.findFirst({
      where: { id: blockedId, deletedAt: null },
    });
    if (!user) throw new AppError(ErrorCodes.USER_NOT_FOUND, 'User not found', 404);

    await this.prisma.$transaction([
      this.prisma.blockedUser.upsert({
        where: {
          blockerUserId_blockedUserId: {
            blockerUserId: blockerId,
            blockedUserId: blockedId,
          },
        },
        create: { blockerUserId: blockerId, blockedUserId: blockedId, reason },
        update: { reason },
      }),
      // Remove friendship both ways
      this.prisma.contact.deleteMany({
        where: {
          OR: [
            { ownerUserId: blockerId, contactUserId: blockedId },
            { ownerUserId: blockedId, contactUserId: blockerId },
          ],
        },
      }),
      this.prisma.friendRequest.updateMany({
        where: {
          status: 'pending',
          OR: [
            { fromUserId: blockerId, toUserId: blockedId },
            { fromUserId: blockedId, toUserId: blockerId },
          ],
        },
        data: { status: 'cancelled' },
      }),
    ]);

    return { success: true };
  }

  async unblock(blockerId: string, blockedId: string) {
    await this.prisma.blockedUser.deleteMany({
      where: { blockerUserId: blockerId, blockedUserId: blockedId },
    });
    return { success: true };
  }

  async list(blockerId: string) {
    const rows = await this.prisma.blockedUser.findMany({
      where: { blockerUserId: blockerId },
      include: { blocked: true },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => ({
      id: r.id,
      user: {
        id: r.blocked.id,
        user_id: r.blocked.username,
        nickname: r.blocked.nickname,
        avatar_url: r.blocked.avatarUrl,
      },
      reason: r.reason,
      created_at: r.createdAt.toISOString(),
    }));
  }
}
