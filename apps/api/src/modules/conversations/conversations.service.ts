import { Injectable } from '@nestjs/common';
import { ErrorCodes, directSettingsSchema } from '@xenonchat/shared';
import { PrismaService } from '../../prisma/prisma.service';
import { AppError } from '../../common/errors/app-error';
import { BlocksService } from '../blocks/blocks.service';
import { ContactsService } from '../contacts/contacts.service';

@Injectable()
export class ConversationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly blocks: BlocksService,
    private readonly contacts: ContactsService,
  ) {}

  directKey(a: string, b: string) {
    return [a, b].sort().join(':');
  }

  async getOrCreateDirect(userId: string, peerUserId: string) {
    if (userId === peerUserId) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, 'Cannot chat with yourself');
    }
    const peer = await this.prisma.user.findFirst({
      where: { id: peerUserId, status: 'normal', deletedAt: null },
      include: { privacy: true },
    });
    if (!peer) throw new AppError(ErrorCodes.USER_NOT_FOUND, 'User not found', 404);

    await this.blocks.assertNotBlocked(userId, peerUserId);

    const friends = await this.contacts.areFriends(userId, peerUserId);
    if (!friends && !peer.privacy?.allowStrangerDm) {
      throw new AppError(ErrorCodes.STRANGER_DM_DENIED, 'Stranger DMs not allowed', 403);
    }

    const key = this.directKey(userId, peerUserId);
    let conversation = await this.prisma.conversation.findUnique({
      where: { directKey: key },
      include: { members: true },
    });

    if (!conversation) {
      conversation = await this.prisma.conversation.create({
        data: {
          type: 'direct',
          directKey: key,
          members: {
            create: [{ userId }, { userId: peerUserId }],
          },
          directSettings: {
            create: [
              { ownerUserId: userId, peerUserId },
              { ownerUserId: peerUserId, peerUserId: userId },
            ],
          },
        },
        include: { members: true },
      });
    }

    return this.getForUser(userId, conversation.id);
  }

  async listForUser(userId: string) {
    const memberships = await this.prisma.conversationMember.findMany({
      where: { userId, leftAt: null },
      include: {
        conversation: {
          include: {
            group: true,
            members: {
              where: { leftAt: null },
              include: { user: true },
            },
            messages: {
              where: {
                OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
                deletedAt: null,
              },
              orderBy: { createdAt: 'desc' },
              take: 1,
            },
            pins: { where: { userId } },
            mutes: { where: { userId } },
            cursors: { where: { userId } },
          },
        },
      },
    });

    const items = await Promise.all(
      memberships.map(async (m) => {
        const c = m.conversation;
        const peer =
          c.type === 'direct'
            ? c.members.find((x) => x.userId !== userId)?.user
            : undefined;
        const last = c.messages[0];
        const cursor = c.cursors[0];
        let unread = 0;
        if (last) {
          unread = await this.prisma.message.count({
            where: {
              conversationId: c.id,
              createdAt: cursor?.lastReadAt ? { gt: cursor.lastReadAt } : undefined,
              senderUserId: { not: userId },
              deletedAt: null,
              OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
              deletions: { none: { userId } },
            },
          });
        }
        return {
          id: c.id,
          type: c.type,
          updated_at: c.updatedAt.toISOString(),
          pinned: c.pins.length > 0,
          muted: c.mutes.length > 0,
          unread_count: unread,
          group: c.group
            ? {
                id: c.group.id,
                group_id: c.group.publicId,
                name: c.group.name,
                avatar_url: c.group.avatarUrl,
                member_count: c.group.memberCount,
              }
            : undefined,
          peer: peer
            ? {
                id: peer.id,
                user_id: peer.username,
                nickname: peer.nickname,
                avatar_url: peer.avatarUrl,
              }
            : undefined,
          last_message: last
            ? {
                id: last.id,
                message_type: last.messageType,
                body: last.revokedAt ? null : last.body,
                revoked: !!last.revokedAt,
                created_at: last.createdAt.toISOString(),
                sender_user_id: last.senderUserId,
              }
            : null,
        };
      }),
    );

    items.sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return b.updated_at.localeCompare(a.updated_at);
    });
    return items;
  }

  async assertMember(userId: string, conversationId: string) {
    const member = await this.prisma.conversationMember.findFirst({
      where: { conversationId, userId, leftAt: null },
      include: {
        conversation: { include: { group: true } },
      },
    });
    if (!member) {
      throw new AppError(ErrorCodes.CONVERSATION_NOT_FOUND, 'Conversation not found', 404);
    }
    if (member.conversation.group?.status === 'dissolved') {
      throw new AppError(ErrorCodes.GROUP_DISSOLVED, 'Group dissolved', 403);
    }
    return member;
  }

  async getForUser(userId: string, conversationId: string) {
    await this.assertMember(userId, conversationId);
    const list = await this.listForUser(userId);
    const found = list.find((c) => c.id === conversationId);
    if (!found) throw new AppError(ErrorCodes.CONVERSATION_NOT_FOUND, 'Conversation not found', 404);

    const settings = await this.prisma.directConversationSettings.findUnique({
      where: {
        conversationId_ownerUserId: { conversationId, ownerUserId: userId },
      },
    });
    const group = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: { group: true },
    });

    return {
      ...found,
      settings: settings
        ? {
            message_ttl_seconds: settings.messageTtlSeconds,
            allowed_message_types: settings.allowedMessageTypes,
          }
        : group?.group
          ? {
              message_ttl_seconds: group.group.messageTtlSeconds,
              allowed_message_types: group.group.allowedMessageTypes,
              slow_mode_seconds: group.group.slowModeSeconds,
              rate_limit_per_sec: group.group.rateLimitPerSec,
              max_members: group.group.maxMembers,
            }
          : undefined,
    };
  }

  async updateDirectSettings(userId: string, conversationId: string, body: unknown) {
    await this.assertMember(userId, conversationId);
    const data = directSettingsSchema.parse(body);
    const updated = await this.prisma.directConversationSettings.upsert({
      where: {
        conversationId_ownerUserId: { conversationId, ownerUserId: userId },
      },
      create: {
        conversationId,
        ownerUserId: userId,
        peerUserId:
          (
            await this.prisma.conversationMember.findFirstOrThrow({
              where: { conversationId, userId: { not: userId }, leftAt: null },
            })
          ).userId,
        messageTtlSeconds: data.message_ttl_seconds ?? 0,
        allowedMessageTypes: data.allowed_message_types ?? [
          'text',
          'voice',
          'image',
          'video',
          'file',
        ],
      },
      update: {
        messageTtlSeconds: data.message_ttl_seconds,
        allowedMessageTypes: data.allowed_message_types,
      },
    });
    return {
      message_ttl_seconds: updated.messageTtlSeconds,
      allowed_message_types: updated.allowedMessageTypes,
    };
  }

  async pin(userId: string, conversationId: string, pinned: boolean) {
    await this.assertMember(userId, conversationId);
    if (pinned) {
      await this.prisma.conversationPin.upsert({
        where: { conversationId_userId: { conversationId, userId } },
        create: { conversationId, userId },
        update: {},
      });
    } else {
      await this.prisma.conversationPin.deleteMany({ where: { conversationId, userId } });
    }
    return { success: true };
  }

  async mute(userId: string, conversationId: string, muted: boolean) {
    await this.assertMember(userId, conversationId);
    if (muted) {
      await this.prisma.conversationMute.upsert({
        where: { conversationId_userId: { conversationId, userId } },
        create: { conversationId, userId },
        update: {},
      });
    } else {
      await this.prisma.conversationMute.deleteMany({ where: { conversationId, userId } });
    }
    return { success: true };
  }

  async markRead(userId: string, conversationId: string, messageId?: string) {
    await this.assertMember(userId, conversationId);
    let lastReadAt = new Date();
    let lastReadMessageId = messageId ?? null;
    if (messageId) {
      const msg = await this.prisma.message.findFirst({
        where: { id: messageId, conversationId },
      });
      if (msg) {
        lastReadAt = msg.createdAt;
        lastReadMessageId = msg.id;
      }
    } else {
      const last = await this.prisma.message.findFirst({
        where: { conversationId },
        orderBy: { createdAt: 'desc' },
      });
      if (last) {
        lastReadAt = last.createdAt;
        lastReadMessageId = last.id;
      }
    }
    await this.prisma.conversationReadCursor.upsert({
      where: { conversationId_userId: { conversationId, userId } },
      create: { conversationId, userId, lastReadAt, lastReadMessageId },
      update: { lastReadAt, lastReadMessageId },
    });
    return { success: true, last_read_message_id: lastReadMessageId };
  }
}
