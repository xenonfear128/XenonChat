export const WsClientEvents = {
  MESSAGE_SEND: 'message.send',
  MESSAGE_ACK: 'message.ack',
  MESSAGE_READ: 'message.read',
  TYPING_START: 'typing.start',
  TYPING_STOP: 'typing.stop',
  PING: 'ping',
} as const;

export const WsServerEvents = {
  SESSION: 'session',
  MESSAGE_NEW: 'message.new',
  MESSAGE_ACK: 'message.ack',
  MESSAGE_READ: 'message.read',
  MESSAGE_EDIT: 'message.edit',
  MESSAGE_REVOKE: 'message.revoke',
  MESSAGE_DELETE: 'message.delete',
  TYPING_START: 'typing.start',
  TYPING_STOP: 'typing.stop',
  PRESENCE_UPDATE: 'presence.update',
  GROUP_MEMBER_JOINED: 'group.member.joined',
  GROUP_MEMBER_LEFT: 'group.member.left',
  GROUP_MEMBER_KICKED: 'group.member.kicked',
  GROUP_SETTINGS_UPDATED: 'group.settings.updated',
  GROUP_ANNOUNCEMENT_CREATED: 'group.announcement.created',
  GROUP_ANNOUNCEMENT_PINNED: 'group.announcement.pinned',
  CONVERSATION_UPDATED: 'conversation.updated',
  NOTIFICATION_NEW: 'notification.new',
  ERROR: 'error',
  PONG: 'pong',
} as const;

export type WsEnvelope<T = unknown> = {
  event: string;
  request_id?: string;
  payload: T;
};

export type WsMessageSendPayload = {
  conversation_id: string;
  client_message_id: string;
  message_type: string;
  body?: string;
  format_mode?: string;
  attachment_ids?: string[];
  quote?: {
    quoted_message_id: string;
    quote_type: 'full' | 'partial';
    start_offset?: number;
    end_offset?: number;
    snapshot_text?: string;
  };
  enable_link_preview?: boolean;
};
