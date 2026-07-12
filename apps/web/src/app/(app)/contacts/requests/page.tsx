'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';
import { Avatar, Button, EmptyState, Spinner } from '@/components/ui';
import styles from '../contacts.module.css';

export default function FriendRequestsPage() {
  const t = useTranslations('contacts');
  const qc = useQueryClient();
  const myId = useAuthStore((s) => s.user?.id);

  const { data, isLoading } = useQuery({
    queryKey: ['friend-requests'],
    queryFn: () => api.friendRequests(),
  });

  const acceptMut = useMutation({
    mutationFn: (id: string) => api.acceptFriendRequest(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['friend-requests'] });
      qc.invalidateQueries({ queryKey: ['contacts'] });
    },
  });

  const rejectMut = useMutation({
    mutationFn: (id: string) => api.rejectFriendRequest(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['friend-requests'] }),
  });

  const incomingList = (data ?? []).filter((r) => r.to_user?.id === myId);
  const outgoingList = (data ?? []).filter((r) => r.from_user?.id === myId);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1>{t('requests')}</h1>
        <Link href="/contacts">{t('title')}</Link>
      </header>

      {isLoading ? <Spinner /> : null}

      <section className={styles.listSection}>
        <h2 style={{ margin: '0 0 0.75rem', fontSize: '1.1rem' }}>{t('incoming')}</h2>
        {incomingList.length === 0 ? <EmptyState title={t('noRequests')} /> : null}
        <div className={styles.list}>
          {incomingList.map((r) => (
            <div key={r.id} className={styles.row}>
              <Avatar name={r.from_user.nickname} src={r.from_user.avatar_url} size={42} />
              <div className={styles.meta}>
                <strong>{r.from_user.nickname}</strong>
                <span>{r.message || `@${r.from_user.user_id}`}</span>
              </div>
              <div className={styles.actions}>
                <Button size="sm" onClick={() => acceptMut.mutate(r.id)}>
                  {t('accept')}
                </Button>
                <Button size="sm" variant="secondary" onClick={() => rejectMut.mutate(r.id)}>
                  {t('reject')}
                </Button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className={styles.listSection}>
        <h2 style={{ margin: '0 0 0.75rem', fontSize: '1.1rem' }}>{t('outgoing')}</h2>
        <div className={styles.list}>
          {outgoingList.map((r) => (
            <div key={r.id} className={styles.row}>
              <Avatar name={r.to_user.nickname} src={r.to_user.avatar_url} size={42} />
              <div className={styles.meta}>
                <strong>{r.to_user.nickname}</strong>
                <span>@{r.to_user.user_id}</span>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
