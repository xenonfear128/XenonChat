'use client';

import { create } from 'zustand';
import type { ChatMessage, FormatMode } from '@/types';

type QuoteDraft = {
  quoted_message_id: string;
  quote_type: 'full' | 'partial';
  snapshot_text?: string;
  display_name?: string;
};

type UiState = {
  detailOpen: boolean;
  mobilePane: 'list' | 'chat' | 'detail';
  formatMode: FormatMode;
  composerPreview: boolean;
  quote: QuoteDraft | null;
  setDetailOpen: (v: boolean) => void;
  toggleDetail: () => void;
  setMobilePane: (p: UiState['mobilePane']) => void;
  setFormatMode: (m: FormatMode) => void;
  setComposerPreview: (v: boolean) => void;
  setQuote: (q: QuoteDraft | null) => void;
};

export const useUiStore = create<UiState>((set) => ({
  detailOpen: true,
  mobilePane: 'list',
  formatMode: 'plain',
  composerPreview: false,
  quote: null,
  setDetailOpen: (v) => set({ detailOpen: v }),
  toggleDetail: () => set((s) => ({ detailOpen: !s.detailOpen })),
  setMobilePane: (p) => set({ mobilePane: p }),
  setFormatMode: (m) => set({ formatMode: m }),
  setComposerPreview: (v) => set({ composerPreview: v }),
  setQuote: (q) => set({ quote: q }),
}));

type ChatCacheState = {
  messagesByConversation: Record<string, ChatMessage[]>;
  setMessages: (conversationId: string, messages: ChatMessage[]) => void;
  prependMessages: (conversationId: string, messages: ChatMessage[]) => void;
  appendMessage: (conversationId: string, message: ChatMessage) => void;
  updateMessage: (
    conversationId: string,
    messageId: string,
    patch: Partial<ChatMessage>,
  ) => void;
  replaceByClientId: (
    conversationId: string,
    clientMessageId: string,
    message: ChatMessage,
  ) => void;
  updateByClientId: (
    conversationId: string,
    clientMessageId: string,
    patch: Partial<ChatMessage>,
  ) => void;
};

export const useChatStore = create<ChatCacheState>((set) => ({
  messagesByConversation: {},
  setMessages: (conversationId, messages) =>
    set((s) => ({
      messagesByConversation: {
        ...s.messagesByConversation,
        [conversationId]: messages,
      },
    })),
  prependMessages: (conversationId, messages) =>
    set((s) => {
      const existing = s.messagesByConversation[conversationId] ?? [];
      const ids = new Set(existing.map((m) => m.id));
      const merged = [...messages.filter((m) => !ids.has(m.id)), ...existing];
      return {
        messagesByConversation: {
          ...s.messagesByConversation,
          [conversationId]: merged,
        },
      };
    }),
  appendMessage: (conversationId, message) =>
    set((s) => {
      const existing = s.messagesByConversation[conversationId] ?? [];
      if (existing.some((m) => m.id === message.id)) return s;
      if (
        message.client_message_id &&
        existing.some((m) => m.client_message_id === message.client_message_id)
      ) {
        return {
          messagesByConversation: {
            ...s.messagesByConversation,
            [conversationId]: existing.map((m) =>
              m.client_message_id === message.client_message_id ? message : m,
            ),
          },
        };
      }
      return {
        messagesByConversation: {
          ...s.messagesByConversation,
          [conversationId]: [...existing, message],
        },
      };
    }),
  updateMessage: (conversationId, messageId, patch) =>
    set((s) => ({
      messagesByConversation: {
        ...s.messagesByConversation,
        [conversationId]: (s.messagesByConversation[conversationId] ?? []).map(
          (m) => (m.id === messageId ? { ...m, ...patch } : m),
        ),
      },
    })),
  replaceByClientId: (conversationId, clientMessageId, message) =>
    set((s) => ({
      messagesByConversation: {
        ...s.messagesByConversation,
        [conversationId]: (s.messagesByConversation[conversationId] ?? []).map(
          (m) => (m.client_message_id === clientMessageId ? message : m),
        ),
      },
    })),
  updateByClientId: (conversationId, clientMessageId, patch) =>
    set((s) => ({
      messagesByConversation: {
        ...s.messagesByConversation,
        [conversationId]: (s.messagesByConversation[conversationId] ?? []).map(
          (message) =>
            message.client_message_id === clientMessageId
              ? { ...message, ...patch }
              : message,
        ),
      },
    })),
}));
