'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Avatar, Button, EmptyState, Input, Modal, Spinner, Textarea } from '@/components/ui';
import styles from './contacts.module.css';

export default function ContactsPage() {
  const t = useTranslations('contacts');
  const router = useRouter();
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<Awaited<ReturnType<typeof api.searchUsers>>>([]);
  const [requestUserId, setRequestUserId] = useState<string | null>(null);
  const [requestMsg, setRequestMsg] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['contacts'],
    queryFn: () => api.contacts(),
  });

  const dmMut = useMutation({
    mutationFn: (userId: string) => api.createDirect(userId),
    onSuccess: (conv) => router.push(`/chats/${conv.id}`),
  });

  const removeMut = useMutation({
    mutationFn: (userId: string) => api.removeContact(userId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['contacts'] }),
  });

  const blockMut = useMutation({
    mutationFn: (userId: string) => api.blockUser(userId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contacts'] });
      qc.invalidateQueries({ queryKey: ['blocks'] });
    },
  });

  const requestMut = useMutation({
    mutationFn: () =>
      api.sendFriendRequest({ to_user_id: requestUserId!, message: requestMsg || undefined }),
    onSuccess: () => {
      setRequestUserId(null);
      setRequestMsg('');
      qc.invalidateQueries({ queryKey: ['friend-requests'] });
    },
  });

  const onSearch = async () => {
    if (!q.trim()) return;
    setSearching(true);
    try {
      setResults(await api.searchUsers(q.trim()));
    } finally {
      setSearching(false);
    }
  };

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1>{t('title')}</h1>
        <div className={styles.links}>
          <Link href="/contacts/requests">{t('requests')}</Link>
          <Link href="/contacts/blocks">{t('blocks')}</Link>
        </div>
      </header>

      <section className={styles.searchBox}>
        <p className={styles.hint}>{t('searchHint')}</p>
        <div className={styles.searchRow}>
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t('searchPlaceholder')}
            onKeyDown={(e) => e.key === 'Enter' && void onSearch()}
          />
          <Button onClick={() => void onSearch()} disabled={searching}>
            {t('addFriend')}
          </Button>
        </div>
        {results.length > 0 ? (
          <div className={styles.list}>
            {results.map((u) => (
              <div key={u.id} className={styles.row}>
                <Avatar name={u.nickname} src={u.avatar_url} size={42} />
                <div className={styles.meta}>
                  <strong>{u.nickname}</strong>
                  <span>@{u.user_id}</span>
                </div>
                <Button size="sm" onClick={() => setRequestUserId(u.id)}>
                  {t('sendRequest')}
                </Button>
              </div>
            ))}
          </div>
        ) : null}
      </section>

      <section className={styles.listSection}>
        {isLoading ? <Spinner /> : null}
        {!isLoading && (data?.length ?? 0) === 0 ? (
          <EmptyState title={t('noContacts')} />
        ) : null}
        <div className={styles.list}>
          {data?.map((c) => (
            <div key={c.user.id} className={styles.row}>
              <Avatar name={c.remark || c.user.nickname} src={c.user.avatar_url} size={44} />
              <div className={styles.meta}>
                <strong>{c.remark || c.user.nickname}</strong>
                <span>@{c.user.user_id}</span>
              </div>
              <div className={styles.actions}>
                <Button size="sm" onClick={() => dmMut.mutate(c.user.id)}>
                  {t('message')}
                </Button>
                <Button size="sm" variant="secondary" onClick={() => removeMut.mutate(c.user.id)}>
                  {t('remove')}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => blockMut.mutate(c.user.id)}>
                  {t('block')}
                </Button>
              </div>
            </div>
          ))}
        </div>
      </section>

      <Modal
        open={!!requestUserId}
        title={t('sendRequest')}
        onClose={() => setRequestUserId(null)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setRequestUserId(null)}>
              Cancel
            </Button>
            <Button onClick={() => requestMut.mutate()} disabled={requestMut.isPending}>
              {t('sendRequest')}
            </Button>
          </>
        }
      >
        <Textarea
          value={requestMsg}
          onChange={(e) => setRequestMsg(e.target.value)}
          placeholder={t('requestMessage')}
        />
      </Modal>
    </div>
  );
}
