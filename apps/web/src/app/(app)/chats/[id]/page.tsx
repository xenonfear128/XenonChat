'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { v4 as uuid } from 'uuid';
import { ConversationList } from '@/components/chat/ConversationList';
import { Composer } from '@/components/chat/Composer';
import { MessageList } from '@/components/chat/MessageList';
import { DetailPanel } from '@/components/chat/DetailPanel';
import { Avatar, Spinner } from '@/components/ui';
import { api } from '@/lib/api';
import { wsClient } from '@/lib/ws';
import { useAuthStore } from '@/stores/auth';
import { useChatStore, useUiStore } from '@/stores/ui';
import { conversationAvatar, conversationTitle } from '@/lib/conversation';
import type { ChatMessage, FormatMode } from '@/types';
import styles from '../chats.module.css';

export default function ChatThreadPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const t = useTranslations('chat');
  const router = useRouter();
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const detailOpen = useUiStore((s) => s.detailOpen);
  const toggleDetail = useUiStore((s) => s.toggleDetail);
  const setDetailOpen = useUiStore((s) => s.setDetailOpen);
  const setQuote = useUiStore((s) => s.setQuote);
  const quote = useUiStore((s) => s.quote);
  const messages = useChatStore((s) => s.messagesByConversation[id] ?? []);
  const setMessages = useChatStore((s) => s.setMessages);
  const prependMessages = useChatStore((s) => s.prependMessages);
  const appendMessage = useChatStore((s) => s.appendMessage);
  const updateMessage = useChatStore((s) => s.updateMessage);
  const [hasMore, setHasMore] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const lastMessageId = messages.at(-1)?.id;

  const convQuery = useQuery({
    queryKey: ['conversation', id],
    queryFn: () => api.getConversation(id),
    enabled: !!id,
  });

  const messagesQuery = useQuery({
    queryKey: ['messages', id],
    queryFn: async () => {
      const items = await api.messages(id, { limit: 50 });
      const sorted = [...items].sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
      );
      setMessages(id, sorted);
      setHasMore(items.length >= 50);
      return sorted;
    },
    enabled: !!id,
  });

  useEffect(() => {
    if (!id) return;
    const serverMessageId = lastMessageId?.startsWith('tmp-')
      ? undefined
      : lastMessageId;
    if (!wsClient.markRead(id, serverMessageId)) {
      void api.markRead(id, serverMessageId).then(() => {
        qc.invalidateQueries({ queryKey: ['conversations'] });
      });
    }
  }, [id, lastMessageId, qc]);

  const loadMore = useCallback(async () => {
    if (!hasMore || loadingMore || messages.length === 0) return;
    setLoadingMore(true);
    try {
      const oldest = messages[0];
      const res = await api.messages(id, { before: oldest.id, limit: 40 });
      const items = res;
      const sorted = [...items].sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
      );
      prependMessages(id, sorted);
      setHasMore(items.length >= 40);
    } finally {
      setLoadingMore(false);
    }
  }, [hasMore, loadingMore, messages, id, prependMessages]);

  const send = async (payload: {
    body: string;
    format_mode: FormatMode;
    message_type: 'text' | 'image' | 'file' | 'voice';
    attachment_ids?: string[];
  }) => {
    const client_message_id = uuid();
    const optimistic: ChatMessage = {
      id: `tmp-${client_message_id}`,
      conversation_id: id,
      sender_user_id: user?.id ?? null,
      client_message_id,
      message_type: payload.message_type,
      body: payload.body,
      format_mode: payload.format_mode,
      created_at: new Date().toISOString(),
      sender: user ?? undefined,
      pending: true,
      quote: quote
        ? {
            quoted_message_id: quote.quoted_message_id,
            quote_type: quote.quote_type,
            snapshot_text: quote.snapshot_text,
            quoted_sender_display_name: quote.display_name,
          }
        : null,
    };
    appendMessage(id, optimistic);

    const body = {
      conversation_id: id,
      client_message_id,
      message_type: payload.message_type,
      body: payload.body,
      format_mode: payload.format_mode,
      attachment_ids: payload.attachment_ids,
      quote: quote
        ? {
            quoted_message_id: quote.quoted_message_id,
            quote_type: quote.quote_type,
            snapshot_text: quote.snapshot_text,
          }
        : undefined,
      enable_link_preview: true,
    };

    const sentViaWs = wsClient.sendMessage(body);
    if (!sentViaWs) {
      try {
        const msg = await api.sendMessage(body);
        useChatStore.getState().replaceByClientId(id, client_message_id, msg);
        qc.invalidateQueries({ queryKey: ['conversations'] });
      } catch {
        updateMessage(id, optimistic.id, { pending: false, failed: true });
      }
    } else {
      // A connection may drop after WebSocket.send() succeeds but before the
      // server ACK arrives. Retry through HTTP with the same client_message_id;
      // backend idempotency prevents duplicates.
      window.setTimeout(async () => {
        const current = useChatStore
          .getState()
          .messagesByConversation[id]?.find(
            (message) => message.client_message_id === client_message_id,
          );
        if (!current || (!current.pending && !current.failed)) return;
        try {
          const message = await api.sendMessage(body);
          useChatStore
            .getState()
            .replaceByClientId(id, client_message_id, message);
          void qc.invalidateQueries({ queryKey: ['conversations'] });
        } catch {
          useChatStore.getState().updateByClientId(id, client_message_id, {
            pending: false,
            failed: true,
          });
        }
      }, 8_000);
    }
    setQuote(null);
  };

  const revokeMut = useMutation({
    mutationFn: (messageId: string) => api.revokeMessage(messageId),
    onSuccess: (_d, messageId) => {
      updateMessage(id, messageId, {
        revoked_at: new Date().toISOString(),
        body: null,
        message_type: 'deleted',
      });
    },
  });

  const deleteMut = useMutation({
    mutationFn: (messageId: string) => api.deleteMessage(messageId),
    onSuccess: (_d, messageId) => {
      setMessages(
        id,
        messages.filter((m) => m.id !== messageId),
      );
    },
  });

  const title = conversationTitle(convQuery.data);

  return (
    <div className={styles.threeCol}>
      <div className={`${styles.listCol} ${styles.listColMobileHidden}`}>
        <ConversationList activeId={id} />
      </div>

      <div className={styles.chatCol}>
        <div className={styles.chatStage}>
          <header className={styles.chatHeader}>
            <button type="button" className={styles.backBtn} onClick={() => router.push('/chats')}>
              ←
            </button>
            <Avatar name={title} src={conversationAvatar(convQuery.data)} size={36} />
            <h2>{title}</h2>
            <button
              type="button"
              className={styles.iconBtn}
              onClick={() => toggleDetail()}
              aria-label={t('details')}
            >
              ℹ
            </button>
          </header>

          {messagesQuery.isLoading ? (
            <Spinner />
          ) : (
            <MessageList
              messages={messages}
              myUserId={user?.id}
              hasMore={hasMore}
              onLoadMore={loadMore}
              onQuote={(m) =>
                setQuote({
                  quoted_message_id: m.id,
                  quote_type: 'full',
                  snapshot_text: m.body || undefined,
                  display_name: m.sender?.nickname,
                })
              }
              onRevoke={(m) => revokeMut.mutate(m.id)}
              onDelete={(m) => deleteMut.mutate(m.id)}
            />
          )}

          <Composer onSend={send} />
        </div>
      </div>

      <div
        className={`${styles.detailCol} ${detailOpen ? '' : styles.detailHiddenMobile}`}
        style={detailOpen ? undefined : { display: 'none' }}
      >
        <DetailPanel
          conversation={convQuery.data}
          onClose={() => setDetailOpen(false)}
        />
      </div>
    </div>
  );
}
