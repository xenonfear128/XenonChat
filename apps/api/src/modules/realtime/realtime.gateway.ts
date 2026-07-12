import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
} from '@nestjs/websockets';
import { WebSocket } from 'ws';
import { Inject, forwardRef } from '@nestjs/common';
import { AuthService } from '../auth/auth.service';
import { RealtimeService } from './realtime.service';
import { MessagesService } from '../messages/messages.service';
import { ConversationsService } from '../conversations/conversations.service';
import { WsClientEvents, WsServerEvents, WsEnvelope } from '@xenonchat/shared';

@WebSocketGateway({ path: '/ws' })
export class RealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect {
  constructor(
    private readonly auth: AuthService,
    private readonly realtime: RealtimeService,
    @Inject(forwardRef(() => MessagesService))
    private readonly messages: MessagesService,
    private readonly conversations: ConversationsService,
  ) {}

  async handleConnection(client: WebSocket, ...args: unknown[]) {
    try {
      const req = args[0] as { url?: string; headers?: Record<string, string> };
      const url = new URL(req.url ?? '', 'http://localhost');
      const token =
        url.searchParams.get('token') ||
        (req.headers?.authorization?.startsWith('Bearer ')
          ? req.headers.authorization.slice(7)
          : null);
      if (!token) {
        client.close(4401, 'unauthorized');
        return;
      }
      const user = await this.auth.validateAccessToken(token);
      (client as WebSocket & { userId?: string }).userId = user.id;
      this.realtime.register(user.id, client);
      this.realtime.send(client, {
        event: WsServerEvents.SESSION,
        payload: { user_id: user.id, server_time: new Date().toISOString() },
      });
    } catch {
      client.close(4401, 'unauthorized');
    }
  }

  handleDisconnect(client: WebSocket) {
    this.realtime.unregister(client);
  }

  @SubscribeMessage(WsClientEvents.PING)
  handlePing(@ConnectedSocket() client: WebSocket) {
    this.realtime.send(client, { event: WsServerEvents.PONG, payload: { t: Date.now() } });
  }

  @SubscribeMessage(WsClientEvents.MESSAGE_SEND)
  async handleSend(
    @ConnectedSocket() client: WebSocket,
    @MessageBody() body: WsEnvelope['payload'],
  ) {
    const userId = (client as WebSocket & { userId?: string }).userId;
    if (!userId) return;
    try {
      const message = await this.messages.send(userId, body);
      this.realtime.send(client, {
        event: WsServerEvents.MESSAGE_ACK,
        payload: {
          client_message_id: message.client_message_id,
          message_id: message.id,
          message,
        },
      });
    } catch (e) {
      this.realtime.send(client, {
        event: WsServerEvents.ERROR,
        payload: {
          code: (e as { code?: string }).code ?? 'INTERNAL_ERROR',
          message: e instanceof Error ? e.message : 'error',
          retry_after_ms: (e as { retryAfterMs?: number }).retryAfterMs,
        },
      });
    }
  }

  @SubscribeMessage(WsClientEvents.MESSAGE_READ)
  async handleRead(
    @ConnectedSocket() client: WebSocket,
    @MessageBody() body: { conversation_id: string; message_id?: string },
  ) {
    const userId = (client as WebSocket & { userId?: string }).userId;
    if (!userId) return;
    await this.conversations.markRead(userId, body.conversation_id, body.message_id);
    await this.realtime.broadcastToConversation(body.conversation_id, {
      event: WsServerEvents.MESSAGE_READ,
      payload: {
        conversation_id: body.conversation_id,
        user_id: userId,
        message_id: body.message_id,
      },
    });
  }

  @SubscribeMessage(WsClientEvents.TYPING_START)
  async typingStart(
    @ConnectedSocket() client: WebSocket,
    @MessageBody() body: { conversation_id: string },
  ) {
    const userId = (client as WebSocket & { userId?: string }).userId;
    if (!userId) return;
    await this.realtime.broadcastToConversation(body.conversation_id, {
      event: WsServerEvents.TYPING_START,
      payload: { conversation_id: body.conversation_id, user_id: userId },
    });
  }

  @SubscribeMessage(WsClientEvents.TYPING_STOP)
  async typingStop(
    @ConnectedSocket() client: WebSocket,
    @MessageBody() body: { conversation_id: string },
  ) {
    const userId = (client as WebSocket & { userId?: string }).userId;
    if (!userId) return;
    await this.realtime.broadcastToConversation(body.conversation_id, {
      event: WsServerEvents.TYPING_STOP,
      payload: { conversation_id: body.conversation_id, user_id: userId },
    });
  }
}
