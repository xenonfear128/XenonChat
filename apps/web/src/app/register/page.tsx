'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { AuthShell } from '@/components/auth/AuthShell';
import { Button, Field, Input } from '@/components/ui';
import { ApiError, api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';

export default function RegisterPage() {
  const t = useTranslations('auth');
  const te = useTranslations('errors');
  const router = useRouter();
  const setSession = useAuthStore((s) => s.setSession);
  const hydrated = useAuthStore((s) => s.hydrated);
  const accessToken = useAuthStore((s) => s.accessToken);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [nickname, setNickname] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (hydrated && accessToken) router.replace('/chats');
  }, [accessToken, hydrated, router]);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await api.register({ email, password, username, nickname });
      setSession({
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        user: data.user,
      });
      router.replace('/chats');
    } catch (err) {
      const code = err instanceof ApiError ? err.code : 'generic';
      setError(te.has(code as never) ? te(code as never) : te('generic'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      title={t('registerTitle')}
      subtitle={t('registerSubtitle')}
      footer={
        <>
          {t('hasAccount')} <Link href="/login">{t('login')}</Link>
        </>
      }
    >
      <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
        <Field label={t('email')} htmlFor="email" error={error || undefined}>
          <Input
            id="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        <Field label={t('username')} htmlFor="username">
          <Input
            id="username"
            required
            minLength={4}
            maxLength={32}
            pattern="[A-Za-z0-9_]+"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
        </Field>
        <Field label={t('nickname')} htmlFor="nickname">
          <Input
            id="nickname"
            required
            maxLength={64}
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
          />
        </Field>
        <Field label={t('password')} htmlFor="password">
          <Input
            id="password"
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        <Button type="submit" size="lg" disabled={loading}>
          {loading ? t('registering') : t('register')}
        </Button>
      </form>
    </AuthShell>
  );
}
