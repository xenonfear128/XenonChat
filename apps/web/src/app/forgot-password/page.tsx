'use client';

import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { useTranslations } from 'next-intl';
import { AuthShell } from '@/components/auth/AuthShell';
import { Button, Field, Input } from '@/components/ui';
import { ApiError, api } from '@/lib/api';

export default function ForgotPasswordPage() {
  const t = useTranslations('auth');
  const te = useTranslations('errors');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await api.resetPassword({ email, new_password: password });
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
      ) : (
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
          <Field label={t('newPassword')} htmlFor="password">
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
            {t('resetSubmit')}
          </Button>
        </form>
      )}
    </AuthShell>
  );
}
