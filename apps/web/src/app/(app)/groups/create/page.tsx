'use client';

import { FormEvent, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useQuery } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { Avatar, Button, Field, Input, Textarea } from '@/components/ui';
import styles from './create.module.css';

export default function CreateGroupPage() {
  const t = useTranslations('groups');
  const te = useTranslations('errors');
  const router = useRouter();
  const [publicId, setPublicId] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const contactsQuery = useQuery({
    queryKey: ['contacts'],
    queryFn: () => api.contacts(),
  });

  const selectedSet = useMemo(() => new Set(selected), [selected]);

  const toggle = (id: string) => {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const group = (await api.createGroup({
        public_id: publicId,
        name,
        description: description || undefined,
        member_ids: selected,
      })) as { conversation_id?: string; id?: string; conversation?: { id: string } };

      const conversationId =
        group.conversation_id || group.conversation?.id || group.id;
      if (conversationId) router.push(`/chats/${conversationId}`);
      else router.push('/chats');
    } catch (err) {
      const code = err instanceof ApiError ? err.code : 'generic';
      setError(te.has(code as never) ? te(code as never) : te('generic'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.page}>
      <form className={styles.panel} onSubmit={onSubmit}>
        <h1>{t('createTitle')}</h1>
        <Field label={t('publicId')} htmlFor="publicId" error={error || undefined}>
          <Input
            id="publicId"
            required
            minLength={4}
            maxLength={64}
            pattern="[A-Za-z0-9_]+"
            value={publicId}
            onChange={(e) => setPublicId(e.target.value)}
          />
        </Field>
        <Field label={t('name')} htmlFor="name">
          <Input
            id="name"
            required
            maxLength={100}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <Field label={t('description')} htmlFor="description">
          <Textarea
            id="description"
            maxLength={500}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </Field>

        <div>
          <h2>{t('members')}</h2>
          <div className={styles.members}>
            {(contactsQuery.data ?? []).map((c) => (
              <label key={c.user.id} className={styles.member}>
                <input
                  type="checkbox"
                  checked={selectedSet.has(c.user.id)}
                  onChange={() => toggle(c.user.id)}
                />
                <Avatar name={c.user.nickname} src={c.user.avatar_url} size={32} />
                <span>{c.remark || c.user.nickname}</span>
              </label>
            ))}
          </div>
        </div>

        <div className={styles.actions}>
          <Button type="button" variant="secondary" onClick={() => router.back()}>
            Cancel
          </Button>
          <Button type="submit" disabled={loading}>
            {loading ? t('creating') : t('create')}
          </Button>
        </div>
      </form>
    </div>
  );
}
