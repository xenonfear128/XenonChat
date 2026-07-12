'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Avatar, Button, EmptyState, Spinner } from '@/components/ui';
import styles from '../contacts.module.css';

export default function BlocksPage() {
  const t = useTranslations('contacts');
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['blocks'],
    queryFn: () => api.blocks(),
  });

  const unblockMut = useMutation({
    mutationFn: (userId: string) => api.unblockUser(userId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['blocks'] }),
  });

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1>{t('blocks')}</h1>
        <Link href="/contacts">{t('title')}</Link>
      </header>

      <section className={styles.listSection}>
        {isLoading ? <Spinner /> : null}
        {!isLoading && (data?.length ?? 0) === 0 ? (
          <EmptyState title={t('noBlocks')} />
        ) : null}
        <div className={styles.list}>
          {data?.map((b) => {
            const user = b.user;
            return (
              <div key={user.id} className={styles.row}>
                <Avatar name={user.nickname} src={user.avatar_url} size={42} />
                <div className={styles.meta}>
                  <strong>{user.nickname}</strong>
                  <span>@{user.user_id}</span>
                </div>
                <Button size="sm" variant="secondary" onClick={() => unblockMut.mutate(user.id)}>
                  {t('unblock')}
                </Button>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
