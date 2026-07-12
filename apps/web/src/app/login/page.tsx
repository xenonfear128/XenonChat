'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { FormEvent, Suspense, useState } from 'react';
import { useTranslations } from 'next-intl';
import { AuthShell } from '@/components/auth/AuthShell';
import { Button, Field, Input } from '@/components/ui';
import { ApiError, api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';

function LoginForm() {
  const t = useTranslations('auth');
  const te = useTranslations('errors');
  const router = useRouter();
  const params = useSearchParams();
  const setSession = useAuthStore((s) => s.setSession);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await api.login({ email, password, device_name: 'web' });
      setSession({
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        user: data.user,
      });
      router.replace(params.get('next') || '/chats');
    } catch (err) {
      const code = err instanceof ApiError ? err.code : 'generic';
      setError(te.has(code as never) ? te(code as never) : te('generic'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      title={t('loginTitle')}
      subtitle={t('loginSubtitle')}
      footer={
        <>
          {t('noAccount')} <Link href="/register">{t('register')}</Link>
        </>
      }
    >
      <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}>
        <Field label={t('email')} htmlFor="email" error={error || undefined}>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        <Field label={t('password')} htmlFor="password">
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </Field>
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Link href="/forgot-password" style={{ fontSize: '0.88rem' }}>
            {t('forgotLink')}
          </Link>
        </div>
        <Button type="submit" size="lg" disabled={loading}>
          {loading ? t('loggingIn') : t('login')}
        </Button>
      </form>
    </AuthShell>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
