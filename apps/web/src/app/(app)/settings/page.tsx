'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { wsClient } from '@/lib/ws';
import { useAuthStore } from '@/stores/auth';
import {
  Avatar,
  Button,
  Field,
  Input,
  Segmented,
  Spinner,
  Textarea,
} from '@/components/ui';
import type { CornerStyle, Locale, PrivacySettings, ThemeMode } from '@/types';
import styles from './settings.module.css';

type Tab = 'profile' | 'appearance' | 'privacy' | 'devices' | 'security';

export default function SettingsPage() {
  const t = useTranslations('settings');
  const tc = useTranslations('common');
  const router = useRouter();
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const applyPreferences = useAuthStore((s) => s.applyPreferences);
  const clear = useAuthStore((s) => s.clear);
  const [tab, setTab] = useState<Tab>('profile');
  const [nickname, setNickname] = useState(user?.nickname || '');
  const [bio, setBio] = useState(user?.bio || '');
  const [username, setUsername] = useState(user?.user_id || '');
  const [theme, setTheme] = useState<ThemeMode>((user?.theme as ThemeMode) || 'system');
  const [corner, setCorner] = useState<CornerStyle>((user?.corner_style as CornerStyle) || 'soft');
  const [language, setLanguage] = useState<Locale>((user?.language as Locale) || 'zh-CN');
  const [privacy, setPrivacy] = useState<PrivacySettings | null>(null);
  const [saved, setSaved] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [securityMsg, setSecurityMsg] = useState('');

  const meQuery = useQuery({
    queryKey: ['me'],
    queryFn: () => api.me(),
  });

  const devicesQuery = useQuery({
    queryKey: ['devices'],
    queryFn: () => api.devices(),
    enabled: tab === 'devices',
  });

  useEffect(() => {
    if (!meQuery.data) return;
    setUser(meQuery.data);
    setNickname(meQuery.data.nickname);
    setBio(meQuery.data.bio || '');
    setUsername(meQuery.data.user_id);
    setTheme((meQuery.data.theme as ThemeMode) || 'system');
    setCorner((meQuery.data.corner_style as CornerStyle) || 'soft');
    setLanguage((meQuery.data.language as Locale) || 'zh-CN');
    if (meQuery.data.privacy) setPrivacy(meQuery.data.privacy);
  }, [meQuery.data, setUser]);

  const saveProfile = useMutation({
    mutationFn: () =>
      api.updateMe({
        nickname,
        bio,
        username: username !== user?.user_id ? username : undefined,
      }),
    onSuccess: (u) => {
      setUser(u);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    },
  });

  const saveAppearance = useMutation({
    mutationFn: () =>
      api.updateMe({
        theme,
        corner_style: corner,
        language,
      }),
    onSuccess: (u) => {
      setUser(u);
      applyPreferences({ theme, corner_style: corner, language });
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
      // reload to apply next-intl locale cookie
      if (language !== user?.language) {
        window.location.reload();
      }
    },
  });

  const savePrivacy = useMutation({
    mutationFn: () => api.updatePrivacy(privacy || {}),
    onSuccess: (p) => {
      setPrivacy(p);
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
    },
  });

  const changePw = useMutation({
    mutationFn: () =>
      api.changePassword({
        current_password: currentPassword,
        new_password: newPassword,
      }),
    onSuccess: () => {
      setCurrentPassword('');
      setNewPassword('');
      setSecurityMsg(t('saved'));
    },
    onError: () => setSecurityMsg('Failed'),
  });

  const revokeMut = useMutation({
    mutationFn: (id: string) => api.revokeDevice(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['devices'] }),
  });

  const logout = async () => {
    try {
      await api.logout();
    } catch {
      // ignore
    }
    wsClient.disconnect();
    clear();
    router.replace('/login');
  };

  const onProfile = (e: FormEvent) => {
    e.preventDefault();
    saveProfile.mutate();
  };

  if (meQuery.isLoading) {
    return (
      <div className={styles.page}>
        <Spinner />
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1>{t('title')}</h1>
        {saved ? <span className={styles.saved}>{t('saved')}</span> : null}
      </header>

      <div className={styles.layout}>
        <aside className={styles.tabs}>
          {(
            [
              ['profile', t('profile')],
              ['appearance', t('appearance')],
              ['privacy', t('privacy')],
              ['devices', t('devices')],
              ['security', t('security')],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              className={tab === key ? styles.tabActive : undefined}
              onClick={() => setTab(key)}
            >
              {label}
            </button>
          ))}
          <Button variant="danger" onClick={() => void logout()}>
            {t('logout')}
          </Button>
        </aside>

        <section className={styles.panel}>
          {tab === 'profile' ? (
            <form onSubmit={onProfile} className={styles.form}>
              <div className={styles.avatarRow}>
                <Avatar name={nickname || 'U'} src={user?.avatar_url} size={64} />
                <div>
                  <strong>{user?.nickname}</strong>
                  <p>@{user?.user_id}</p>
                </div>
              </div>
              <Field label={t('nickname')} htmlFor="nickname">
                <Input id="nickname" value={nickname} onChange={(e) => setNickname(e.target.value)} />
              </Field>
              <Field label={t('username')} htmlFor="username">
                <Input id="username" value={username} onChange={(e) => setUsername(e.target.value)} />
              </Field>
              <Field label={t('bio')} htmlFor="bio">
                <Textarea id="bio" value={bio} onChange={(e) => setBio(e.target.value)} maxLength={300} />
              </Field>
              <Button type="submit" disabled={saveProfile.isPending}>
                {tc('save')}
              </Button>
            </form>
          ) : null}

          {tab === 'appearance' ? (
            <div className={styles.form}>
              <div>
                <h3>{t('theme')}</h3>
                <Segmented
                  value={theme}
                  onChange={setTheme}
                  options={[
                    { value: 'light', label: t('themeLight') },
                    { value: 'dark', label: t('themeDark') },
                    { value: 'system', label: t('themeSystem') },
                  ]}
                />
              </div>
              <div>
                <h3>{t('corner')}</h3>
                <Segmented
                  value={corner}
                  onChange={setCorner}
                  options={[
                    { value: 'square', label: t('cornerSquare') },
                    { value: 'soft', label: t('cornerSoft') },
                    { value: 'round', label: t('cornerRound') },
                  ]}
                />
              </div>
              <div>
                <h3>{t('language')}</h3>
                <Segmented
                  value={language}
                  onChange={setLanguage}
                  options={[
                    { value: 'zh-CN', label: t('langZh') },
                    { value: 'en-US', label: t('langEn') },
                  ]}
                />
              </div>
              <Button onClick={() => saveAppearance.mutate()} disabled={saveAppearance.isPending}>
                {tc('save')}
              </Button>
            </div>
          ) : null}

          {tab === 'privacy' && privacy ? (
            <div className={styles.form}>
              {(
                [
                  ['searchable_by_username', t('searchable')],
                  ['show_online_status', t('showOnline')],
                  ['show_moments', t('showMoments')],
                  ['show_bio', t('showBio')],
                  ['allow_stranger_dm', t('allowStrangerDm')],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className={styles.check}>
                  <input
                    type="checkbox"
                    checked={!!privacy[key]}
                    onChange={(e) => setPrivacy({ ...privacy, [key]: e.target.checked })}
                  />
                  {label}
                </label>
              ))}
              <Field label={t('friendPolicy')}>
                <select
                  className={styles.select}
                  value={privacy.friend_request_policy}
                  onChange={(e) =>
                    setPrivacy({
                      ...privacy,
                      friend_request_policy: e.target.value as PrivacySettings['friend_request_policy'],
                    })
                  }
                >
                  <option value="everyone">{t('policyEveryone')}</option>
                  <option value="mutual_groups">{t('policyMutual')}</option>
                  <option value="nobody">{t('policyNobody')}</option>
                </select>
              </Field>
              <Button onClick={() => savePrivacy.mutate()} disabled={savePrivacy.isPending}>
                {tc('save')}
              </Button>
            </div>
          ) : null}

          {tab === 'privacy' && !privacy ? (
            <p className={styles.muted}>Privacy settings unavailable.</p>
          ) : null}

          {tab === 'devices' ? (
            <div className={styles.form}>
              {devicesQuery.isLoading ? <Spinner /> : null}
              {(devicesQuery.data ?? []).map((d) => (
                <div key={d.id} className={styles.device}>
                  <div>
                    <strong>{d.name}</strong>
                    <p>
                      {d.ip || '—'} · {new Date(d.created_at).toLocaleString()}
                      {d.current ? ` · ${t('thisDevice')}` : ''}
                    </p>
                  </div>
                  {!d.current ? (
                    <Button size="sm" variant="secondary" onClick={() => revokeMut.mutate(d.id)}>
                      {t('revokeDevice')}
                    </Button>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}

          {tab === 'security' ? (
            <form
              className={styles.form}
              onSubmit={(e) => {
                e.preventDefault();
                changePw.mutate();
              }}
            >
              <h3>{t('changePassword')}</h3>
              <Field label={t('currentPassword')} htmlFor="cur">
                <Input
                  id="cur"
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  required
                />
              </Field>
              <Field label={t('newPassword')} htmlFor="new">
                <Input
                  id="new"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  minLength={8}
                  required
                />
              </Field>
              {securityMsg ? <p className={styles.saved}>{securityMsg}</p> : null}
              <Button type="submit" disabled={changePw.isPending}>
                {tc('save')}
              </Button>
            </form>
          ) : null}
        </section>
      </div>
    </div>
  );
}
