import { Injectable, Inject, forwardRef } from '@nestjs/common';
import {
  ErrorCodes,
  computeExpiresAt,
  extractUrls,
  isMessageTypeAllowed,
  sendMessageSchema,
  AllowedChatMessageType,
  WsServerEvents,
} from '@xenonchat/shared';
import { FormatMode, MessageType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AppError } from '../../common/errors/app-error';
import { ConversationsService } from '../conversations/conversations.service';
import { BlocksService } from '../blocks/blocks.service';
import { RateLimitService } from '../../common/rate-limit/rate-limit.service';
import { LinkPreviewService } from '../link-preview/link-preview.service';
import { RealtimeService } from '../realtime/realtime.service';
import { StorageService } from '../../storage/storage.service';

@Injectable()
export class MessagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly conversations: ConversationsService,
    private readonly blocks: BlocksService,
    private readonly rateLimit: RateLimitService,
    private readonly linkPreview: LinkPreviewService,
    private readonly storage: StorageService,
    @Inject(forwardRef(() => RealtimeService))
    private readonly realtime: RealtimeService,
  ) {}

  serializeMessage(m: {
    id: string;
    conversationId: string;
    senderUserId: string | null;
    clientMessageId: string | null;
    messageType: string;
    body: string | null;
    formatMode: string;
    ttlSeconds: number | null;
    expiresAt: Date | null;
    editedAt: Date | null;
    revokedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
    sender?: { id: string; username: string; nickname: string; avatarUrl: string | null } | null;
    quote?: {
      quotedMessageId: string;
      quotedSenderUserId: string | null;
      quotedSenderDisplayName: string | null;
      quoteType: string;
      snapshotText: string | null;
      snapshotFormat: string | null;
      startOffset: number | null;
      endOffset: number | null;
      quotedMessageType: string | null;
      quotedAttachmentSummary: string | null;
      quotedCreatedAt: Date | null;
      originalExpired: boolean;
    } | null;
    attachments?: Array<{
      media: {
        id: string;
        mimeType: string;
        sizeBytes: number;
        originalName: string | null;
        width: number | null;
        height: number | null;
        durationMs: number | null;
        storageKey: string;
      };
    }>;
    linkPreviews?: Array<{
      linkPreview: {
        id: string;
        url: string;
        domain: string | null;
        title: string | null;
        description: string | null;
        imageUrl: string | null;
        siteName: string | null;
        faviconUrl: string | null;
      };
    }>;
  }) {
    const expired = m.expiresAt ? m.expiresAt <= new Date() : false;
    const revoked = !!m.revokedAt;
    return {
      id: m.id,
      conversation_id: m.conversationId,
      sender_user_id: m.senderUserId,
      client_message_id: m.clientMessageId,
      message_type: expired || revoked ? (revoked ? m.messageType : 'deleted') : m.messageType,
      body: expired || revoked ? null : m.body,
      format_mode: m.formatMode,
      ttl_seconds: m.ttlSeconds,
      expires_at: m.expiresAt?.toISOString(),
      edited_at: m.editedAt?.toISOString(),
      revoked_at: m.revokedAt?.toISOString(),
      created_at: m.createdAt.toISOString(),
      updated_at: m.updatedAt.toISOString(),
      expired,
      revoked,
      sender: m.sender
        ? {
            id: m.sender.id,
            user_id: m.sender.username,
            nickname: m.sender.nickname,
            avatar_url: m.sender.avatarUrl,
          }
        : null,
      quote: m.quote
        ? {
            quoted_message_id: m.quote.quotedMessageId,
            quoted_sender_user_id: m.quote.quotedSenderUserId,
            quoted_sender_display_name: m.quote.quotedSenderDisplayName,
            quote_type: m.quote.quoteType,
            snapshot_text: m.quote.originalExpired ? null : m.quote.snapshotText,
            snapshot_format: m.quote.snapshotFormat,
            start_offset: m.quote.startOffset,
            end_offset: m.quote.endOffset,
            quoted_message_type: m.quote.quotedMessageType,
            quoted_attachment_summary: m.quote.quotedAttachmentSummary,
            quoted_created_at: m.quote.quotedCreatedAt?.toISOString(),
            original_expired: m.quote.originalExpired,
          }
        : null,
      attachments: expired || revoked
        ? []
        : (m.attachments ?? []).map((a) => ({
            id: a.media.id,
            mime_type: a.media.mimeType,
            size_bytes: a.media.sizeBytes,
            original_name: a.media.originalName,
            width: a.media.width,
            height: a.media.height,
            duration_ms: a.media.durationMs,
            storage_key: a.media.storageKey,
          })),
      link_previews: expired || revoked
        ? []
        : (m.linkPreviews ?? []).map((lp) => ({
            id: lp.linkPreview.id,
            url: lp.linkPreview.url,
            domain: lp.linkPreview.domain,
            title: lp.linkPreview.title,
            description: lp.linkPreview.description,
            image_url: lp.linkPreview.imageUrl,
            site_name: lp.linkPreview.siteName,
            favicon_url: lp.linkPreview.faviconUrl,
          })),
    };
  }

  async withAttachmentUrls<T extends { attachments?: Array<{ id: string; storage_key?: string; url?: string }> }>(
    message: T,
  ): Promise<T> {
    if (!message.attachments?.length) return message;
    const attachments = await Promise.all(
      message.attachments.map(async (a) => {
        if (!a.storage_key) return a;
        const url = await this.storage.getSignedDownloadUrl(a.storage_key);
        const { storage_key: _sk, ...rest } = a;
        return { ...rest, url };
      }),
    );
    return { ...message, attachments };
  }

  async listMessages(
    userId: string,
    conversationId: string,
    opts: { before?: string; limit?: number; after?: string } = {},
  ) {
    await this.conversations.assertMember(userId, conversationId);
    const limit = Math.min(opts.limit ?? 50, 100);
    let beforeDate: Date | undefined;
    let afterDate: Date | undefined;
    if (opts.before) {
      const m = await this.prisma.message.findUnique({ where: { id: opts.before } });
      beforeDate = m?.createdAt;
    }
    if (opts.after) {
      const m = await this.prisma.message.findUnique({ where: { id: opts.after } });
      afterDate = m?.createdAt;
    }

    const messages = await this.prisma.message.findMany({
      where: {
        conversationId,
        deletedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        deletions: { none: { userId } },
        ...(beforeDate ? { createdAt: { lt: beforeDate } } : {}),
        ...(afterDate ? { createdAt: { gt: afterDate } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: {
        sender: true,
        quote: true,
        attachments: { include: { media: true } },
        linkPreviews: { include: { linkPreview: true } },
      },
    });

    const serialized = messages.reverse().map((m) => this.serializeMessage(m));
    return Promise.all(serialized.map((m) => this.withAttachmentUrls(m)));
  }

  async send(userId: string, body: unknown) {
    const data = sendMessageSchema.parse(body);
    const membership = await this.conversations.assertMember(userId, data.conversation_id);
    const conversation = await this.prisma.conversation.findUniqueOrThrow({
      where: { id: data.conversation_id },
      include: { group: true, members: { where: { leftAt: null } } },
    });

    // Idempotency
    const existing = await this.prisma.message.findFirst({
      where: { senderUserId: userId, clientMessageId: data.client_message_id },
      include: {
        sender: true,
        quote: true,
        attachments: { include: { media: true } },
        linkPreviews: { include: { linkPreview: true } },
      },
    });
    if (existing) return this.withAttachmentUrls(this.serializeMessage(existing));

    await this.rateLimit.assertUserMessage(userId, data.conversation_id);

    let ttlSeconds = 0;
    let allowedTypes: string[] = ['text', 'voice', 'image', 'video', 'file'];
    let peerId: string | undefined;

    if (conversation.type === 'direct') {
      peerId = conversation.members.find((m) => m.userId !== userId)?.userId;
      if (!peerId) throw new AppError(ErrorCodes.CONVERSATION_NOT_FOUND, 'Peer missing', 404);
      await this.blocks.assertNotBlocked(userId, peerId);

      const receiverSettings = await this.prisma.directConversationSettings.findUnique({
        where: {
          conversationId_ownerUserId: {
            conversationId: conversation.id,
            ownerUserId: peerId,
          },
        },
      });
      const senderSettings = await this.prisma.directConversationSettings.findUnique({
        where: {
          conversationId_ownerUserId: {
            conversationId: conversation.id,
            ownerUserId: userId,
          },
        },
      });
      allowedTypes = receiverSettings?.allowedMessageTypes ?? allowedTypes;
      ttlSeconds = senderSettings?.messageTtlSeconds ?? 0;
    } else if (conversation.group) {
      const group = conversation.group;
      if (group.status !== 'normal') {
        throw new AppError(ErrorCodes.GROUP_DISSOLVED, 'Group unavailable', 403);
      }
      allowedTypes = group.allowedMessageTypes;
      ttlSeconds = group.messageTtlSeconds;

      const gm = await this.prisma.groupMember.findFirst({
        where: { groupId: group.id, userId, leftAt: null },
      });
      if (!gm) throw new AppError(ErrorCodes.PERMISSION_DENIED, 'Not a group member', 403);
      if (gm.mutedUntil && gm.mutedUntil > new Date()) {
        throw new AppError(ErrorCodes.PERMISSION_DENIED, 'You are muted', 403);
      }

      const exempt = gm.role === 'owner' || gm.role === 'admin';
      await this.rateLimit.assertGroupSlowMode(group.id, userId, group.slowModeSeconds, exempt);
      await this.rateLimit.assertGroupGlobalRate(group.id, group.rateLimitPerSec);
    }

    if (!isMessageTypeAllowed(allowedTypes as AllowedChatMessageType[], data.message_type)) {
      throw new AppError(ErrorCodes.MESSAGE_TYPE_NOT_ALLOWED, 'Message type not allowed', 403);
    }

    if (['text'].includes(data.message_type) && !data.body?.trim()) {
      throw new AppError(ErrorCodes.VALIDATION_ERROR, 'Message body required');
    }

    // Quote validation
    let quoteCreate:
      | {
          quotedMessageId: string;
          quotedSenderUserId: string | null;
          quotedSenderDisplayName: string | null;
          quoteType: 'full' | 'partial';
          snapshotText: string | null;
          snapshotFormat: FormatMode | null;
          startOffset: number | null;
          endOffset: number | null;
          quotedMessageType: MessageType | null;
          quotedAttachmentSummary: string | null;
          quotedCreatedAt: Date | null;
        }
      | undefined;

    if (data.quote) {
      const quoted = await this.prisma.message.findFirst({
        where: {
          id: data.quote.quoted_message_id,
          conversationId: data.conversation_id,
          deletedAt: null,
          revokedAt: null,
        },
        include: { sender: true, attachments: { include: { media: true } } },
      });
      if (!quoted || (quoted.expiresAt && quoted.expiresAt <= new Date())) {
        throw new AppError(ErrorCodes.QUOTED_MESSAGE_NOT_FOUND, 'Quoted message unavailable');
      }
      let snapshot =
        data.quote.snapshot_text ??
        (data.quote.quote_type === 'partial' &&
        data.quote.start_offset != null &&
        data.quote.end_offset != null &&
        quoted.body
          ? quoted.body.slice(data.quote.start_offset, data.quote.end_offset)
          : quoted.body);
      quoteCreate = {
        quotedMessageId: quoted.id,
        quotedSenderUserId: quoted.senderUserId,
        quotedSenderDisplayName: quoted.sender?.nickname ?? null,
        quoteType: data.quote.quote_type,
        snapshotText: snapshot?.slice(0, 2000) ?? null,
        snapshotFormat: quoted.formatMode,
        startOffset: data.quote.start_offset ?? null,
        endOffset: data.quote.end_offset ?? null,
        quotedMessageType: quoted.messageType,
        quotedAttachmentSummary: quoted.attachments[0]?.media.originalName ?? null,
        quotedCreatedAt: quoted.createdAt,
      };
    }

    const createdAt = new Date();
    const expiresAt = computeExpiresAt(createdAt, ttlSeconds);

    const message = await this.prisma.message.create({
      data: {
        conversationId: data.conversation_id,
        senderUserId: userId,
        clientMessageId: data.client_message_id,
        messageType: data.message_type as MessageType,
        body: data.body,
        formatMode: data.format_mode as FormatMode,
        ttlSeconds: ttlSeconds || null,
        expiresAt,
        createdAt,
        quote: quoteCreate ? { create: quoteCreate } : undefined,
        attachments: data.attachment_ids?.length
          ? {
              create: data.attachment_ids.map((mediaId, i) => ({
                mediaId,
                sortOrder: i,
              })),
            }
          : undefined,
      },
      include: {
        sender: true,
        quote: true,
        attachments: { include: { media: true } },
        linkPreviews: { include: { linkPreview: true } },
      },
    });

    await this.prisma.conversation.update({
      where: { id: data.conversation_id },
      data: { updatedAt: new Date() },
    });

    // Link preview (best effort, first URL)
    if (data.enable_link_preview !== false && data.body) {
      const urls = extractUrls(data.body);
      if (urls[0]) {
        try {
          const preview = await this.linkPreview.fetch(urls[0]);
          if (preview) {
            await this.prisma.messageLinkPreview.create({
              data: { messageId: message.id, linkPreviewId: preview.id },
            });
            const refreshed = await this.prisma.message.findUniqueOrThrow({
              where: { id: message.id },
              include: {
                sender: true,
                quote: true,
                attachments: { include: { media: true } },
                linkPreviews: { include: { linkPreview: true } },
              },
            });
            const serialized = await this.withAttachmentUrls(this.serializeMessage(refreshed));
            await this.realtime.broadcastToConversation(data.conversation_id, {
              event: WsServerEvents.MESSAGE_NEW,
              payload: serialized,
            });
            return serialized;
          }
        } catch {
          /* ignore preview failures */
        }
      }
    }

    const serialized = await this.withAttachmentUrls(this.serializeMessage(message));
    await this.realtime.broadcastToConversation(data.conversation_id, {
      event: WsServerEvents.MESSAGE_NEW,
      payload: serialized,
    });
    return serialized;
  }

  async revoke(userId: string, messageId: string) {
    const message = await this.prisma.message.findUnique({ where: { id: messageId } });
    if (!message || message.senderUserId !== userId) {
      throw new AppError(ErrorCodes.PERMISSION_DENIED, 'Cannot revoke', 403);
    }
    if (message.revokedAt) return { success: true };
    const age = Date.now() - message.createdAt.getTime();
    if (age > 2 * 60 * 1000) {
      throw new AppError(ErrorCodes.PERMISSION_DENIED, 'Revoke window expired', 403);
    }
    await this.prisma.message.update({
      where: { id: messageId },
      data: { revokedAt: new Date(), body: null },
    });
    await this.realtime.broadcastToConversation(message.conversationId, {
      event: WsServerEvents.MESSAGE_REVOKE,
      payload: { message_id: messageId, conversation_id: message.conversationId },
    });
    return { success: true };
  }

  async deleteForMe(userId: string, messageId: string) {
    const message = await this.prisma.message.findUnique({ where: { id: messageId } });
    if (!message) throw new AppError(ErrorCodes.MESSAGE_NOT_FOUND, 'Not found', 404);
    await this.conversations.assertMember(userId, message.conversationId);
    await this.prisma.messageDeletion.upsert({
      where: { messageId_userId: { messageId, userId } },
      create: { messageId, userId },
      update: {},
    });
    return { success: true };
  }

  async report(userId: string, messageId: string, reason: string) {
    const message = await this.prisma.message.findUnique({ where: { id: messageId } });
    if (!message) throw new AppError(ErrorCodes.MESSAGE_NOT_FOUND, 'Not found', 404);
    await this.prisma.messageReport.create({
      data: { messageId, reporterId: userId, reason: reason.slice(0, 500) },
    });
    return { success: true };
  }
}
