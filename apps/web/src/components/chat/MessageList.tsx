'use client';

import { useEffect, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useTranslations } from 'next-intl';
import { MessageBubble } from './MessageBubble';
import { EmptyState, Spinner } from '@/components/ui';
import type { ChatMessage } from '@/types';
import styles from './MessageList.module.css';

export function MessageList({
  messages,
  myUserId,
  loading,
  onQuote,
  onRevoke,
  onDelete,
  onLoadMore,
  hasMore,
}: {
  messages: ChatMessage[];
  myUserId?: string;
  loading?: boolean;
  onQuote?: (m: ChatMessage) => void;
  onRevoke?: (m: ChatMessage) => void;
  onDelete?: (m: ChatMessage) => void;
  onLoadMore?: () => void;
  hasMore?: boolean;
}) {
  const t = useTranslations('chat');
  const parentRef = useRef<HTMLDivElement>(null);
  const stickToBottom = useRef(true);

  const virtualizer = useVirtualizer({
    count: messages.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 96,
    overscan: 12,
  });

  useEffect(() => {
    if (!stickToBottom.current || messages.length === 0) return;
    const last = messages.length - 1;
    virtualizer.scrollToIndex(last, { align: 'end' });
  }, [messages.length, virtualizer]);

  const onScroll = () => {
    const el = parentRef.current;
    if (!el) return;
    const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
    stickToBottom.current = dist < 80;
    if (el.scrollTop < 80 && hasMore && onLoadMore) onLoadMore();
  };

  if (loading && messages.length === 0) return <Spinner />;

  if (!loading && messages.length === 0) {
    return <EmptyState title={t('emptyThread')} />;
  }

  return (
    <div ref={parentRef} className={styles.scroller} onScroll={onScroll}>
      <div
        className={styles.inner}
        style={{ height: virtualizer.getTotalSize() }}
      >
        {virtualizer.getVirtualItems().map((item) => {
          const message = messages[item.index];
          return (
            <div
              key={message.id}
              className={styles.item}
              data-index={item.index}
              ref={virtualizer.measureElement}
              style={{ transform: `translateY(${item.start}px)` }}
            >
              <MessageBubble
                message={message}
                mine={message.sender_user_id === myUserId}
                onQuote={onQuote}
                onRevoke={onRevoke}
                onDelete={onDelete}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
