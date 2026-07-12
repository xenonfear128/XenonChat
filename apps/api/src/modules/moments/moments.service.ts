import { Injectable } from '@nestjs/common';
import { ErrorCodes, createMomentSchema } from '@xenonchat/shared';
import { MomentVisibility } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { AppError } from '../../common/errors/app-error';
import { BlocksService } from '../blocks/blocks.service';
import { ContactsService } from '../contacts/contacts.service';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class MomentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly blocks: BlocksService,
    private readonly contacts: ContactsService,
    private readonly notifications: NotificationsService,
  ) {}

  private async canView(viewerId: string, post: {
    id: string;
    authorId: string;
    visibility: MomentVisibility;
    deletedAt: Date | null;
    author: { privacy: { showMoments: boolean } | null };
  }) {
    if (post.deletedAt) return false;
    if (post.authorId === viewerId) return true;
    if (await this.blocks.isBlockedEitherWay(viewerId, post.authorId)) return false;
    if (post.author.privacy?.showMoments === false) return false;
    if (post.visibility === 'public') return true;
    if (post.visibility === 'private') return false;
    if (post.visibility === 'friends') {
      return this.contacts.areFriends(viewerId, post.authorId);
    }
    if (post.visibility === 'selected') {
      const rule = await this.prisma.momentVisibilityRule.findUnique({
        where: { postId_userId: { postId: post.id, userId: viewerId } },
      });
      return !!rule;
    }
    return false;
  }

  async create(userId: string, body: unknown) {
    const data = createMomentSchema.parse(body);
    const post = await this.prisma.momentPost.create({
      data: {
        authorId: userId,
        body: data.body,
        visibility: data.visibility as MomentVisibility,
        media: data.media_ids?.length
          ? {
              create: data.media_ids.map((mediaId, i) => ({ mediaId, sortOrder: i })),
            }
          : undefined,
        visibilityRules:
          data.visibility === 'selected' && data.selected_user_ids?.length
            ? {
                create: data.selected_user_ids.map((uid) => ({ userId: uid })),
              }
            : undefined,
      },
      include: {
        media: { include: { media: true } },
        author: true,
        reactions: true,
        comments: { where: { deletedAt: null }, take: 20 },
      },
    });
    return this.serialize(post, userId);
  }

  serialize(
    post: {
      id: string;
      authorId: string;
      body: string | null;
      visibility: string;
      createdAt: Date;
      author: { id: string; username: string; nickname: string; avatarUrl: string | null };
      media: Array<{ media: { id: string; mimeType: string; originalName: string | null } }>;
      reactions: Array<{ userId: string; reaction: string }>;
      comments: Array<{
        id: string;
        authorId: string;
        body: string;
        createdAt: Date;
        author?: { id: string; username: string; nickname: string; avatarUrl: string | null };
      }>;
    },
    viewerId: string,
  ) {
    return {
      id: post.id,
      body: post.body,
      visibility: post.visibility,
      created_at: post.createdAt.toISOString(),
      author: {
        id: post.author.id,
        user_id: post.author.username,
        nickname: post.author.nickname,
        avatar_url: post.author.avatarUrl,
      },
      media: post.media.map((m) => ({
        id: m.media.id,
        mime_type: m.media.mimeType,
        original_name: m.media.originalName,
      })),
      reactions_count: post.reactions.length,
      reacted: post.reactions.some((r) => r.userId === viewerId),
      comments: post.comments.map((c) => ({
        id: c.id,
        body: c.body,
        author_id: c.authorId,
        author: c.author
          ? {
              id: c.author.id,
              user_id: c.author.username,
              nickname: c.author.nickname,
              avatar_url: c.author.avatarUrl,
            }
          : undefined,
        created_at: c.createdAt.toISOString(),
      })),
    };
  }

  async feed(viewerId: string, cursor?: string, limit = 20) {
    const posts = await this.prisma.momentPost.findMany({
      where: {
        deletedAt: null,
        ...(cursor ? { createdAt: { lt: new Date(cursor) } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limit * 3,
      include: {
        author: { include: { privacy: true } },
        media: { include: { media: true } },
        reactions: true,
        comments: {
          where: { deletedAt: null },
          take: 5,
          orderBy: { createdAt: 'asc' },
          include: { author: true },
        },
      },
    });

    const visible = [];
    for (const p of posts) {
      if (await this.canView(viewerId, p)) {
        visible.push(this.serialize(p, viewerId));
      }
      if (visible.length >= limit) break;
    }
    return visible;
  }

  async get(viewerId: string, postId: string) {
    const post = await this.prisma.momentPost.findFirst({
      where: { id: postId },
      include: {
        author: { include: { privacy: true } },
        media: { include: { media: true } },
        reactions: true,
        comments: {
          where: { deletedAt: null },
          include: { author: true },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!post || !(await this.canView(viewerId, post))) {
      throw new AppError(ErrorCodes.MOMENT_NOT_VISIBLE, 'Moment not visible', 403);
    }
    return this.serialize(post, viewerId);
  }

  async delete(userId: string, postId: string) {
    const post = await this.prisma.momentPost.findFirst({ where: { id: postId, authorId: userId } });
    if (!post) throw new AppError(ErrorCodes.MOMENT_NOT_FOUND, 'Not found', 404);
    await this.prisma.momentPost.update({
      where: { id: postId },
      data: { deletedAt: new Date() },
    });
    return { success: true };
  }

  async comment(userId: string, postId: string, body: string) {
    const post = await this.prisma.momentPost.findFirst({
      where: { id: postId, deletedAt: null },
      include: { author: { include: { privacy: true } } },
    });
    if (!post || !(await this.canView(userId, post))) {
      throw new AppError(ErrorCodes.MOMENT_NOT_VISIBLE, 'Moment not visible', 403);
    }
    await this.blocks.assertNotBlocked(userId, post.authorId);
    const comment = await this.prisma.momentComment.create({
      data: { postId, authorId: userId, body: body.slice(0, 1000) },
      include: { author: true },
    });
    if (post.authorId !== userId) {
      await this.notifications.create({
        userId: post.authorId,
        type: 'moment_comment',
        title: 'New comment on your moment',
        body: body.slice(0, 100),
        payload: { post_id: postId, comment_id: comment.id },
      });
    }
    return {
      id: comment.id,
      body: comment.body,
      author: {
        id: comment.author.id,
        user_id: comment.author.username,
        nickname: comment.author.nickname,
        avatar_url: comment.author.avatarUrl,
      },
      created_at: comment.createdAt.toISOString(),
    };
  }

  async deleteComment(userId: string, commentId: string) {
    const comment = await this.prisma.momentComment.findUnique({
      where: { id: commentId },
      include: { post: true },
    });
    if (!comment) throw new AppError(ErrorCodes.NOT_FOUND, 'Comment not found', 404);
    if (comment.authorId !== userId && comment.post.authorId !== userId) {
      throw new AppError(ErrorCodes.PERMISSION_DENIED, 'Cannot delete comment', 403);
    }
    await this.prisma.momentComment.update({
      where: { id: commentId },
      data: { deletedAt: new Date() },
    });
    return { success: true };
  }

  async react(userId: string, postId: string, reaction = 'like') {
    const post = await this.prisma.momentPost.findFirst({
      where: { id: postId, deletedAt: null },
      include: { author: { include: { privacy: true } } },
    });
    if (!post || !(await this.canView(userId, post))) {
      throw new AppError(ErrorCodes.MOMENT_NOT_VISIBLE, 'Moment not visible', 403);
    }
    await this.blocks.assertNotBlocked(userId, post.authorId);
    await this.prisma.momentReaction.upsert({
      where: {
        postId_userId_reaction: { postId, userId, reaction },
      },
      create: { postId, userId, reaction },
      update: {},
    });
    if (post.authorId !== userId) {
      await this.notifications.create({
        userId: post.authorId,
        type: 'moment_reaction',
        title: 'Someone liked your moment',
        payload: { post_id: postId, user_id: userId },
      });
    }
    return { success: true };
  }

  async unreact(userId: string, postId: string, reaction = 'like') {
    await this.prisma.momentReaction.deleteMany({
      where: { postId, userId, reaction },
    });
    return { success: true };
  }

  async report(userId: string, postId: string, reason: string) {
    await this.prisma.momentReport.create({
      data: { postId, reporterId: userId, reason: reason.slice(0, 500) },
    });
    return { success: true };
  }
}
