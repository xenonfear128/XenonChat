import { describe, expect, it } from 'vitest';
import { conversationAvatar, conversationTitle } from './conversation';
import type { ConversationSummary } from '@/types';

describe('conversation display helpers', () => {
  it('uses peer data for direct conversations', () => {
    const conversation = {
      id: 'direct',
      type: 'direct',
      updated_at: new Date().toISOString(),
      pinned: false,
      muted: false,
      unread_count: 0,
      title: '',
      peer: {
        id: 'peer',
        user_id: 'alice',
        nickname: 'Alice',
        avatar_url: '/alice.png',
      },
    } satisfies ConversationSummary;

    expect(conversationTitle(conversation)).toBe('Alice');
    expect(conversationAvatar(conversation)).toBe('/alice.png');
  });

  it('uses group metadata and safe fallbacks', () => {
    const conversation = {
      id: 'group',
      type: 'group',
      updated_at: new Date().toISOString(),
      pinned: false,
      muted: false,
      unread_count: 0,
      title: '',
      group: { id: 'group-id', name: 'Xenon Lounge' },
    } satisfies ConversationSummary;

    expect(conversationTitle(conversation)).toBe('Xenon Lounge');
    expect(conversationTitle(undefined)).toBe('Chat');
    expect(conversationAvatar(undefined)).toBeNull();
  });
});
