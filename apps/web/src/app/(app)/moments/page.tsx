'use client';

import { FormEvent, useState } from 'react';
import { useTranslations } from 'next-intl';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';
import { Avatar, Button, EmptyState, Segmented, Spinner, Textarea } from '@/components/ui';
import styles from './moments.module.css';

export default function MomentsPage() {
  const t = useTranslations('moments');
  const qc = useQueryClient();
  const myId = useAuthStore((s) => s.user?.id);
  const [body, setBody] = useState('');
  const [visibility, setVisibility] = useState<'friends' | 'public' | 'private'>('friends');
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});

  const { data, isLoading } = useQuery({
    queryKey: ['moments'],
    queryFn: () => api.momentsFeed(),
  });

  const createMut = useMutation({
    mutationFn: () => api.createMoment({ body, visibility }),
    onSuccess: () => {
      setBody('');
      qc.invalidateQueries({ queryKey: ['moments'] });
    },
  });

  const reactMut = useMutation({
    mutationFn: async (post: { id: string; reacted?: boolean }) => {
      if (post.reacted) return api.unreactMoment(post.id);
      return api.reactMoment(post.id);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['moments'] }),
  });

  const commentMut = useMutation({
    mutationFn: ({ id, text }: { id: string; text: string }) => api.commentMoment(id, text),
    onSuccess: (_d, vars) => {
      setCommentDrafts((s) => ({ ...s, [vars.id]: '' }));
      qc.invalidateQueries({ queryKey: ['moments'] });
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.deleteMoment(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['moments'] }),
  });

  const onCompose = (e: FormEvent) => {
    e.preventDefault();
    if (!body.trim()) return;
    createMut.mutate();
  };

  const items = data ?? [];

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1>{t('title')}</h1>
      </header>

      <form className={styles.composer} onSubmit={onCompose}>
        <h2>{t('compose')}</h2>
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={t('placeholder')}
          maxLength={2000}
        />
        <div className={styles.composerFooter}>
          <Segmented
            value={visibility}
            onChange={setVisibility}
            options={[
              { value: 'friends', label: t('friends') },
              { value: 'public', label: t('public') },
              { value: 'private', label: t('private') },
            ]}
          />
          <Button type="submit" disabled={createMut.isPending || !body.trim()}>
            {t('post')}
          </Button>
        </div>
      </form>

      {isLoading ? <Spinner /> : null}
      {!isLoading && items.length === 0 ? <EmptyState title={t('empty')} /> : null}

      <div className={styles.feed}>
        {items.map((post) => (
          <article key={post.id} className={styles.post}>
            <header className={styles.postHeader}>
              <Avatar name={post.author.nickname} src={post.author.avatar_url} size={40} />
              <div>
                <strong>{post.author.nickname}</strong>
                <time>{new Date(post.created_at).toLocaleString()}</time>
              </div>
              {post.author.id === myId ? (
                <Button size="sm" variant="ghost" onClick={() => deleteMut.mutate(post.id)}>
                  {t('delete')}
                </Button>
              ) : null}
            </header>
            {post.body ? <p className={styles.body}>{post.body}</p> : null}
            <div className={styles.postActions}>
              <button type="button" onClick={() => reactMut.mutate(post)}>
                {t('like')} · {post.reactions_count ?? post.reaction_count ?? 0}
              </button>
            </div>
            <div className={styles.comments}>
              <h4>{t('comments')}</h4>
              {(post.comments ?? []).map((c) => (
                <div key={c.id} className={styles.comment}>
                  <strong>{c.author?.nickname || 'User'}</strong>
                  <span>{c.body}</span>
                </div>
              ))}
              <div className={styles.commentForm}>
                <input
                  value={commentDrafts[post.id] || ''}
                  onChange={(e) =>
                    setCommentDrafts((s) => ({ ...s, [post.id]: e.target.value }))
                  }
                  placeholder={t('commentPlaceholder')}
                />
                <Button
                  size="sm"
                  onClick={() =>
                    commentMut.mutate({ id: post.id, text: commentDrafts[post.id] || '' })
                  }
                  disabled={!commentDrafts[post.id]?.trim()}
                >
                  {t('comment')}
                </Button>
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
