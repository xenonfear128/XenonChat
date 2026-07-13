'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { FormEvent, Suspense, useState } from 'react';
import { useTranslations } from 'next-intl';
import { AuthShell } from '@/components/auth/AuthShell';
import { Button, Field, Input } from '@/components/ui';
import { ApiError, api } from '@/lib/api';

function ForgotPasswordForm() {
  const t = useTranslations('auth');
  const te = useTranslations('errors');
  const params = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [token, setToken] = useState(params.get('token') ?? '');
  const [error, setError] = useState('');
  const [requested, setRequested] = useState(false);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  const requestReset = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const result = await api.requestPasswordReset(email);
      if (result.reset_token) {
        setToken(result.reset_token);
      } else {
        setRequested(true);
      }
    } catch (err) {
      const code = err instanceof ApiError ? err.code : 'generic';
      setError(te.has(code as never) ? te(code as never) : te('generic'));
    } finally {
      setLoading(false);
    }
  };

  const confirmReset = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await api.confirmPasswordReset({ token, new_password: password });
      setDone(true);
    } catch (err) {
      const code = err instanceof ApiError ? err.code : 'generic';
      setError(te.has(code as never) ? te(code as never) : te('generic'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell
      title={t('forgotTitle')}
      subtitle={t('forgotSubtitle')}
      footer={
        <>
          <Link href="/login">{t('login')}</Link>
        </>
      }
    >
      {done ? (
        <p style={{ margin: 0, color: 'var(--success)' }}>{t('resetSuccess')}</p>
      ) : requested ? (
        <p style={{ margin: 0, color: 'var(--success)' }}>
          {t('resetRequestSuccess')}
        </p>
      ) : token ? (
        <form
          onSubmit={confirmReset}
          style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}
        >
          <Field label={t('newPassword')} htmlFor="password" error={error || undefined}>
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
          <Button type="submit" size="lg" disabled={loading}>
            {t('resetSubmit')}
          </Button>
        </form>
      ) : (
        <form
          onSubmit={requestReset}
          style={{ display: 'flex', flexDirection: 'column', gap: '0.9rem' }}
        >
          <Field label={t('email')} htmlFor="email" error={error || undefined}>
            <Input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>
          <Button type="submit" size="lg" disabled={loading}>
            {t('resetRequestSubmit')}
          </Button>
        </form>
      )}
    </AuthShell>
  );
}

export default function ForgotPasswordPage() {
  return (
    <Suspense fallback={null}>
      <ForgotPasswordForm />
    </Suspense>
  );
}
