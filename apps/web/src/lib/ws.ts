'use client';

import { WsClientEvents, WsServerEvents, type WsEnvelope } from '@xenonchat/shared';

const WS_URL =
  (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_WS_URL) ||
  'ws://localhost:4000/ws';

type Handler = (payload: unknown, envelope: WsEnvelope) => void;

export class WsClient {
  private ws: WebSocket | null = null;
  private token: string | null = null;
  private handlers = new Map<string, Set<Handler>>();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private intentionalClose = false;
  private retries = 0;

  connect(token: string) {
    this.token = token;
    this.intentionalClose = false;
    this.open();
  }

  disconnect() {
    this.intentionalClose = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.ws?.close();
    this.ws = null;
  }

  updateToken(token: string) {
    this.token = token;
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      // reconnect with new token on next drop; or reopen now
      this.intentionalClose = false;
      this.ws.close();
    } else {
      this.open();
    }
  }

  on(event: string, handler: Handler) {
    if (!this.handlers.has(event)) this.handlers.set(event, new Set());
    this.handlers.get(event)!.add(handler);
    return () => this.off(event, handler);
  }

  off(event: string, handler: Handler) {
    this.handlers.get(event)?.delete(handler);
  }

  send(event: string, payload: unknown, requestId?: string) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return false;
    const envelope: WsEnvelope = { event, payload, request_id: requestId };
    this.ws.send(JSON.stringify(envelope));
    return true;
  }

  ping() {
    this.send(WsClientEvents.PING, { t: Date.now() });
  }

  sendMessage(payload: Record<string, unknown>) {
    return this.send(WsClientEvents.MESSAGE_SEND, payload);
  }

  markRead(conversationId: string, messageId?: string) {
    return this.send(WsClientEvents.MESSAGE_READ, {
      conversation_id: conversationId,
      message_id: messageId,
    });
  }

  typing(conversationId: string, start: boolean) {
    return this.send(start ? WsClientEvents.TYPING_START : WsClientEvents.TYPING_STOP, {
      conversation_id: conversationId,
    });
  }

  get connected() {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  private open() {
    if (!this.token || typeof window === 'undefined') return;
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    const url = `${WS_URL}${WS_URL.includes('?') ? '&' : '?'}token=${encodeURIComponent(this.token)}`;
    const ws = new WebSocket(url);
    this.ws = ws;

    ws.onopen = () => {
      this.retries = 0;
      if (this.pingTimer) clearInterval(this.pingTimer);
      this.pingTimer = setInterval(() => this.ping(), 25000);
      this.emit('__connected', {});
    };

    ws.onmessage = (ev) => {
      try {
        const data = JSON.parse(String(ev.data)) as WsEnvelope;
        this.emit(data.event, data.payload, data);
      } catch {
        // ignore malformed
      }
    };

    ws.onclose = () => {
      if (this.pingTimer) clearInterval(this.pingTimer);
      this.emit('__disconnected', {});
      if (!this.intentionalClose) this.scheduleReconnect();
    };

    ws.onerror = () => {
      // close will fire
    };
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    const delay = Math.min(1000 * 2 ** this.retries, 15000);
    this.retries += 1;
    this.reconnectTimer = setTimeout(() => this.open(), delay);
  }

  private emit(event: string, payload: unknown, envelope?: WsEnvelope) {
    const set = this.handlers.get(event);
    if (!set) return;
    const env = envelope ?? { event, payload };
    set.forEach((h) => h(payload, env));
  }
}

export const wsClient = new WsClient();
export { WsServerEvents, WsClientEvents };
