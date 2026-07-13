import { Injectable, Inject, forwardRef } from '@nestjs/common';
import {
  ErrorCodes,
  canGroupAction,
  canKickMember,
  createGroupSchema,
  updateGroupSettingsSchema,
  announcementSchema,
  WsServerEvents,
  GroupRole,
} from '@xenonchat/shared';
import { FormatMode, GroupRole as PrismaGroupRole } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { AppError } from '../../common/errors/app-error';
import { RealtimeService } from '../realtime/realtime.service';

@Injectable()
export class GroupsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    @Inject(forwardRef(() => RealtimeService))
    private readonly realtime: RealtimeService,
  ) {}

  private defaultMax() {
    return Number(this.config.get('DEFAULT_GROUP_MAX_MEMBERS', 500));
  }

  private absoluteMax() {
    return Number(this.config.get('ABSOLUTE_GROUP_MAX_MEMBERS', 2000));
  }

  private async audit(
    groupId: string,
    actorUserId: string,
    action: string,
    opts: { targetUserId?: string; before?: unknown; after?: unknown } = {},
  ) {
    await this.prisma.groupAuditLog.create({
      data: {
        groupId,
        actorUserId,
        targetUserId: opts.targetUserId,
        action,
        beforeValue: opts.before as object | undefined,
        afterValue: opts.after as object | undefined,
      },
    });
  }

  private async requireMember(groupId: string, userId: string) {
    const member = await this.prisma.groupMember.findFirst({
      where: { groupId, userId, leftAt: null },
      include: { group: true },
    });
    if (!member || member.group.status === 'dissolved') {
      throw new AppError(ErrorCodes.GROUP_NOT_FOUND, 'Group not found', 404);
    }
    return member;
  }

  private mapRole(role: PrismaGroupRole): GroupRole {
    return role as GroupRole;
  }

  async create(ownerId: string, body: unknown) {
    const data = createGroupSchema.parse(body);
    const existing = await this.prisma.group.findUnique({
      where: { publicId: data.public_id.toLowerCase() },
    });
    if (existing) throw new AppError(ErrorCodes.GROUP_ID_ALREADY_EXISTS, 'Group ID taken');

    const maxMembers = this.defaultMax();
    const rateLimit = Number(this.config.get('DEFAULT_GROUP_RATE_LIMIT_PER_SEC', 10));

    const memberIds = Array.from(new Set([ownerId, ...(data.member_ids ?? [])]));
    if (memberIds.length > maxMembers) {
      throw new AppError(ErrorCodes.GROUP_FULL, 'Too many initial members');
    }

    const group = await this.prisma.$transaction(async (tx) => {
      const g = await tx.group.create({
        data: {
          publicId: data.public_id.toLowerCase(),
          name: data.name,
          description: data.description,
          ownerUserId: ownerId,
          maxMembers,
          memberCount: memberIds.length,
          rateLimitPerSec: rateLimit,
          members: {
            create: memberIds.map((userId) => ({
              userId,
              role: userId === ownerId ? 'owner' : 'member',
            })),
          },
        },
      });
      const conversation = await tx.conversation.create({
        data: {
          type: 'group',
          groupId: g.id,
          members: {
            create: memberIds.map((userId) => ({ userId })),
          },
        },
      });
      return { ...g, conversationId: conversation.id };
    });

    await this.audit(group.id, ownerId, 'create_group', { after: { public_id: group.publicId } });
    return this.get(ownerId, group.id);
  }

  async get(userId: string, groupId: string) {
    const member = await this.requireMember(groupId, userId);
    const g = member.group;
    const pinned = await this.prisma.groupAnnouncement.findFirst({
      where: { groupId, pinned: true, deletedAt: null },
    });
    const conversation = await this.prisma.conversation.findUnique({ where: { groupId } });
    return {
      id: g.id,
      group_id: g.publicId,
      name: g.name,
      avatar_url: g.avatarUrl,
      description: g.description,
      owner_user_id: g.ownerUserId,
      max_members: g.maxMembers,
      member_count: g.memberCount,
      message_ttl_seconds: g.messageTtlSeconds,
      allowed_message_types: g.allowedMessageTypes,
      slow_mode_seconds: g.slowModeSeconds,
      rate_limit_per_sec: g.rateLimitPerSec,
      status: g.status,
      my_role: member.role,
      conversation_id: conversation?.id,
      pinned_announcement: pinned
        ? {
            id: pinned.id,
            title: pinned.title,
            body: pinned.body,
            format_mode: pinned.formatMode,
            created_at: pinned.createdAt.toISOString(),
          }
        : null,
      created_at: g.createdAt.toISOString(),
    };
  }

  async listMembers(userId: string, groupId: string) {
    await this.requireMember(groupId, userId);
    const members = await this.prisma.groupMember.findMany({
      where: { groupId, leftAt: null },
      include: { user: true },
      orderBy: [{ role: 'asc' }, { joinedAt: 'asc' }],
    });
    return members.map((m) => ({
      user: {
        id: m.user.id,
        user_id: m.user.username,
        nickname: m.user.nickname,
        avatar_url: m.user.avatarUrl,
      },
      role: m.role,
      muted_until: m.mutedUntil?.toISOString(),
      joined_at: m.joinedAt.toISOString(),
    }));
  }

  async invite(actorId: string, groupId: string, userIds: string[]) {
    const actor = await this.requireMember(groupId, actorId);
    if (!canGroupAction(this.mapRole(actor.role), 'invite')) {
      throw new AppError(ErrorCodes.PERMISSION_DENIED, 'Cannot invite', 403);
    }
    const group = actor.group;
    const uniqueUserIds = Array.from(new Set(userIds)).filter(
      (userId) => userId !== actorId,
    );
    const activeMembers = await this.prisma.groupMember.findMany({
      where: {
        groupId,
        leftAt: null,
      },
      select: { userId: true },
    });
    const activeIds = new Set(activeMembers.map((member) => member.userId));
    const toInvite = uniqueUserIds.filter((userId) => !activeIds.has(userId));
    if (activeMembers.length + toInvite.length > group.maxMembers) {
      throw new AppError(ErrorCodes.GROUP_FULL, 'Group is full');
    }
    const validUsers = await this.prisma.user.count({
      where: {
        id: { in: toInvite },
        status: 'normal',
        deletedAt: null,
      },
    });
    if (validUsers !== toInvite.length) {
      throw new AppError(ErrorCodes.USER_NOT_FOUND, 'One or more users not found', 404);
    }
    const blockedTargets = await this.prisma.blockedUser.count({
      where: {
        OR: toInvite.flatMap((targetUserId) => [
          { blockerUserId: actorId, blockedUserId: targetUserId },
          { blockerUserId: targetUserId, blockedUserId: actorId },
        ]),
      },
    });
    if (blockedTargets > 0) {
      throw new AppError(
        ErrorCodes.USER_BLOCKED,
        'A blocked user cannot be invited',
        403,
      );
    }

    const conversation = await this.prisma.conversation.findUniqueOrThrow({ where: { groupId } });
    for (const uid of toInvite) {
      const existing = await this.prisma.groupMember.findUnique({
        where: { groupId_userId: { groupId, userId: uid } },
      });
      if (existing && !existing.leftAt) continue;
      if (existing) {
        await this.prisma.groupMember.update({
          where: { id: existing.id },
          data: { leftAt: null, role: 'member', joinedAt: new Date() },
        });
      } else {
        await this.prisma.groupMember.create({
          data: { groupId, userId: uid, role: 'member' },
        });
      }
      await this.prisma.conversationMember.upsert({
        where: {
          conversationId_userId: { conversationId: conversation.id, userId: uid },
        },
        create: { conversationId: conversation.id, userId: uid },
        update: { leftAt: null },
      });
      await this.audit(groupId, actorId, 'invite_member', { targetUserId: uid });
      await this.realtime.broadcastToConversation(conversation.id, {
        event: WsServerEvents.GROUP_MEMBER_JOINED,
        payload: { group_id: groupId, user_id: uid },
      });
    }
    await this.prisma.group.update({
      where: { id: groupId },
      data: {
        memberCount: await this.prisma.groupMember.count({
          where: { groupId, leftAt: null },
        }),
      },
    });
    return this.listMembers(actorId, groupId);
  }

  async leave(userId: string, groupId: string) {
    const member = await this.requireMember(groupId, userId);
    if (member.role === 'owner') {
      throw new AppError(ErrorCodes.OWNER_MUST_TRANSFER, 'Owner must transfer before leaving', 403);
    }
    await this.prisma.groupMember.update({
      where: { id: member.id },
      data: { leftAt: new Date() },
    });
    const conversation = await this.prisma.conversation.findUnique({ where: { groupId } });
    if (conversation) {
      await this.prisma.conversationMember.updateMany({
        where: { conversationId: conversation.id, userId },
        data: { leftAt: new Date() },
      });
      await this.realtime.broadcastToConversation(conversation.id, {
        event: WsServerEvents.GROUP_MEMBER_LEFT,
        payload: { group_id: groupId, user_id: userId },
      });
    }
    await this.prisma.group.update({
      where: { id: groupId },
      data: { memberCount: { decrement: 1 } },
    });
    await this.audit(groupId, userId, 'leave');
    return { success: true };
  }

  async kick(actorId: string, groupId: string, targetUserId: string) {
    const actor = await this.requireMember(groupId, actorId);
    const target = await this.requireMember(groupId, targetUserId);
    const check = canKickMember(this.mapRole(actor.role), this.mapRole(target.role));
    if (!check.allowed) {
      throw new AppError(check.reason ?? ErrorCodes.PERMISSION_DENIED, 'Cannot kick', 403);
    }
    await this.prisma.groupMember.update({
      where: { id: target.id },
      data: { leftAt: new Date() },
    });
    const conversation = await this.prisma.conversation.findUnique({ where: { groupId } });
    if (conversation) {
      await this.prisma.conversationMember.updateMany({
        where: { conversationId: conversation.id, userId: targetUserId },
        data: { leftAt: new Date() },
      });
      await this.realtime.broadcastToConversation(conversation.id, {
        event: WsServerEvents.GROUP_MEMBER_KICKED,
        payload: { group_id: groupId, user_id: targetUserId, by: actorId },
      });
    }
    await this.prisma.group.update({
      where: { id: groupId },
      data: { memberCount: { decrement: 1 } },
    });
    await this.audit(groupId, actorId, 'kick_member', { targetUserId });
    return { success: true };
  }

  async setAdmin(actorId: string, groupId: string, targetUserId: string, makeAdmin: boolean) {
    const actor = await this.requireMember(groupId, actorId);
    if (makeAdmin && !canGroupAction(this.mapRole(actor.role), 'set_admin')) {
      throw new AppError(ErrorCodes.PERMISSION_DENIED, 'Only owner can set admin', 403);
    }
    if (!makeAdmin && !canGroupAction(this.mapRole(actor.role), 'revoke_admin')) {
      throw new AppError(ErrorCodes.PERMISSION_DENIED, 'Only owner can revoke admin', 403);
    }
    const target = await this.requireMember(groupId, targetUserId);
    if (target.role === 'owner') {
      throw new AppError(ErrorCodes.PERMISSION_DENIED, 'Cannot change owner role', 403);
    }
    await this.prisma.groupMember.update({
      where: { id: target.id },
      data: { role: makeAdmin ? 'admin' : 'member' },
    });
    await this.audit(groupId, actorId, makeAdmin ? 'set_admin' : 'revoke_admin', {
      targetUserId,
    });
    return { success: true };
  }

  async transferOwner(actorId: string, groupId: string, newOwnerId: string) {
    const actor = await this.requireMember(groupId, actorId);
    if (!canGroupAction(this.mapRole(actor.role), 'transfer_owner')) {
      throw new AppError(ErrorCodes.PERMISSION_DENIED, 'Only owner can transfer', 403);
    }
    const target = await this.requireMember(groupId, newOwnerId);
    await this.prisma.$transaction([
      this.prisma.groupMember.update({ where: { id: actor.id }, data: { role: 'admin' } }),
      this.prisma.groupMember.update({ where: { id: target.id }, data: { role: 'owner' } }),
      this.prisma.group.update({ where: { id: groupId }, data: { ownerUserId: newOwnerId } }),
    ]);
    await this.audit(groupId, actorId, 'transfer_owner', { targetUserId: newOwnerId });
    return { success: true };
  }

  async dissolve(actorId: string, groupId: string) {
    const actor = await this.requireMember(groupId, actorId);
    if (!canGroupAction(this.mapRole(actor.role), 'dissolve')) {
      throw new AppError(ErrorCodes.PERMISSION_DENIED, 'Only owner can dissolve', 403);
    }
    await this.prisma.group.update({
      where: { id: groupId },
      data: { status: 'dissolved', dissolvedAt: new Date() },
    });
    await this.audit(groupId, actorId, 'dissolve');
    return { success: true };
  }

  async updateSettings(actorId: string, groupId: string, body: unknown) {
    const actor = await this.requireMember(groupId, actorId);
    if (!canGroupAction(this.mapRole(actor.role), 'update_settings')) {
      throw new AppError(ErrorCodes.PERMISSION_DENIED, 'Cannot update settings', 403);
    }
    const data = updateGroupSettingsSchema.parse(body);
    const group = actor.group;

    if (data.max_members != null) {
      if (data.max_members < group.memberCount) {
        throw new AppError(ErrorCodes.MAX_MEMBERS_TOO_LOW, 'Max members below current count');
      }
      if (data.max_members > this.absoluteMax()) {
        throw new AppError(ErrorCodes.MAX_MEMBERS_TOO_HIGH, 'Exceeds system limit');
      }
    }
    if (data.public_id && data.public_id.toLowerCase() !== group.publicId) {
      const taken = await this.prisma.group.findUnique({
        where: { publicId: data.public_id.toLowerCase() },
      });
      if (taken) throw new AppError(ErrorCodes.GROUP_ID_ALREADY_EXISTS, 'Group ID taken');
    }

    const before = {
      name: group.name,
      max_members: group.maxMembers,
      message_ttl_seconds: group.messageTtlSeconds,
      allowed_message_types: group.allowedMessageTypes,
      slow_mode_seconds: group.slowModeSeconds,
    };

    const updated = await this.prisma.group.update({
      where: { id: groupId },
      data: {
        name: data.name,
        description: data.description,
        publicId: data.public_id?.toLowerCase(),
        publicIdChangedAt: data.public_id ? new Date() : undefined,
        maxMembers: data.max_members,
        messageTtlSeconds: data.message_ttl_seconds,
        allowedMessageTypes: data.allowed_message_types,
        slowModeSeconds: data.slow_mode_seconds,
        rateLimitPerSec: data.rate_limit_per_sec,
      },
    });

    await this.audit(groupId, actorId, 'update_settings', { before, after: data });
    const conversation = await this.prisma.conversation.findUnique({ where: { groupId } });
    if (conversation) {
      await this.realtime.broadcastToConversation(conversation.id, {
        event: WsServerEvents.GROUP_SETTINGS_UPDATED,
        payload: { group_id: groupId },
      });
    }
    return this.get(actorId, updated.id);
  }

  async listAnnouncements(userId: string, groupId: string) {
    await this.requireMember(groupId, userId);
    const rows = await this.prisma.groupAnnouncement.findMany({
      where: { groupId, deletedAt: null },
      orderBy: [{ pinned: 'desc' }, { createdAt: 'desc' }],
    });
    return rows.map((a) => ({
      id: a.id,
      title: a.title,
      body: a.body,
      format_mode: a.formatMode,
      pinned: a.pinned,
      author_user_id: a.authorId,
      created_at: a.createdAt.toISOString(),
      updated_at: a.updatedAt.toISOString(),
    }));
  }

  async createAnnouncement(userId: string, groupId: string, body: unknown) {
    const actor = await this.requireMember(groupId, userId);
    if (!canGroupAction(this.mapRole(actor.role), 'manage_announcement')) {
      throw new AppError(ErrorCodes.PERMISSION_DENIED, 'Cannot create announcement', 403);
    }
    const data = announcementSchema.parse(body);
    const ann = await this.prisma.groupAnnouncement.create({
      data: {
        groupId,
        authorId: userId,
        title: data.title,
        body: data.body,
        formatMode: data.format_mode as FormatMode,
      },
    });
    const conversation = await this.prisma.conversation.findUnique({ where: { groupId } });
    if (conversation) {
      await this.prisma.message.create({
        data: {
          conversationId: conversation.id,
          senderUserId: userId,
          messageType: 'system',
          body: `announcement:${ann.id}`,
          formatMode: 'plain',
        },
      });
      await this.realtime.broadcastToConversation(conversation.id, {
        event: WsServerEvents.GROUP_ANNOUNCEMENT_CREATED,
        payload: { group_id: groupId, announcement_id: ann.id, title: ann.title },
      });
    }
    await this.audit(groupId, userId, 'create_announcement', { after: { id: ann.id } });
    return {
      id: ann.id,
      title: ann.title,
      body: ann.body,
      format_mode: ann.formatMode,
      pinned: ann.pinned,
      created_at: ann.createdAt.toISOString(),
    };
  }

  async updateAnnouncement(
    userId: string,
    groupId: string,
    announcementId: string,
    body: unknown,
  ) {
    const actor = await this.requireMember(groupId, userId);
    if (!canGroupAction(this.mapRole(actor.role), 'manage_announcement')) {
      throw new AppError(ErrorCodes.PERMISSION_DENIED, 'Cannot edit announcement', 403);
    }
    const data = announcementSchema.partial().parse(body);
    const ann = await this.prisma.groupAnnouncement.findFirst({
      where: { id: announcementId, groupId, deletedAt: null },
    });
    if (!ann) throw new AppError(ErrorCodes.ANNOUNCEMENT_NOT_FOUND, 'Not found', 404);
    const updated = await this.prisma.groupAnnouncement.update({
      where: { id: announcementId },
      data: {
        title: data.title,
        body: data.body,
        formatMode: data.format_mode as FormatMode | undefined,
      },
    });
    await this.audit(groupId, userId, 'edit_announcement', { after: { id: announcementId } });
    return {
      id: updated.id,
      title: updated.title,
      body: updated.body,
      format_mode: updated.formatMode,
      pinned: updated.pinned,
    };
  }

  async deleteAnnouncement(userId: string, groupId: string, announcementId: string) {
    const actor = await this.requireMember(groupId, userId);
    if (!canGroupAction(this.mapRole(actor.role), 'manage_announcement')) {
      throw new AppError(ErrorCodes.PERMISSION_DENIED, 'Cannot delete announcement', 403);
    }
    await this.prisma.groupAnnouncement.updateMany({
      where: { id: announcementId, groupId },
      data: { deletedAt: new Date(), pinned: false },
    });
    await this.audit(groupId, userId, 'delete_announcement', { after: { id: announcementId } });
    return { success: true };
  }

  async pinAnnouncement(userId: string, groupId: string, announcementId: string, pinned: boolean) {
    const actor = await this.requireMember(groupId, userId);
    if (!canGroupAction(this.mapRole(actor.role), 'pin_announcement')) {
      throw new AppError(ErrorCodes.PERMISSION_DENIED, 'Cannot pin announcement', 403);
    }
    const ann = await this.prisma.groupAnnouncement.findFirst({
      where: { id: announcementId, groupId, deletedAt: null },
    });
    if (!ann) throw new AppError(ErrorCodes.ANNOUNCEMENT_NOT_FOUND, 'Not found', 404);

    await this.prisma.$transaction([
      this.prisma.groupAnnouncement.updateMany({
        where: { groupId, pinned: true },
        data: { pinned: false, pinnedOrder: 0 },
      }),
      ...(pinned
        ? [
            this.prisma.groupAnnouncement.update({
              where: { id: announcementId },
              data: { pinned: true, pinnedOrder: 1 },
            }),
          ]
        : []),
    ]);

    const conversation = await this.prisma.conversation.findUnique({ where: { groupId } });
    if (conversation && pinned) {
      await this.realtime.broadcastToConversation(conversation.id, {
        event: WsServerEvents.GROUP_ANNOUNCEMENT_PINNED,
        payload: { group_id: groupId, announcement_id: announcementId },
      });
    }
    await this.audit(groupId, userId, pinned ? 'pin_announcement' : 'unpin_announcement', {
      after: { id: announcementId },
    });
    return { success: true };
  }

  async auditLogs(userId: string, groupId: string) {
    const actor = await this.requireMember(groupId, userId);
    if (!canGroupAction(this.mapRole(actor.role), 'view_audit')) {
      throw new AppError(ErrorCodes.PERMISSION_DENIED, 'Cannot view audit', 403);
    }
    const logs = await this.prisma.groupAuditLog.findMany({
      where: { groupId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return logs.map((l) => ({
      id: l.id,
      action: l.action,
      actor_user_id: l.actorUserId,
      target_user_id: l.targetUserId,
      before_value: l.beforeValue,
      after_value: l.afterValue,
      created_at: l.createdAt.toISOString(),
    }));
  }
}
