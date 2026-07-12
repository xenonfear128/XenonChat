'use client';

import { useTranslations } from 'next-intl';
import { Avatar } from '@/components/ui';
import { MarkdownBody } from './MarkdownBody';
import { LinkPreviewCard } from './LinkPreviewCard';
import type { ChatMessage } from '@/types';
import styles from './MessageBubble.module.css';

function formatTime(iso: string) {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

export function MessageBubble({
  message,
  mine,
  onQuote,
  onRevoke,
  onDelete,
}: {
  message: ChatMessage;
  mine: boolean;
  onQuote?: (m: ChatMessage) => void;
  onRevoke?: (m: ChatMessage) => void;
  onDelete?: (m: ChatMessage) => void;
}) {
  const t = useTranslations('chat');
  const revoked = !!message.revoked_at || message.message_type === 'deleted';
  const name = message.sender?.nickname || message.sender?.user_id || 'User';

  return (
    <div
      className={`${styles.row} ${mine ? styles.mine : styles.theirs} ${message.pending ? styles.pending : ''} ${message.failed ? styles.failed : ''}`}
    >
      {!mine ? <Avatar name={name} src={message.sender?.avatar_url} size={34} /> : null}
      <div className={styles.stack}>
        {!mine ? <div className={styles.name}>{name}</div> : null}
        <div className={styles.bubble}>
          {message.quote ? (
            <div className={styles.quote}>
              <strong>{message.quote.quoted_sender_display_name || t('quote')}</strong>
              <span>{message.quote.snapshot_text || '…'}</span>
            </div>
          ) : null}

          {revoked ? (
            <em className={styles.revoked}>{t('revoke')}</em>
          ) : message.message_type === 'image' && message.attachments?.[0] ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              className={styles.image}
              src={message.attachments[0].url || ''}
              alt={message.attachments[0].original_name || 'image'}
            />
          ) : message.message_type === 'file' && message.attachments?.[0] ? (
            <a
              className={styles.file}
              href={message.attachments[0].url || '#'}
              target="_blank"
              rel="noreferrer"
            >
              📎 {message.attachments[0].original_name || 'File'}
            </a>
          ) : message.message_type === 'voice' && message.attachments?.[0]?.url ? (
            <audio className={styles.voice} controls preload="metadata" src={message.attachments[0].url}>
              {t('voice')}
            </audio>
          ) : message.message_type === 'voice' ? (
            <div className={styles.voice}>🎙 {t('voice')}</div>
          ) : message.message_type === 'video' && message.attachments?.[0]?.url ? (
            <video className={styles.image} controls preload="metadata" src={message.attachments[0].url} />
          ) : (
            <MarkdownBody
              content={message.body || ''}
              formatMode={message.format_mode || 'plain'}
            />
          )}

          {message.link_previews?.map((p) => (
            <LinkPreviewCard key={p.id} preview={p} />
          ))}
        </div>
        <div className={styles.meta}>
          <time>{formatTime(message.created_at)}</time>
          {message.failed ? <span>{t('sendFailed')}</span> : null}
          <div className={styles.actions}>
            {!revoked && onQuote ? (
              <button type="button" onClick={() => onQuote(message)}>
                {t('quote')}
              </button>
            ) : null}
            {mine && !revoked && onRevoke ? (
              <button type="button" onClick={() => onRevoke(message)}>
                {t('revoke')}
              </button>
            ) : null}
            {onDelete ? (
              <button type="button" onClick={() => onDelete(message)}>
                {t('deleteForMe')}
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
