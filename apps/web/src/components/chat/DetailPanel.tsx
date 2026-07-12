'use client';

import { useTranslations } from 'next-intl';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { conversationAvatar, conversationTitle } from '@/lib/conversation';
import { Avatar, Button, EmptyState } from '@/components/ui';
import type { ConversationSummary } from '@/types';
import styles from './DetailPanel.module.css';

export function DetailPanel({
  conversation,
  onClose,
}: {
  conversation?: ConversationSummary | null;
  onClose?: () => void;
}) {
  const t = useTranslations('chat');
  const qc = useQueryClient();

  const pinMut = useMutation({
    mutationFn: () => api.pinConversation(conversation!.id, !conversation!.pinned),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['conversations'] }),
  });
  const muteMut = useMutation({
    mutationFn: () => api.muteConversation(conversation!.id, !conversation!.muted),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['conversations'] }),
  });

  if (!conversation) {
    return (
      <aside className={styles.panel}>
        <EmptyState title={t('details')} description={t('selectConversation')} />
      </aside>
    );
  }

  const title = conversationTitle(conversation);

  return (
    <aside className={styles.panel}>
      <header className={styles.header}>
        <h3>{t('details')}</h3>
        {onClose ? (
          <button type="button" className={styles.close} onClick={onClose}>
            ×
          </button>
        ) : null}
      </header>
      <div className={styles.body}>
        <Avatar name={title} src={conversationAvatar(conversation)} size={72} />
        <h2>{title}</h2>
        <p className={styles.sub}>
          {conversation.type === 'group'
            ? `${t('members')}: ${conversation.group?.member_count ?? '—'}`
            : conversation.peer?.user_id
              ? `@${conversation.peer.user_id}`
              : conversation.type}
        </p>

        <div className={styles.actions}>
          <Button variant="secondary" onClick={() => pinMut.mutate()} disabled={pinMut.isPending}>
            {conversation.pinned ? t('unpin') : t('pin')}
          </Button>
          <Button variant="secondary" onClick={() => muteMut.mutate()} disabled={muteMut.isPending}>
            {conversation.muted ? t('unmute') : t('mute')}
          </Button>
        </div>

        {conversation.peer?.bio ? (
          <section className={styles.section}>
            <h4>Bio</h4>
            <p>{conversation.peer.bio}</p>
          </section>
        ) : null}
      </div>
    </aside>
  );
}
