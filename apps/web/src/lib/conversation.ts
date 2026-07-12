import type { ConversationSummary } from '@/types';

export function conversationTitle(c: ConversationSummary | null | undefined): string {
  if (!c) return 'Chat';
  if (c.title) return c.title;
  if (c.type === 'group') return c.group?.name || c.group?.public_id || c.group?.group_id || 'Group';
  return c.peer?.nickname || c.peer?.user_id || 'Direct';
}

export function conversationAvatar(c: ConversationSummary | null | undefined) {
  if (!c) return null;
  return c.avatar_url || c.peer?.avatar_url || c.group?.avatar_url || null;
}
