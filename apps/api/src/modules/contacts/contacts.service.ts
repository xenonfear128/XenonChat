import { Injectable } from '@nestjs/common';
import { ErrorCodes, friendRequestSchema } from '@xenonchat/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { AppError } from '../../common/errors/app-error';
import { BlocksService } from '../blocks/blocks.service';
import { RateLimitService } from '../../common/rate-limit/rate-limit.service';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class ContactsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly blocks: BlocksService,
    private readonly rateLimit: RateLimitService,
    private readonly notifications: NotificationsService,
  ) {}

  async list(userId: string) {
    const contacts = await this.prisma.contact.findMany({
      where: { ownerUserId: userId },
      include: {
        contactUser: { include: { privacy: true } },
      },
      orderBy: { contactUser: { nickname: 'asc' } },
    });
    return contacts.map((c) => ({
      id: c.id,
      user: {
        id: c.contactUser.id,
        user_id: c.contactUser.username,
        nickname: c.contactUser.nickname,
        avatar_url: c.contactUser.avatarUrl,
        bio: c.contactUser.privacy?.showBio === false ? undefined : c.contactUser.bio,
        last_seen_at:
          c.contactUser.privacy?.showOnlineStatus === false
            ? undefined
            : c.contactUser.lastSeenAt?.toISOString(),
      },
      remark: c.remark,
      created_at: c.createdAt.toISOString(),
    }));
  }

  async areFriends(a: string, b: string) {
    const c = await this.prisma.contact.findFirst({
      where: { ownerUserId: a, contactUserId: b },
    });
    return !!c;
  }

  async sendRequest(fromUserId: string, body: unknown) {
    const data = friendRequestSchema.parse(body);
    if (data.to_user_id === fromUserId) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, 'Cannot friend yourself');
    }
    await this.rateLimit.assertFriendRequest(fromUserId);
    await this.blocks.assertNotBlocked(fromUserId, data.to_user_id);

    const target = await this.prisma.user.findFirst({
      where: { id: data.to_user_id, status: 'normal', deletedAt: null },
      include: { privacy: true },
    });
    if (!target) throw new AppError(ErrorCodes.USER_NOT_FOUND, 'User not found', 404);
    if (target.privacy?.friendRequestPolicy === 'nobody') {
      throw new AppError(ErrorCodes.PERMISSION_DENIED, 'User does not accept friend requests', 403);
    }

    if (await this.areFriends(fromUserId, data.to_user_id)) {
      throw new AppError(ErrorCodes.ALREADY_FRIENDS, 'Already friends');
    }

    const existing = await this.prisma.friendRequest.findFirst({
      where: {
        fromUserId,
        toUserId: data.to_user_id,
        status: 'pending',
      },
    });
    if (existing) throw new AppError(ErrorCodes.FRIEND_REQUEST_EXISTS, 'Request already pending');

    const req = await this.prisma.friendRequest.create({
      data: {
        fromUserId,
        toUserId: data.to_user_id,
        message: data.message,
      },
    });

    await this.notifications.create({
      userId: data.to_user_id,
      type: 'friend_request',
      title: 'New friend request',
      body: data.message,
      payload: { request_id: req.id, from_user_id: fromUserId },
    });

    return {
      id: req.id,
      from_user_id: req.fromUserId,
      to_user_id: req.toUserId,
      message: req.message,
      status: req.status,
      created_at: req.createdAt.toISOString(),
    };
  }

  async listRequests(userId: string) {
    const requests = await this.prisma.friendRequest.findMany({
      where: {
        OR: [{ toUserId: userId }, { fromUserId: userId }],
        status: 'pending',
      },
      include: {
        fromUser: true,
        toUser: true,
      },
      orderBy: { createdAt: 'desc' },
    });
    return requests.map((r) => ({
      id: r.id,
      from_user: {
        id: r.fromUser.id,
        user_id: r.fromUser.username,
        nickname: r.fromUser.nickname,
        avatar_url: r.fromUser.avatarUrl,
      },
      to_user: {
        id: r.toUser.id,
        user_id: r.toUser.username,
        nickname: r.toUser.nickname,
        avatar_url: r.toUser.avatarUrl,
      },
      message: r.message,
      status: r.status,
      created_at: r.createdAt.toISOString(),
    }));
  }

  async accept(userId: string, requestId: string) {
    const req = await this.prisma.friendRequest.findFirst({
      where: { id: requestId, toUserId: userId, status: 'pending' },
    });
    if (!req) throw new AppError(ErrorCodes.FRIEND_REQUEST_NOT_FOUND, 'Request not found', 404);

    await this.prisma.$transaction([
      this.prisma.friendRequest.update({
        where: { id: requestId },
        data: { status: 'accepted' },
      }),
      this.prisma.contact.upsert({
        where: {
          ownerUserId_contactUserId: {
            ownerUserId: req.fromUserId,
            contactUserId: req.toUserId,
          },
        },
        create: { ownerUserId: req.fromUserId, contactUserId: req.toUserId },
        update: {},
      }),
      this.prisma.contact.upsert({
        where: {
          ownerUserId_contactUserId: {
            ownerUserId: req.toUserId,
            contactUserId: req.fromUserId,
          },
        },
        create: { ownerUserId: req.toUserId, contactUserId: req.fromUserId },
        update: {},
      }),
    ]);

    await this.notifications.create({
      userId: req.fromUserId,
      type: 'friend_accepted',
      title: 'Friend request accepted',
      payload: { user_id: userId },
    });

    return { success: true };
  }

  async reject(userId: string, requestId: string) {
    const req = await this.prisma.friendRequest.findFirst({
      where: { id: requestId, toUserId: userId, status: 'pending' },
    });
    if (!req) throw new AppError(ErrorCodes.FRIEND_REQUEST_NOT_FOUND, 'Request not found', 404);
    await this.prisma.friendRequest.update({
      where: { id: requestId },
      data: { status: 'rejected' },
    });
    return { success: true };
  }

  async remove(userId: string, contactUserId: string) {
    await this.prisma.contact.deleteMany({
      where: {
        OR: [
          { ownerUserId: userId, contactUserId },
          { ownerUserId: contactUserId, contactUserId: userId },
        ],
      },
    });
    return { success: true };
  }

  async updateRemark(userId: string, contactUserId: string, remark?: string) {
    const contact = await this.prisma.contact.findUnique({
      where: {
        ownerUserId_contactUserId: { ownerUserId: userId, contactUserId },
      },
    });
    if (!contact) throw new AppError(ErrorCodes.NOT_FOUND, 'Contact not found', 404);
    const updated = await this.prisma.contact.update({
      where: { id: contact.id },
      data: { remark },
    });
    return { id: updated.id, remark: updated.remark };
  }
}
