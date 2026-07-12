'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Avatar, Badge, EmptyState, Spinner } from '@/components/ui';
import { conversationAvatar, conversationTitle } from '@/lib/conversation';
import type { ConversationSummary } from '@/types';
import styles from './ConversationList.module.css';

function previewText(c: ConversationSummary) {
  const m = c.last_message;
  if (!m) return '';
  if (m.message_type === 'image') return '🖼';
  if (m.message_type === 'file') return '📎';
  if (m.message_type === 'voice') return '🎙';
  return m.body || '';
}

export function ConversationList({ activeId }: { activeId?: string }) {
  const t = useTranslations('chat');
  const [q, setQ] = useState('');
  const { data, isLoading } = useQuery({
    queryKey: ['conversations'],
    queryFn: () => api.conversations(),
    refetchInterval: 20_000,
  });

  const items = useMemo(() => {
    const list = [...(data ?? [])].sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
    });
    if (!q.trim()) return list;
    const needle = q.trim().toLowerCase();
    return list.filter((c) => conversationTitle(c).toLowerCase().includes(needle));
  }, [data, q]);

  return (
    <div className={styles.panel}>
      <header className={styles.header}>
        <div className={styles.titleRow}>
          <h2>{t('title')}</h2>
          <Link href="/groups/create" className={styles.newBtn}>
            {t('createGroup')}
          </Link>
        </div>
        <input
          className={styles.search}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={t('searchPlaceholder')}
        />
      </header>

      <div className={styles.list}>
        {isLoading ? <Spinner /> : null}
        {!isLoading && items.length === 0 ? (
          <EmptyState title={t('noConversations')} />
        ) : null}
        {items.map((c) => {
          const title = conversationTitle(c);
          return (
            <Link
              key={c.id}
              href={`/chats/${c.id}`}
              className={`${styles.item} ${activeId === c.id ? styles.active : ''}`}
            >
              <Avatar name={title} src={conversationAvatar(c)} size={44} />
              <div className={styles.meta}>
                <div className={styles.top}>
                  <strong>{title}</strong>
                  <time>
                    {c.last_message
                      ? new Date(c.last_message.created_at).toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })
                      : ''}
                  </time>
                </div>
                <div className={styles.bottom}>
                  <span>{previewText(c)}</span>
                  <div className={styles.flags}>
                    {c.muted ? <em>{t('muted')}</em> : null}
                    {c.pinned ? <em>{t('pinned')}</em> : null}
                    {c.unread_count > 0 ? <Badge>{c.unread_count}</Badge> : null}
                  </div>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
