import { Injectable, OnModuleInit } from '@nestjs/common';
import { WebSocket } from 'ws';
import { RedisService } from '../../redis/redis.service';
import { PrismaService } from '../../prisma/prisma.service';
import { WsEnvelope } from '@xenonchat/shared';

type ClientState = {
  userId: string;
  socket: WebSocket;
  queue: number;
};

@Injectable()
export class RealtimeService implements OnModuleInit {
  private clients = new Map<WebSocket, ClientState>();
  private userSockets = new Map<string, Set<WebSocket>>();

  constructor(
    private readonly redis: RedisService,
    private readonly prisma: PrismaService,
  ) {}

  async onModuleInit() {
    try {
      if (this.redis.client.status !== 'ready') await this.redis.connect();
    } catch {
      /* redis optional at boot */
    }
    this.redis.sub.on('message', (channel, message) => {
      try {
        const envelope = JSON.parse(message) as WsEnvelope;
        if (channel.startsWith('ws:user:')) {
          const userId = channel.slice('ws:user:'.length);
          this.sendToUserLocal(userId, envelope);
        } else if (channel.startsWith('ws:conversation:')) {
          const conversationId = channel.slice('ws:conversation:'.length);
          void this.fanoutConversationLocal(conversationId, envelope);
        }
      } catch {
        /* ignore */
      }
    });
    await this.redis.sub.psubscribe('ws:user:*', 'ws:conversation:*').catch(async () => {
      await this.redis.sub.subscribe('__noop__').catch(() => undefined);
    });
    // ioredis psubscribe uses pmessage
    this.redis.sub.on('pmessage', (_pattern, channel, message) => {
      try {
        const envelope = JSON.parse(message) as WsEnvelope;
        if (channel.startsWith('ws:user:')) {
          this.sendToUserLocal(channel.slice('ws:user:'.length), envelope);
        } else if (channel.startsWith('ws:conversation:')) {
          void this.fanoutConversationLocal(channel.slice('ws:conversation:'.length), envelope);
        }
      } catch {
        /* ignore */
      }
    });
  }

  register(userId: string, socket: WebSocket) {
    this.clients.set(socket, { userId, socket, queue: 0 });
    if (!this.userSockets.has(userId)) this.userSockets.set(userId, new Set());
    this.userSockets.get(userId)!.add(socket);
    void this.redis.client.sadd(`online:${userId}`, '1');
    void this.redis.client.set(`presence:${userId}`, 'online', 'EX', 120);
  }

  unregister(socket: WebSocket) {
    const state = this.clients.get(socket);
    if (!state) return;
    this.clients.delete(socket);
    const set = this.userSockets.get(state.userId);
    set?.delete(socket);
    if (set && set.size === 0) {
      this.userSockets.delete(state.userId);
      void this.redis.client.del(`presence:${state.userId}`);
    }
  }

  send(socket: WebSocket, envelope: WsEnvelope) {
    const state = this.clients.get(socket);
    if (!state || socket.readyState !== WebSocket.OPEN) return;
    if (state.queue > 200) {
      socket.close(1008, 'backpressure');
      return;
    }
    state.queue += 1;
    socket.send(JSON.stringify(envelope), () => {
      state.queue = Math.max(0, state.queue - 1);
    });
  }

  sendToUserLocal(userId: string, envelope: WsEnvelope) {
    const set = this.userSockets.get(userId);
    if (!set) return;
    for (const socket of set) this.send(socket, envelope);
  }

  async sendToUser(userId: string, envelope: WsEnvelope) {
    this.sendToUserLocal(userId, envelope);
    await this.redis.pub.publish(`ws:user:${userId}`, JSON.stringify(envelope));
  }

  async broadcastToConversation(conversationId: string, envelope: WsEnvelope) {
    await this.fanoutConversationLocal(conversationId, envelope);
    await this.redis.pub.publish(`ws:conversation:${conversationId}`, JSON.stringify(envelope));
  }

  private async fanoutConversationLocal(conversationId: string, envelope: WsEnvelope) {
    const members = await this.prisma.conversationMember.findMany({
      where: { conversationId, leftAt: null },
      select: { userId: true },
    });
    for (const m of members) {
      this.sendToUserLocal(m.userId, envelope);
    }
  }
}
