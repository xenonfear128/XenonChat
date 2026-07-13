import { Injectable } from '@nestjs/common';
import { NotificationType } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { RedisService } from '../../redis/redis.service';
import { WsServerEvents } from '@xenonchat/shared';

@Injectable()
export class NotificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async create(input: {
    userId: string;
    type: NotificationType | string;
    title: string;
    body?: string;
    payload?: unknown;
  }) {
    const n = await this.prisma.notification.create({
      data: {
        userId: input.userId,
        type: input.type as NotificationType,
        title: input.title,
        body: input.body,
        payload: input.payload as object | undefined,
      },
    });
    await this.redis.pub
      .publish(
        `ws:user:${input.userId}`,
        JSON.stringify({
          event: WsServerEvents.NOTIFICATION_NEW,
          payload: {
            id: n.id,
            type: n.type,
            title: n.title,
            body: n.body,
            payload: n.payload,
            created_at: n.createdAt.toISOString(),
          },
        }),
      )
      .catch(() => undefined);
    return n;
  }

  async list(userId: string, limit = 50) {
    const rows = await this.prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return rows.map((n) => ({
      id: n.id,
      type: n.type,
      title: n.title,
      body: n.body,
      payload: n.payload,
      read_at: n.readAt?.toISOString(),
      created_at: n.createdAt.toISOString(),
    }));
  }

  async markRead(userId: string, id?: string) {
    if (id) {
      await this.prisma.notification.updateMany({
        where: { id, userId, readAt: null },
        data: { readAt: new Date() },
      });
    } else {
      await this.prisma.notification.updateMany({
        where: { userId, readAt: null },
        data: { readAt: new Date() },
      });
    }
    return { success: true };
  }

  async unreadCount(userId: string) {
    return this.prisma.notification.count({ where: { userId, readAt: null } });
  }
}
